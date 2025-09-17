import { writable, type Readable, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
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
} from '$lib/utils/security';
import { persistentStore } from '$lib/stores/persistentStore';
import { userStore } from './userStore';
import { toasts } from './ToastStore';

type AuthStatus = 'checking' | 'needs_setup' | 'setup_in_progress' | 'locked' | 'authenticated';

type PasswordPolicy = 'unicode_required' | 'legacy_allowed';

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
};

type OnboardingState = {
  username: string;
  recoveryPhrase: string[];
  confirmationIndices: number[];
  totpSecret: string;
  totpUri: string;
  password?: string;
};

type AuthState = {
  status: AuthStatus;
  loading: boolean;
  error: string | null;
  onboarding: OnboardingState | null;
  pendingDeviceLogin: DeviceHandshakePayload | null;
  requireTotpOnUnlock: boolean;
  passwordPolicy: PasswordPolicy;
};

const persistence = persistentStore<AuthPersistence>('auth-state', {});

const initialState: AuthState = {
  status: 'checking',
  loading: true,
  error: null,
  onboarding: null,
  pendingDeviceLogin: null,
  requireTotpOnUnlock: false,
  passwordPolicy: 'unicode_required',
};

const { subscribe, update } = writable<AuthState>(initialState);

const MIN_PASSWORD_LENGTH = 8;

const validatePassword = (password: string, requireUnicode = true): string | null => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (requireUnicode) {
    const hasUnicode = [...password].some((char) => {
      const codePoint = char.codePointAt(0);
      return typeof codePoint === 'number' && codePoint > 0x7f;
    });
    if (!hasUnicode) {
      return 'Password must include at least one non-ASCII (Unicode) character.';
    }
  }
  return null;
};

const bootstrap = async () => {
  update((state) => ({ ...state, loading: true }));
  try {
    const identityExists = await invoke<boolean>('is_identity_created');
    const persisted = get(persistence);
    const hasCredentials = Boolean(
      persisted.passwordHash &&
      persisted.recoveryEnvelope &&
      persisted.recoveryHash
    );
    if (!identityExists || !hasCredentials) {
      const passwordPolicy: PasswordPolicy = identityExists ? 'legacy_allowed' : 'unicode_required';
      update((state) => ({
        ...state,
        status: 'needs_setup',
        loading: false,
        requireTotpOnUnlock: false,
        passwordPolicy,
      }));
      return;
    }
    update((state) => ({
      ...state,
      status: 'locked',
      loading: false,
      requireTotpOnUnlock: persisted.requireTotpOnUnlock ?? false,
      passwordPolicy: 'unicode_required',
    }));
  } catch (error) {
    console.error('Failed to bootstrap authentication:', error);
    update((state) => ({ ...state, loading: false, status: 'needs_setup', error: 'Failed to load authentication state.' }));
  }
};

const beginOnboarding = (username: string) => {
  const trimmed = username.trim();
  if (!trimmed) {
    throw new Error('Username is required.');
  }
  const recoveryPhrase = generateRecoveryPhrase(12);
  const confirmationIndices = pickRecoveryConfirmationIndices(recoveryPhrase.length, 3);
  const totpSecret = generateTotpSecret();
  const totpUri = buildTotpUri(totpSecret, trimmed);
  update((state) => ({
    ...state,
    status: 'setup_in_progress',
    onboarding: { username: trimmed, recoveryPhrase, confirmationIndices, totpSecret, totpUri },
    error: null,
  }));
  return { recoveryPhrase, confirmationIndices, totpUri, totpSecret };
};

const saveOnboardingPassword = (password: string) => {
  const state = get({ subscribe });
  const requireUnicode = state.passwordPolicy !== 'legacy_allowed';
  const error = validatePassword(password, requireUnicode);
  if (error) {
    throw new Error(error);
  }
  update((current) => {
    if (!current.onboarding) {
      throw new Error('No onboarding session found.');
    }
    return {
      ...current,
      onboarding: { ...current.onboarding, password },
    };
  });
};

const cancelOnboarding = () => {
  update((state) => ({ ...state, onboarding: null, status: 'needs_setup', error: null }));
};

interface CompleteOnboardingOptions {
  confirmations: Record<number, string>;
  totpCode: string;
}

