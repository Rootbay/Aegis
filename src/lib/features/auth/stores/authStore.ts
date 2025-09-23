import { writable, type Readable, get } from "svelte/store";
import { browser } from "$app/environment";
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
  encodeDeviceHandshake,
  decodeDeviceHandshake,
  type DeviceHandshakePayload,
  type SecretEnvelope,
} from "$lib/utils/security";
import { persistentStore } from "$lib/stores/persistentStore";
import { userStore } from "$lib/stores/userStore";
import { toasts } from "$lib/stores/ToastStore";

type AuthStatus =
  | "checking"
  | "needs_setup"
  | "setup_in_progress"
  | "locked"
  | "recovery_ack_required"
  | "authenticated"
  | "account_locked";

type PasswordPolicy = "unicode_required" | "legacy_allowed" | "enhanced";

type AuthPersistence = {
  username?: string;
  passwordHash?: string;
  passwordEnvelope?: SecretEnvelope | null;
  recoveryEnvelope?: SecretEnvelope | null;
  recoveryHash?: string | null;
  totpSecret?: string;
  requireTotpOnUnlock?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
  failedAttempts?: number;
  lastFailedAttempt?: string;
  accountLockedUntil?: string | null;
  sessionTimeoutMinutes?: number;
  trustedDevices?: TrustedDevice[];
  securityQuestions?: SecurityQuestion[];
  biometricEnabled?: boolean;
  backupCodes?: string[];
  backupCodesUsed?: string[];
};

type TrustedDevice = {
  id: string;
  name: string;
  lastUsed: string;
  userAgent?: string;
  ipAddress?: string;
  location?: string;
};

type SecurityQuestion = {
  question: string;
  answerHash: string;
};

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
};

const persistence = persistentStore<AuthPersistence>("auth-state", {});
const MIN_PASSWORD_LENGTH = 12;
const MAX_FAILED_ATTEMPTS = 5;
const ACCOUNT_LOCKOUT_MINUTES = 15;
const DEFAULT_SESSION_TIMEOUT = 60;

const initialState: AuthState = {
  status: "checking",
  loading: true,
  error: null,
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
};

