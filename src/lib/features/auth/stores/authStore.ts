import { writable, get } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import {
  generateRecoveryPhrase,
  pickRecoveryConfirmationIndices,
  normalizeRecoveryPhrase,
  derivePasswordKey,
  hashString,
  generateTotpSecret,
  buildTotpUri,
  verifyTotp,
  encryptWithSecret,
  decryptWithSecret,
  generateBackupCodes,
  type DeviceHandshakePayload,
} from "$lib/utils/security";
import { userStore } from "$lib/stores/userStore";
import { toasts } from "$lib/stores/ToastStore";
import {
  authPersistenceStore,
  getAuthPersistence,
  setAuthPersistence,
  updateAuthPersistence,
  resetAuthPersistence,
  DEFAULT_SESSION_TIMEOUT,
  type AuthPersistence,
  type TrustedDevice,
  type SecurityQuestion,
  type SetupChecklist,
} from "../persistenceService";
import {
  createDeviceHandshake,
  ingestDeviceHandshake as decodeDeviceHandshakePayload,
  approveDeviceHandshake,
  getDeviceInfo,
} from "../deviceHandshakeService";
import {
  configureSecurityQuestions as configureSecurityQuestionsService,
  prepareSecurityQuestionRecovery,
  finalizeSecurityQuestionRecovery,
} from "../securityService";

type AuthStatus =
  | "checking"
  | "needs_setup"
  | "quickstart"
  | "setup_in_progress"
  | "locked"
  | "recovery_ack_required"
  | "authenticated"
  | "account_locked";

type PasswordPolicy = "unicode_required" | "legacy_allowed" | "enhanced";

type OnboardingState = {
  username: string;
  recoveryPhrase: string[];
  confirmationIndices: number[];
  totpSecret: string;
  totpUri: string;
  password?: string;
};

type PendingRecoveryRotation = {
  newRecoveryPhrase: string[];
  newPassword: string;
  initiatedAt: string;
};

type AuthState = {
  status: AuthStatus;
  loading: boolean;
  error: string | null;
  setupChecklist: SetupChecklist;
  temporarySessionKey: string | null;
  onboarding: OnboardingState | null;
  pendingDeviceLogin: DeviceHandshakePayload | null;
  pendingRecoveryRotation: PendingRecoveryRotation | null;
  requireTotpOnUnlock: boolean;
  passwordPolicy: PasswordPolicy;
  failedAttempts: number;
  accountLocked: boolean;
  accountLockedUntil: Date | null;
  sessionTimeoutMinutes: number;
  trustedDevices: TrustedDevice[];
  securityQuestionsConfigured: boolean;
  highRiskBlocked: boolean;
};

export const MIN_PASSWORD_LENGTH = 12;
const MAX_FAILED_ATTEMPTS = 5;
const ACCOUNT_LOCKOUT_MINUTES = 15;

const initialState: AuthState = {
  status: "checking",
  loading: true,
  error: null,
  setupChecklist: {
    quickstart: false,
    recoverySaved: false,
    totpVerified: false,
  },
  temporarySessionKey: null,
  onboarding: null,
  pendingDeviceLogin: null,
  pendingRecoveryRotation: null,
  requireTotpOnUnlock: false,
  passwordPolicy: "unicode_required",
  failedAttempts: 0,
  accountLocked: false,
  accountLockedUntil: null,
  sessionTimeoutMinutes: DEFAULT_SESSION_TIMEOUT,
  trustedDevices: [],
  securityQuestionsConfigured: false,
  highRiskBlocked: true,
};

const { subscribe, update } = writable<AuthState>(initialState);

const resolveChecklist = (persisted?: AuthPersistence): SetupChecklist => ({
  quickstart: persisted?.setupChecklist?.quickstart ?? false,
  recoverySaved:
    persisted?.setupChecklist?.recoverySaved ??
    Boolean(persisted?.recoveryEnvelope && persisted?.recoveryHash),
  totpVerified:
    persisted?.setupChecklist?.totpVerified ?? Boolean(persisted?.totpSecret),
});

const computeHighRiskBlocked = (checklist: SetupChecklist) =>
  !(checklist.recoverySaved && checklist.totpVerified);

const createTemporarySessionKey = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
};