const completeOnboarding = async ({ confirmations, totpCode }: CompleteOnboardingOptions) => {
  const current = get({ subscribe });
  const onboarding = current.onboarding;
  if (!onboarding || !onboarding.password) {
    throw new Error('No onboarding session found.');
  }
  const requireUnicode = current.passwordPolicy !== 'legacy_allowed';
  const passwordError = validatePassword(onboarding.password, requireUnicode);
  if (passwordError) {
    throw new Error(passwordError);
  }
  update((state) => ({ ...state, loading: true, error: null }));
  try {
    const { recoveryPhrase, confirmationIndices, totpSecret, username, password } = onboarding;
    const normalizedWords = recoveryPhrase.map((word) => word.trim().toLowerCase());
    for (const index of confirmationIndices) {
      const supplied = (confirmations[index] ?? '').trim().toLowerCase();
      if (!supplied || supplied !== normalizedWords[index]) {
        throw new Error('Recovery phrase confirmation does not match.');
      }
    }

    const totpValid = await verifyTotp(totpSecret, totpCode);
    if (!totpValid) {
      throw new Error('Invalid 2FA code.');
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
      status: 'authenticated',
      loading: false,
      error: null,
      onboarding: null,
      requireTotpOnUnlock: false,
      passwordPolicy: 'unicode_required',
    }));
    toasts.addToast('Security setup complete. Welcome to Aegis.', 'success');
  } catch (error) {
    console.error('Failed to complete onboarding:', error);
    const message = error instanceof Error ? error.message : 'Failed to complete security setup.';
    update((state) => ({ ...state, loading: false, error: message }));
    throw error;
  }
};

