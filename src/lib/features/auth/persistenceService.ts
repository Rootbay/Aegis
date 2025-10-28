import { get, type Readable } from "svelte/store";

import { persistentStore } from "$lib/stores/persistentStore";
import type { SecretEnvelope } from "$lib/utils/security";

export type TrustedDevice = {
  id: string;
  name: string;
  lastUsed: string;
  userAgent?: string;
  ipAddress?: string;
  location?: string;
};

export type SecurityQuestion = {
  question: string;
  answerHash: string;
};

export type AuthPersistence = {
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

export const DEFAULT_SESSION_TIMEOUT = 60;

const persistence = persistentStore<AuthPersistence>("auth-state", {});

export const authPersistenceStore: Readable<AuthPersistence> = {
  subscribe: persistence.subscribe,
};

export const getAuthPersistence = () => get(persistence);

export const setAuthPersistence = (value: AuthPersistence) =>
  persistence.set(value);

export const updateAuthPersistence = (
  updater: (value: AuthPersistence) => AuthPersistence,
) => persistence.update(updater);

export const resetAuthPersistence = () => persistence.set({});