const validatePassword = (
  password: string,
  requireUnicode = false,
  enhanced = true,
): string | null => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (enhanced) {
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!hasLower || !hasUpper || !hasNumber || !hasSpecial) {
      return "Password must contain uppercase, lowercase, number, and special character.";
    }

    if (/(.)\1{2,}/.test(password)) {
      return "Password cannot contain repeated characters.";
    }

    if (/123|abc|qwerty|password/i.test(password)) {
      return "Password cannot contain common sequences.";
    }
  }

  if (requireUnicode) {
    const hasUnicode = [...password].some((char) => {
      const codePoint = char.codePointAt(0);
      return typeof codePoint === "number" && codePoint > 0x7f;
    });
    if (!hasUnicode) {
      return "Password must include at least one non-ASCII (Unicode) character.";
    }
  }

  return null;
};

const calculatePasswordStrength = (
  password: string,
): {
  score: number;
  feedback: string[];
} => {
  let score = 0;
  const feedback: string[] = [];

  if (password.length >= 12) score += 20;
  else if (password.length >= 8) score += 10;
  else feedback.push("Use at least 12 characters");

  if (/[a-z]/.test(password)) score += 20;
  else feedback.push("Add lowercase letters");

  if (/[A-Z]/.test(password)) score += 20;
  else feedback.push("Add uppercase letters");

  if (/[0-9]/.test(password)) score += 20;
  else feedback.push("Add numbers");

  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 20;
  else feedback.push("Add special characters");

  if (password.length >= 16) score += 10;
  if (!/(.)\1{2,}/.test(password)) score += 10;
  else feedback.push("Avoid repeated characters");

  return { score: Math.min(score, 100), feedback };
};

const bootstrap = async () => {
  update((state) => ({ ...state, loading: true }));
  try {
    const identityExists = await invoke<boolean>("is_identity_created");
    const persisted = getAuthPersistence();
    const checklist = resolveChecklist(persisted);
    const temporarySessionKey = persisted.temporarySessionKey ?? null;
    const highRiskBlocked = computeHighRiskBlocked(checklist);
    const hasCredentials = Boolean(
      persisted.passwordHash &&
        persisted.recoveryEnvelope &&
        persisted.recoveryHash,
    );

    const now = new Date();
    const lockedUntil = persisted.accountLockedUntil
      ? new Date(persisted.accountLockedUntil)
      : null;
    const isLocked = lockedUntil && now < lockedUntil;

    if (isLocked) {
      update((state) => ({
        ...state,
        status: "account_locked",
        loading: false,
        error: `Account locked until ${lockedUntil?.toLocaleTimeString()}. Too many failed login attempts.`,
        accountLocked: true,
        accountLockedUntil: lockedUntil,
      }));
      return;
    }

    if (!identityExists || !hasCredentials) {
      const passwordPolicy: PasswordPolicy = identityExists
        ? "legacy_allowed"
        : "enhanced";
      const nextStatus =
        temporarySessionKey && checklist.quickstart
          ? "quickstart"
          : "needs_setup";
      update((state) => ({
        ...state,
        status: nextStatus,
        loading: false,
        requireTotpOnUnlock: false,
        passwordPolicy,
        accountLocked: false,
        accountLockedUntil: null,
        failedAttempts: 0,
        setupChecklist: checklist,
        temporarySessionKey,
        highRiskBlocked,
      }));
      return;
    }

    update((state) => ({
      ...state,
      status: "locked",
      loading: false,
      requireTotpOnUnlock: persisted.requireTotpOnUnlock ?? false,
      passwordPolicy: "enhanced",
      accountLocked: false,
      accountLockedUntil: null,
      failedAttempts: persisted.failedAttempts ?? 0,
      sessionTimeoutMinutes:
        persisted.sessionTimeoutMinutes ?? DEFAULT_SESSION_TIMEOUT,
      setupChecklist: checklist,
      temporarySessionKey,
      highRiskBlocked,
    }));
  } catch (error) {
    console.error("Failed to bootstrap authentication:", error);
    update((state) => ({
      ...state,
      loading: false,
      status: "needs_setup",
      error: "Failed to load authentication state.",
      setupChecklist: initialState.setupChecklist,
      highRiskBlocked: true,
      temporarySessionKey: null,
    }));
  }
};

