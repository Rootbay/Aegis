import {
  derivePasswordKey,
  encryptWithSecret,
  generateRecoveryPhrase,
  hashString,
  normalizeRecoveryPhrase,
  verifyTotp,
} from "$lib/utils/security";

import {
  DEFAULT_SESSION_TIMEOUT,
  getAuthPersistence,
  setAuthPersistence,
  updateAuthPersistence,
  type AuthPersistence,
  type SecurityQuestion,
} from "./persistenceService";

export const configureSecurityQuestions = async (
  questions: SecurityQuestion[],
) => {
  const hashedQuestions = await Promise.all(
    questions.map(async (q) => ({
      question: q.question,
      answerHash: await hashString(q.answerHash),
    })),
  );

  updateAuthPersistence((current) => ({
    ...current,
    securityQuestions: hashedQuestions,
  }));

  return hashedQuestions;
};

interface SecurityQuestionRecoveryOptions {
  answers: Record<string, string>;
  totpCode?: string;
}

export const prepareSecurityQuestionRecovery = async ({
  answers,
  totpCode,
}: SecurityQuestionRecoveryOptions) => {
  const persisted = getAuthPersistence();
  if (!persisted.securityQuestions || persisted.securityQuestions.length < 3) {
    throw new Error("Security questions not configured on this device.");
  }

  let correctAnswers = 0;
  for (const question of persisted.securityQuestions) {
    const providedAnswer = answers[question.question];
    if (providedAnswer) {
      const answerHash = await hashString(providedAnswer.trim().toLowerCase());
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

  return { newRecoveryPhrase } as const;
};

interface PendingRecoveryRotation {
  newRecoveryPhrase: string[];
  newPassword: string;
}

export const finalizeSecurityQuestionRecovery = async (
  pending: PendingRecoveryRotation,
  persistedOverride?: AuthPersistence,
) => {
  const persisted = persistedOverride ?? getAuthPersistence();
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

  const updatedPersistence: AuthPersistence = {
    ...persisted,
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
  };

  setAuthPersistence(updatedPersistence);

  return updatedPersistence;
};