const { subscribe, update } = writable<AuthState>(initialState);

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
    const persisted = get(persistence);
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
      update((state) => ({
        ...state,
        status: "needs_setup",
        loading: false,
        requireTotpOnUnlock: false,
        passwordPolicy,
        accountLocked: false,
        accountLockedUntil: null,
        failedAttempts: 0,
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
    }));
  } catch (error) {
    console.error("Failed to bootstrap authentication:", error);
    update((state) => ({
      ...state,
      loading: false,
      status: "needs_setup",
      error: "Failed to load authentication state.",
    }));
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
  update((state) => ({
    ...state,
    onboarding: null,
    status: "needs_setup",
    error: null,
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

    await userStore.initialize(password, { username });

    persistence.set({
      username,
      passwordHash,
      passwordEnvelope,
      recoveryEnvelope,
      recoveryHash,
      totpSecret,
      requireTotpOnUnlock: false,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
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
    const persisted = get(persistence);
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

      persistence.update((value) => ({ ...value, ...updates }));
      throw new Error("Incorrect password.");
    }

    if (persisted.failedAttempts && persisted.failedAttempts > 0) {
      persistence.update((value) => ({
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

    persistence.update((value) => ({
      ...value,
      lastLoginAt: now.toISOString(),
      trustedDevices: updatedDevices,
    }));

    update((state) => ({
      ...state,
      status: "authenticated",
      loading: false,
      error: null,
      pendingRecoveryRotation: null,
      accountLocked: false,
      accountLockedUntil: null,
      failedAttempts: 0,
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
    const persisted = get(persistence);
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

    persistence.set({
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
    });

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
    const persisted = get(persistence);
    if (
      !persisted.securityQuestions ||
      persisted.securityQuestions.length < 3
    ) {
      throw new Error("Security questions not configured on this device.");
    }

    let correctAnswers = 0;
    for (const question of persisted.securityQuestions) {
      const providedAnswer = answers[question.question];
      if (providedAnswer) {
        const answerHash = await hashString(
          providedAnswer.trim().toLowerCase(),
        );
        if (answerHash === question.answerHash) {
          correctAnswers += 1;
        }
      }
    }

    if (correctAnswers < 2) {
      throw new Error("Insufficient correct answers provided.");
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

    const newRecoveryPhrase = generateRecoveryPhrase(12);

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
    const persisted = get(persistence);
    const username = persisted.username;
    if (!username) {
      throw new Error("No identity found to finalize recovery.");
    }

    const normalizedPhrase = normalizeRecoveryPhrase(pending.newRecoveryPhrase);
    const phraseKey = await derivePasswordKey(normalizedPhrase);
    const recoveryHash = await hashString(normalizedPhrase);

    const passwordHash = await hashString(pending.newPassword);
    const passwordEnvelope = persisted.totpSecret
      ? await encryptWithSecret(persisted.totpSecret, pending.newPassword)
      : null;
    const recoveryEnvelope = await encryptWithSecret(
      phraseKey,
      pending.newPassword,
    );

    await userStore.initialize(pending.newPassword, { username });

    persistence.set({
      username,
      passwordHash,
      passwordEnvelope,
      recoveryEnvelope,
      recoveryHash,
      totpSecret: persisted.totpSecret,
      requireTotpOnUnlock: persisted.requireTotpOnUnlock ?? false,
      trustedDevices: persisted.trustedDevices ?? [],
      securityQuestions: persisted.securityQuestions,
      biometricEnabled: persisted.biometricEnabled ?? false,
      sessionTimeoutMinutes:
        persisted.sessionTimeoutMinutes ?? DEFAULT_SESSION_TIMEOUT,
      backupCodes: persisted.backupCodes,
      backupCodesUsed: persisted.backupCodesUsed ?? [],
      failedAttempts: 0,
      lastFailedAttempt: undefined,
      accountLockedUntil: null,
      createdAt: persisted.createdAt ?? new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    });

    update((state) => ({
      ...state,
      status: "authenticated",
      loading: false,
      error: null,
      requireTotpOnUnlock: persisted.requireTotpOnUnlock ?? false,
      passwordPolicy: "enhanced",
      accountLocked: false,
      accountLockedUntil: null,
      failedAttempts: 0,
      pendingRecoveryRotation: null,
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

const ingestDeviceHandshake = (raw: string) => {
  const payload = decodeDeviceHandshake(raw);
  if (!payload) {
    throw new Error("Unrecognized device login QR payload.");
  }
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
    const {
      password,
      totpSecret,
      username,
      recoveryEnvelope,
      recoveryHash,
      requireTotpOnUnlock,
    } = pendingDeviceLogin;
    const totpValid = await verifyTotp(totpSecret, totpCode);
    if (!totpValid) {
      throw new Error("Invalid authenticator code.");
    }

    const passwordHash = await hashString(password);
    const passwordEnvelope = await encryptWithSecret(totpSecret, password);
    const persisted = get(persistence);
    const totpRequirement =
      typeof requireTotpOnUnlock === "boolean"
        ? requireTotpOnUnlock
        : (persisted.requireTotpOnUnlock ?? false);

    await userStore.initialize(password, { username });

    persistence.set({
      username,
      passwordHash,
      passwordEnvelope,
      recoveryEnvelope: recoveryEnvelope ?? null,
      recoveryHash: recoveryHash ?? null,
      totpSecret,
      requireTotpOnUnlock: totpRequirement,
      createdAt: persisted.createdAt ?? new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    });

    update((state) => ({
      ...state,
      status: "authenticated",
      loading: false,
      error: null,
      pendingRecoveryRotation: null,
      pendingDeviceLogin: null,
      requireTotpOnUnlock: totpRequirement,
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
  const persisted = get(persistence);
  if (!persisted.passwordEnvelope || !persisted.totpSecret) {
    throw new Error("Device pairing is unavailable.");
  }
  const totpValid = await verifyTotp(persisted.totpSecret, totpCode);
  if (!totpValid) {
    throw new Error("Invalid authenticator code.");
  }
  const password = await decryptWithSecret(
    persisted.totpSecret,
    persisted.passwordEnvelope,
  );
  const payload: DeviceHandshakePayload = {
    version: 1,
    password,
    totpSecret: persisted.totpSecret,
    username: persisted.username,
    issuedAt: Date.now(),
    recoveryEnvelope: persisted.recoveryEnvelope ?? null,
    recoveryHash: persisted.recoveryHash ?? null,
    requireTotpOnUnlock: persisted.requireTotpOnUnlock ?? false,
  };
  return encodeDeviceHandshake(payload);
};

const revealTotpSecret = async (totpCode: string) => {
  const persisted = get(persistence);
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
  persistence.update((current) => ({
    ...current,
    requireTotpOnUnlock: value,
  }));
  update((state) => ({ ...state, requireTotpOnUnlock: value }));
};

const resetForTests = () => {
  persistence.set({});
  update(() => ({ ...initialState }));
};

const logout = () => {
  userStore.reset();
  update((state) => ({
    ...state,
    status: "locked",
    loading: false,
    pendingDeviceLogin: null,
    pendingRecoveryRotation: null,
    error: null,
  }));
  toasts.addToast("Logged out successfully.", "info");
};

const clearError = () => update((state) => ({ ...state, error: null }));

const getDeviceInfo = async (): Promise<TrustedDevice> => {
  if (!browser) {
    return {
      id: "unknown",
      name: "Unknown Device",
      lastUsed: new Date().toISOString(),
    };
  }

  const userAgent = navigator.userAgent;
  const deviceId = await hashString(
    userAgent + navigator.language + screen.width + screen.height,
  );

  return {
    id: deviceId,
    name: getDeviceName(userAgent),
    lastUsed: new Date().toISOString(),
    userAgent,
  };
};

const getDeviceName = (userAgent: string): string => {
  if (userAgent.includes("Windows")) return "Windows PC";
  if (userAgent.includes("Mac")) return "Mac";
  if (userAgent.includes("Linux")) return "Linux PC";
  if (userAgent.includes("Android")) return "Android Device";
  if (userAgent.includes("iPhone")) return "iPhone";
  if (userAgent.includes("iPad")) return "iPad";
  return "Unknown Device";
};

const setSessionTimeout = (minutes: number) => {
  const validMinutes = Math.max(5, Math.min(minutes, 1440)); // 5 minutes to 24 hours
  persistence.update((current) => ({
    ...current,
    sessionTimeoutMinutes: validMinutes,
  }));
  update((state) => ({ ...state, sessionTimeoutMinutes: validMinutes }));
};

const configureSecurityQuestions = async (questions: SecurityQuestion[]) => {
  const hashedQuestions = await Promise.all(
    questions.map(async (q) => ({
      question: q.question,
      answerHash: await hashString(q.answerHash),
    })),
  );

  persistence.update((current) => ({
    ...current,
    securityQuestions: hashedQuestions,
  }));

  update((state) => ({
    ...state,
    securityQuestionsConfigured: true,
  }));
};

const removeTrustedDevice = (deviceId: string) => {
  persistence.update((current) => ({
    ...current,
    trustedDevices: (current.trustedDevices ?? []).filter(
      (d) => d.id !== deviceId,
    ),
  }));
};

const authPersistenceStore: Readable<AuthPersistence> = {
  subscribe: persistence.subscribe,
};

export const authStore = {
  subscribe,
  bootstrap,
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
  getPersistence: () => get(persistence),
  calculatePasswordStrength,
  setSessionTimeout,
  loginWithSecurityQuestions,
  completeSecurityQuestionRecovery,
  configureSecurityQuestions,
  removeTrustedDevice,
  getTrustedDevices: () => get(persistence).trustedDevices ?? [],
  __resetForTests: resetForTests,
};

export { authPersistenceStore };

export type {
  AuthState,
  AuthPersistence,
  PasswordPolicy,
  TrustedDevice,
  SecurityQuestion,
};