const beginQuickstart = async (username: string) => {
  const trimmed = username.trim();
  if (!trimmed) {
    throw new Error("Username is required.");
  }

  update((state) => ({ ...state, loading: true, error: null }));

  try {
    const temporarySessionKey = createTemporarySessionKey();
    const setupChecklist: SetupChecklist = {
      quickstart: true,
      recoverySaved: false,
      totpVerified: false,
    };

    await userStore.initialize(temporarySessionKey, { username: trimmed });

    setAuthPersistence({
      username: trimmed,
      temporarySessionKey,
      setupChecklist,
      requireTotpOnUnlock: false,
      sessionTimeoutMinutes: DEFAULT_SESSION_TIMEOUT,
      trustedDevices: [],
    });

    update((state) => ({
      ...state,
      status: "quickstart",
      loading: false,
      error: null,
      temporarySessionKey,
      setupChecklist,
      onboarding: null,
      highRiskBlocked: computeHighRiskBlocked(setupChecklist),
      passwordPolicy:
        state.passwordPolicy === "legacy_allowed"
          ? state.passwordPolicy
          : "enhanced",
    }));

    toasts.addToast(
      "Quick start ready. Finish secure setup to unlock everything.",
      "info",
    );

    return temporarySessionKey;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to start quick start.";
    update((state) => ({ ...state, loading: false, error: message }));
    throw error;
  }
};

const beginOnboarding = (username: string) => {
  const trimmed = username.trim();
  if (!trimmed) {
    throw new Error("Username is required.");
  }
  const recoveryPhrase = generateRecoveryPhrase(12);
  const confirmationIndices = pickRecoveryConfirmationIndices(
    recoveryPhrase.length,
    3,
  );
  const totpSecret = generateTotpSecret();
  const totpUri = buildTotpUri(totpSecret, trimmed);
  update((state) => ({
    ...state,
    status: "setup_in_progress",
    onboarding: {
      username: trimmed,
      recoveryPhrase,
      confirmationIndices,
      totpSecret,
      totpUri,
    },
    error: null,
    highRiskBlocked: true,
  }));
  return { recoveryPhrase, confirmationIndices, totpUri, totpSecret };
};

const saveOnboardingPassword = (password: string) => {
  const state = get({ subscribe });
  const requireUnicode = state.passwordPolicy !== "legacy_allowed";
  const error = validatePassword(password, requireUnicode);
  if (error) {
    throw new Error(error);
  }
  update((current) => {
    if (!current.onboarding) {
      throw new Error("No onboarding session found.");
    }
    return {
      ...current,
      onboarding: { ...current.onboarding, password },
    };
  });
};

const cancelOnboarding = () => {
  const persisted = getAuthPersistence();
  const checklist = resolveChecklist(persisted);
  const temporarySessionKey = persisted.temporarySessionKey ?? null;
  const status =
    temporarySessionKey && checklist.quickstart ? "quickstart" : "needs_setup";
  update((state) => ({
    ...state,
    onboarding: null,
    status,
    error: null,
    setupChecklist: checklist,
    temporarySessionKey,
    highRiskBlocked: computeHighRiskBlocked(checklist),
  }));
};

interface CompleteOnboardingOptions {
  confirmations: Record<number, string>;
  totpCode: string;
}