const loginWithPassword = async (password: string, totpCode?: string) => {
  update((state) => ({ ...state, loading: true, error: null }));
  try {
    const persisted = get(persistence);
    if (!persisted.passwordHash) {
      throw new Error('Password has not been configured.');
    }
    const hashed = await hashString(password);
    if (hashed !== persisted.passwordHash) {
      throw new Error('Incorrect password.');
    }

    if (persisted.requireTotpOnUnlock) {
      if (!persisted.totpSecret) {
        throw new Error('Authenticator secret is unavailable.');
      }
      if (!totpCode) {
        throw new Error('Authenticator code required.');
      }
      const validTotp = await verifyTotp(persisted.totpSecret, totpCode);
      if (!validTotp) {
        throw new Error('Invalid authenticator code.');
      }
    }

    await userStore.initialize(password, { username: persisted.username });

    persistence.update((value) => ({
      ...value,
      lastLoginAt: new Date().toISOString(),
    }));

    update((state) => ({
      ...state,
      status: 'authenticated',
      loading: false,
      error: null,
    }));
    toasts.addToast('Identity unlocked.', 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to authenticate with password.';
    console.error('Password login failed:', error);
    update((state) => ({ ...state, loading: false, error: message }));
    throw error;
  }
};

interface RecoveryLoginOptions {
  phrase: string;
  newPassword: string;
  totpCode?: string;
}

const loginWithRecovery = async ({ phrase, newPassword, totpCode }: RecoveryLoginOptions) => {
  const currentState = get({ subscribe });
  const requireUnicode = currentState.passwordPolicy !== 'legacy_allowed';
  const passwordError = validatePassword(newPassword, requireUnicode);
  if (passwordError) {
    throw new Error(passwordError);
  }
  update((state) => ({ ...state, loading: true, error: null }));
  try {
    const persisted = get(persistence);
    if (!persisted.recoveryEnvelope || !persisted.recoveryHash) {
      throw new Error('Recovery data not available on this device.');
    }
    const normalizedPhrase = normalizeRecoveryPhrase(phrase);
    const phraseHash = await hashString(normalizedPhrase);
    if (phraseHash !== persisted.recoveryHash) {
      throw new Error('Recovery phrase is incorrect.');
    }

    if (persisted.requireTotpOnUnlock && persisted.totpSecret) {
      if (!totpCode) {
        throw new Error('Authenticator code required.');
      }
      const totpValid = await verifyTotp(persisted.totpSecret, totpCode);
      if (!totpValid) {
        throw new Error('Invalid authenticator code.');
      }
    }

    const phraseKey = await derivePasswordKey(normalizedPhrase);
    const currentPassword = await decryptWithSecret(phraseKey, persisted.recoveryEnvelope);

    await invoke('rekey_identity', { old_password: currentPassword, new_password: newPassword });
    await userStore.initialize(newPassword, { username: persisted.username });

    const passwordHash = await hashString(newPassword);
    const updatedPasswordEnvelope = persisted.totpSecret
      ? await encryptWithSecret(persisted.totpSecret, newPassword)
      : null;
    const updatedRecoveryEnvelope = await encryptWithSecret(phraseKey, newPassword);

    persistence.set({
      username: persisted.username,
      passwordHash,
      passwordEnvelope: updatedPasswordEnvelope,
      recoveryEnvelope: updatedRecoveryEnvelope,
      recoveryHash: phraseHash,
      totpSecret: persisted.totpSecret,
      requireTotpOnUnlock: persisted.requireTotpOnUnlock ?? false,
      createdAt: persisted.createdAt ?? new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    });

    update((state) => ({
      ...state,
      status: 'authenticated',
      loading: false,
      error: null,
      requireTotpOnUnlock: persisted.requireTotpOnUnlock ?? false,
      passwordPolicy: 'unicode_required',
    }));
    toasts.addToast('Password reset successfully.', 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to authenticate with recovery phrase.';
    console.error('Recovery login failed:', error);
    update((state) => ({ ...state, loading: false, error: message }));
    throw error;
  }
};

const ingestDeviceHandshake = (raw: string) => {
  const payload = decodeDeviceHandshake(raw);
  if (!payload) {
    throw new Error('Unrecognized device login QR payload.');
  }
  update((state) => ({ ...state, pendingDeviceLogin: payload, error: null }));
  return payload;
};

const loginWithDeviceHandshake = async (totpCode: string) => {
  const { pendingDeviceLogin } = get({ subscribe });
  if (!pendingDeviceLogin) {
    throw new Error('No device login request detected.');
  }
  update((state) => ({ ...state, loading: true, error: null }));
  try {
    const { password, totpSecret, username, recoveryEnvelope, recoveryHash, requireTotpOnUnlock } = pendingDeviceLogin;
    const totpValid = await verifyTotp(totpSecret, totpCode);
    if (!totpValid) {
      throw new Error('Invalid authenticator code.');
    }

    const passwordHash = await hashString(password);
    const passwordEnvelope = await encryptWithSecret(totpSecret, password);
    const persisted = get(persistence);
    const totpRequirement =
      typeof requireTotpOnUnlock === 'boolean'
        ? requireTotpOnUnlock
        : persisted.requireTotpOnUnlock ?? false;

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
      status: 'authenticated',
      loading: false,
      error: null,
      pendingDeviceLogin: null,
      requireTotpOnUnlock: totpRequirement,
    }));
    toasts.addToast('Device approved and authenticated.', 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Device login failed.';
    console.error('Device login failed:', error);
    update((state) => ({ ...state, loading: false, error: message }));
    throw error;
  }
};

const generateDeviceHandshake = async (totpCode: string): Promise<string> => {
  const persisted = get(persistence);
  if (!persisted.passwordEnvelope || !persisted.totpSecret) {
    throw new Error('Device pairing is unavailable.');
  }
  const totpValid = await verifyTotp(persisted.totpSecret, totpCode);
  if (!totpValid) {
    throw new Error('Invalid authenticator code.');
  }
  const password = await decryptWithSecret(persisted.totpSecret, persisted.passwordEnvelope);
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
    throw new Error('2FA has not been configured yet.');
  }
  const totpValid = await verifyTotp(persisted.totpSecret, totpCode);
  if (!totpValid) {
    throw new Error('Invalid authenticator code.');
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
    status: 'locked',
    loading: false,
    pendingDeviceLogin: null,
    error: null,
  }));
};

const clearError = () => update((state) => ({ ...state, error: null }));

const authPersistenceStore: Readable<AuthPersistence> = { subscribe: persistence.subscribe };

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
  __resetForTests: resetForTests,
};

export { authPersistenceStore };

export type { AuthState, AuthPersistence, PasswordPolicy };