const completeOnboarding = async ({
  confirmations,
  totpCode,
}: CompleteOnboardingOptions) => {
  const current = get({ subscribe });
  const onboarding = current.onboarding;
  if (!onboarding || !onboarding.password) {
    throw new Error("No onboarding session found.");
  }
  const requireUnicode = current.passwordPolicy !== "legacy_allowed";
  const passwordError = validatePassword(onboarding.password, requireUnicode);
  if (passwordError) {
    throw new Error(passwordError);
  }
  update((state) => ({ ...state, loading: true, error: null }));
  try {
    const {
      recoveryPhrase,
      confirmationIndices,
      totpSecret,
      username,
      password,
    } = onboarding;
    const normalizedWords = recoveryPhrase.map((word) =>
      word.trim().toLowerCase(),
    );
    for (const index of confirmationIndices) {
      const supplied = (confirmations[index] ?? "").trim().toLowerCase();
      if (!supplied || supplied !== normalizedWords[index]) {
        throw new Error("Recovery phrase confirmation does not match.");
      }
    }

    const totpValid = await verifyTotp(totpSecret, totpCode);
    if (!totpValid) {
      throw new Error("Invalid 2FA code.");
    }

    const normalizedPhrase = normalizeRecoveryPhrase(recoveryPhrase);
    const phraseKey = await derivePasswordKey(normalizedPhrase);
    const recoveryHash = await hashString(normalizedPhrase);

    const passwordHash = await hashString(password);
    const passwordEnvelope = await encryptWithSecret(totpSecret, password);
    const recoveryEnvelope = await encryptWithSecret(phraseKey, password);
    const backupCodes = generateBackupCodes(10);

    if (
      current.temporarySessionKey &&
      current.temporarySessionKey !== password
    ) {
      await invoke("rekey_identity", {
        old_password: current.temporarySessionKey,
        new_password: password,
      });
    }

    const completedChecklist: SetupChecklist = {
      quickstart:
        current.setupChecklist.quickstart ||
        Boolean(current.temporarySessionKey),
      recoverySaved: true,
      totpVerified: true,
    };

    await userStore.initialize(password, { username });

    const currentUser = get(userStore).me;
    if (currentUser && currentUser.name !== username) {
      await userStore.updateProfile({ ...currentUser, name: username });
    }

    setAuthPersistence({
      username,
      passwordHash,
      passwordEnvelope,
      recoveryEnvelope,
      recoveryHash,
      totpSecret,
      backupCodes,
      backupCodesUsed: [],
      requireTotpOnUnlock: false,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      setupChecklist: completedChecklist,
      temporarySessionKey: null,
    });

    update((state) => ({
      ...state,
      status: "authenticated",
      loading: false,
      error: null,
      pendingRecoveryRotation: null,
      onboarding: null,
      requireTotpOnUnlock: false,
      passwordPolicy: "unicode_required",
      setupChecklist: completedChecklist,
      temporarySessionKey: null,
      highRiskBlocked: computeHighRiskBlocked(completedChecklist),
    }));
    toasts.addToast("Security setup complete. Welcome to Aegis.", "success");
  } catch (error) {
    console.error("Failed to complete onboarding:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to complete security setup.";
    update((state) => ({ ...state, loading: false, error: message }));
    throw error;
  }
};

const loginWithPassword = async (password: string, totpCode?: string) => {
  update((state) => ({ ...state, loading: true, error: null }));
  try {
    const persisted = getAuthPersistence();
    const now = new Date();

    const lockedUntil = persisted.accountLockedUntil
      ? new Date(persisted.accountLockedUntil)
      : null;
    if (lockedUntil && now < lockedUntil) {
      throw new Error(
        `Account locked until ${lockedUntil.toLocaleTimeString()}.`,
      );
    }

    if (!persisted.passwordHash) {
      throw new Error("Password has not been configured.");
    }

    const hashed = await hashString(password);
    const correctPassword = hashed === persisted.passwordHash;

    if (!correctPassword) {
      const newFailedAttempts = (persisted.failedAttempts ?? 0) + 1;
      const updates: Partial<AuthPersistence> = {
        failedAttempts: newFailedAttempts,
        lastFailedAttempt: now.toISOString(),
      };

      if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        updates.accountLockedUntil = new Date(
          now.getTime() + ACCOUNT_LOCKOUT_MINUTES * 60 * 1000,
        ).toISOString();
        throw new Error(
          `Account locked for ${ACCOUNT_LOCKOUT_MINUTES} minutes due to too many failed attempts.`,
        );
      }

      updateAuthPersistence((value) => ({ ...value, ...updates }));
      throw new Error("Incorrect password.");
    }

    if (persisted.failedAttempts && persisted.failedAttempts > 0) {
      updateAuthPersistence((value) => ({
        ...value,
        failedAttempts: 0,
        lastFailedAttempt: undefined,
        accountLockedUntil: null,
      }));
    }

    if (persisted.requireTotpOnUnlock) {
      if (!persisted.totpSecret) {
        throw new Error("Authenticator secret is unavailable.");
      }
      if (!totpCode) {
        throw new Error("Authenticator code required.");
      }
      const validTotp = await verifyTotp(persisted.totpSecret, totpCode);
      if (!validTotp) {
        throw new Error("Invalid authenticator code.");
      }
    }

    await userStore.initialize(password, { username: persisted.username });

    const deviceInfo = await getDeviceInfo();
    const trustedDevices = (persisted.trustedDevices ?? []).filter(
      (d) => d.id !== deviceInfo.id,
    );
    trustedDevices.unshift({
      ...deviceInfo,
      lastUsed: now.toISOString(),
    });

    const updatedDevices = trustedDevices.slice(0, 5);

    updateAuthPersistence((value) => ({
      ...value,
      lastLoginAt: now.toISOString(),
      trustedDevices: updatedDevices,
    }));

    const currentPersistence = getAuthPersistence();
    const checklist = resolveChecklist(currentPersistence);

    update((state) => ({
      ...state,
      status: "authenticated",
      loading: false,
      error: null,
      pendingRecoveryRotation: null,
      accountLocked: false,
      accountLockedUntil: null,
      failedAttempts: 0,
      setupChecklist: checklist,
      temporarySessionKey: currentPersistence.temporarySessionKey ?? null,
      highRiskBlocked: computeHighRiskBlocked(checklist),
    }));
    toasts.addToast("Identity unlocked.", "success");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to authenticate with password.";
    console.error("Password login failed:", error);
    update((state) => ({ ...state, loading: false, error: message }));
    throw error;
  }
};

interface RecoveryLoginOptions {
  phrase: string;
  newPassword: string;
  totpCode?: string;
}

interface SecurityQuestionRecoveryOptions {
  answers: Record<string, string>;
  newPassword: string;
  totpCode?: string;
}

const loginWithRecovery = async ({
  phrase,
  newPassword,
  totpCode,
}: RecoveryLoginOptions) => {
  const currentState = get({ subscribe });
  const requireUnicode = currentState.passwordPolicy !== "legacy_allowed";
  const passwordError = validatePassword(newPassword, requireUnicode, true);
  if (passwordError) {
    throw new Error(passwordError);
  }
  update((state) => ({ ...state, loading: true, error: null }));
  try {
    const persisted = getAuthPersistence();
    if (!persisted.recoveryEnvelope || !persisted.recoveryHash) {
      throw new Error("Recovery data not available on this device.");
    }
    const normalizedPhrase = normalizeRecoveryPhrase(phrase);
    const phraseHash = await hashString(normalizedPhrase);
    if (phraseHash !== persisted.recoveryHash) {
      throw new Error("Recovery phrase is incorrect.");
    }

    if (persisted.requireTotpOnUnlock && persisted.totpSecret) {
      if (!totpCode) {
        throw new Error("Authenticator code required.");
      }
      const totpValid = await verifyTotp(persisted.totpSecret, totpCode);
      if (!totpValid) {
        throw new Error("Invalid authenticator code.");
      }
    }

    const phraseKey = await derivePasswordKey(normalizedPhrase);
    const currentPassword = await decryptWithSecret(
      phraseKey,
      persisted.recoveryEnvelope,
    );

    await invoke("rekey_identity", {
      old_password: currentPassword,
      new_password: newPassword,
    });
    await userStore.initialize(newPassword, { username: persisted.username });

    const passwordHash = await hashString(newPassword);
    const updatedPasswordEnvelope = persisted.totpSecret
      ? await encryptWithSecret(persisted.totpSecret, newPassword)
      : null;
    const updatedRecoveryEnvelope = await encryptWithSecret(
      phraseKey,
      newPassword,
    );

    const setupChecklist: SetupChecklist = {
      quickstart: true,
      recoverySaved: true,
      totpVerified: Boolean(persisted.totpSecret),
    };

    setAuthPersistence({
      username: persisted.username,
      passwordHash,
      passwordEnvelope: updatedPasswordEnvelope,
      recoveryEnvelope: updatedRecoveryEnvelope,
      recoveryHash: phraseHash,
      totpSecret: persisted.totpSecret,
      requireTotpOnUnlock: persisted.requireTotpOnUnlock ?? false,
      trustedDevices: persisted.trustedDevices ?? [],
      securityQuestions: persisted.securityQuestions,
      biometricEnabled: persisted.biometricEnabled ?? false,
      sessionTimeoutMinutes:
        persisted.sessionTimeoutMinutes ?? DEFAULT_SESSION_TIMEOUT,
      failedAttempts: 0,
      lastFailedAttempt: undefined,
      accountLockedUntil: null,
      createdAt: persisted.createdAt ?? new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      setupChecklist,
      temporarySessionKey: null,
    });

    const updatedChecklist = resolveChecklist({ ...persisted, setupChecklist });

    update((state) => ({
      ...state,
      status: "authenticated",
      loading: false,
      error: null,
      pendingRecoveryRotation: null,
      requireTotpOnUnlock: persisted.requireTotpOnUnlock ?? false,
      passwordPolicy: "enhanced",
      accountLocked: false,
      accountLockedUntil: null,
      failedAttempts: 0,
      setupChecklist: updatedChecklist,
      temporarySessionKey: null,
      highRiskBlocked: computeHighRiskBlocked(updatedChecklist),
    }));
    toasts.addToast("Password reset successfully.", "success");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to authenticate with recovery phrase.";
    console.error("Recovery login failed:", error);
    update((state) => ({ ...state, loading: false, error: message }));
    throw error;
  }
};

const loginWithSecurityQuestions = async ({
  answers,
  newPassword,
  totpCode,
}: SecurityQuestionRecoveryOptions) => {
  const currentState = get({ subscribe });
  if (currentState.pendingRecoveryRotation) {
    throw new Error(
      "Finish storing your new recovery phrase before continuing.",
    );
  }
  const requireUnicode = currentState.passwordPolicy !== "legacy_allowed";
  const passwordError = validatePassword(newPassword, requireUnicode, true);
  if (passwordError) {
    throw new Error(passwordError);
  }
  update((state) => ({ ...state, loading: true, error: null }));
  try {
    const { newRecoveryPhrase } = await prepareSecurityQuestionRecovery({
      answers,
      totpCode,
    });

    update((state) => ({
      ...state,
      loading: false,
      error: null,
      status: "recovery_ack_required",
      pendingRecoveryRotation: {
        newRecoveryPhrase,
        newPassword,
        initiatedAt: new Date().toISOString(),
      },
    }));
    toasts.addToast(
      "Write down your new recovery phrase before finalizing recovery.",
      "info",
    );
    return newRecoveryPhrase;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to recover account with security questions.";
    console.error("Security question recovery failed:", error);
    update((state) => ({ ...state, loading: false, error: message }));
    throw error;
  }
};

const completeSecurityQuestionRecovery = async () => {
  const stateSnapshot = get({ subscribe });
  const pending = stateSnapshot.pendingRecoveryRotation;
  if (!pending) {
    throw new Error("No recovery phrase acknowledgement pending.");
  }

  update((state) => ({ ...state, loading: true, error: null }));
  try {
    const persisted = getAuthPersistence();

    const updatedPersistence = await finalizeSecurityQuestionRecovery(
      pending,
      persisted,
    );

    await userStore.initialize(pending.newPassword, {
      username: updatedPersistence.username ?? "",
    });

    const checklist = resolveChecklist({
      ...updatedPersistence,
      setupChecklist: {
        quickstart: true,
        recoverySaved: true,
        totpVerified: Boolean(updatedPersistence.totpSecret),
      },
    });

    updateAuthPersistence((current) => ({
      ...current,
      ...updatedPersistence,
      setupChecklist: checklist,
      temporarySessionKey: null,
      lastLoginAt: new Date().toISOString(),
    }));

    update((state) => ({
      ...state,
      status: "authenticated",
      loading: false,
      error: null,
      requireTotpOnUnlock: updatedPersistence.requireTotpOnUnlock ?? false,
      passwordPolicy: "enhanced",
      accountLocked: false,
      accountLockedUntil: null,
      failedAttempts: 0,
      pendingRecoveryRotation: null,
      setupChecklist: checklist,
      temporarySessionKey: null,
      highRiskBlocked: computeHighRiskBlocked(checklist),
    }));
    toasts.addToast(
      "Account recovered successfully. Store your new recovery phrase safely.",
      "success",
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to finalize security question recovery.";
    console.error("Finalizing security question recovery failed:", error);
    update((state) => ({ ...state, loading: false, error: message }));
    throw error;
  }
};

const guardHighRiskAction = (actionLabel: string) => {
  const { highRiskBlocked } = get({ subscribe });
  if (highRiskBlocked) {
    throw new Error(
      `${actionLabel} is blocked until you finish saving your recovery phrase and enabling 2FA.`,
    );
  }
};

const ingestDeviceHandshake = (raw: string) => {
  const payload = decodeDeviceHandshakePayload(raw);
  update((state) => ({ ...state, pendingDeviceLogin: payload, error: null }));
  return payload;
};

const loginWithDeviceHandshake = async (totpCode: string) => {
  const { pendingDeviceLogin } = get({ subscribe });
  if (!pendingDeviceLogin) {
    throw new Error("No device login request detected.");
  }
  update((state) => ({ ...state, loading: true, error: null }));
  try {
    const persisted = getAuthPersistence();
    const { updatedPersistence, totpRequirement } =
      await approveDeviceHandshake({
        payload: pendingDeviceLogin,
        totpCode,
        persisted,
      });

    await userStore.initialize(pendingDeviceLogin.password, {
      username: pendingDeviceLogin.username ?? "",
    });

    setAuthPersistence(updatedPersistence);

    const checklist = resolveChecklist(updatedPersistence);

    update((state) => ({
      ...state,
      status: "authenticated",
      loading: false,
      error: null,
      pendingRecoveryRotation: null,
      pendingDeviceLogin: null,
      requireTotpOnUnlock: totpRequirement,
      setupChecklist: checklist,
      temporarySessionKey: updatedPersistence.temporarySessionKey ?? null,
      highRiskBlocked: computeHighRiskBlocked(checklist),
    }));
    toasts.addToast("Device approved and authenticated.", "success");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Device login failed.";
    console.error("Device login failed:", error);
    update((state) => ({ ...state, loading: false, error: message }));
    throw error;
  }
};

const generateDeviceHandshake = async (totpCode: string): Promise<string> => {
  guardHighRiskAction("Device handoff");
  const persisted = getAuthPersistence();
  return createDeviceHandshake({ totpCode, persisted });
};

const revealTotpSecret = async (totpCode: string) => {
  guardHighRiskAction("Revealing the authenticator secret");
  const persisted = getAuthPersistence();
  if (!persisted.totpSecret || !persisted.username) {
    throw new Error("2FA has not been configured yet.");
  }
  const totpValid = await verifyTotp(persisted.totpSecret, totpCode);
  if (!totpValid) {
    throw new Error("Invalid authenticator code.");
  }
  return {
    secret: persisted.totpSecret,
    uri: buildTotpUri(persisted.totpSecret, persisted.username),
  };
};

const setRequireTotpOnUnlock = (value: boolean) => {
  updateAuthPersistence((current) => ({
    ...current,
    requireTotpOnUnlock: value,
  }));
  update((state) => ({ ...state, requireTotpOnUnlock: value }));
};

const resetForTests = () => {
  resetAuthPersistence();
  update(() => ({ ...initialState }));
};

const logout = () => {
  const persisted = getAuthPersistence();
  const checklist = resolveChecklist(persisted);
  userStore.reset();
  update((state) => ({
    ...state,
    status: "locked",
    loading: false,
    pendingDeviceLogin: null,
    pendingRecoveryRotation: null,
    error: null,
    setupChecklist: checklist,
    temporarySessionKey: persisted.temporarySessionKey ?? null,
    highRiskBlocked: computeHighRiskBlocked(checklist),
  }));
  toasts.addToast("Logged out successfully.", "info");
};

const clearError = () => update((state) => ({ ...state, error: null }));

const setSessionTimeout = (minutes: number) => {
  const validMinutes = Math.max(5, Math.min(minutes, 1440)); // 5 minutes to 24 hours
  updateAuthPersistence((current) => ({
    ...current,
    sessionTimeoutMinutes: validMinutes,
  }));
  update((state) => ({ ...state, sessionTimeoutMinutes: validMinutes }));
};

const configureSecurityQuestions = async (questions: SecurityQuestion[]) => {
  await configureSecurityQuestionsService(questions);

  update((state) => ({
    ...state,
    securityQuestionsConfigured: true,
  }));
};

const removeTrustedDevice = (deviceId: string) => {
  updateAuthPersistence((current) => ({
    ...current,
    trustedDevices: (current.trustedDevices ?? []).filter(
      (d) => d.id !== deviceId,
    ),
  }));
};

export const authStore = {
  subscribe,
  bootstrap,
  beginQuickstart,
  beginOnboarding,
  saveOnboardingPassword,
  cancelOnboarding,
  completeOnboarding,
  loginWithPassword,
  loginWithRecovery,
  ingestDeviceHandshake,
  loginWithDeviceHandshake,
  generateDeviceHandshake,
  revealTotpSecret,
  setRequireTotpOnUnlock,
  logout,
  clearError,
  getPersistence: () => getAuthPersistence(),
  calculatePasswordStrength,
  setSessionTimeout,
  loginWithSecurityQuestions,
  completeSecurityQuestionRecovery,
  configureSecurityQuestions,
  removeTrustedDevice,
  getTrustedDevices: () => getAuthPersistence().trustedDevices ?? [],
  __resetForTests: resetForTests,
};

export { authPersistenceStore };
export { validatePassword };

export type {
  AuthState,
  AuthPersistence,
  PasswordPolicy,
  TrustedDevice,
  SecurityQuestion,
};
