import { beforeEach, describe, expect, it, vi } from "vitest";

const hashStringMock = vi.fn<(value: string) => Promise<string>>();
const derivePasswordKeyMock = vi.fn<(phrase: string) => Promise<string>>();
const encryptWithSecretMock = vi.fn<
  (secret: string, plain: string) => Promise<{ cipherText: string; iv: string; salt: string }>
>();
const generateRecoveryPhraseMock = vi.fn<() => string[]>();
const normalizeRecoveryPhraseMock = vi.fn<(phrase: string[] | string) => string>();
const verifyTotpMock = vi.fn<(secret: string, token: string) => Promise<boolean>>();

vi.mock("$lib/utils/security", () => ({
  hashString: (...args: Parameters<typeof hashStringMock>) =>
    hashStringMock(...args),
  derivePasswordKey: (...args: Parameters<typeof derivePasswordKeyMock>) =>
    derivePasswordKeyMock(...args),
  encryptWithSecret: (...args: Parameters<typeof encryptWithSecretMock>) =>
    encryptWithSecretMock(...args),
  generateRecoveryPhrase: (...args: Parameters<typeof generateRecoveryPhraseMock>) =>
    generateRecoveryPhraseMock(...args),
  normalizeRecoveryPhrase: (
    ...args: Parameters<typeof normalizeRecoveryPhraseMock>
  ) => normalizeRecoveryPhraseMock(...args),
  verifyTotp: (...args: Parameters<typeof verifyTotpMock>) =>
    verifyTotpMock(...args),
}));

type SecurityQuestion = {
  question: string;
  answerHash: string;
};

type AuthPersistence = {
  username?: string;
  totpSecret?: string;
  requireTotpOnUnlock?: boolean;
  securityQuestions?: SecurityQuestion[];
  trustedDevices?: unknown[];
  biometricEnabled?: boolean;
  sessionTimeoutMinutes?: number;
  backupCodes?: string[];
  backupCodesUsed?: string[];
  failedAttempts?: number;
  lastFailedAttempt?: string;
  accountLockedUntil?: string | null;
  createdAt?: string;
  lastLoginAt?: string;
  passwordHash?: string;
  passwordEnvelope?: { cipherText: string; iv: string; salt: string } | null;
  recoveryEnvelope?: { cipherText: string; iv: string; salt: string } | null;
  recoveryHash?: string | null;
};

let persistedState: AuthPersistence = {};

vi.mock("$lib/features/auth/persistenceService", () => ({
  DEFAULT_SESSION_TIMEOUT: 60,
  getAuthPersistence: () => persistedState,
  setAuthPersistence: (value: AuthPersistence) => {
    persistedState = value;
  },
  updateAuthPersistence: (
    updater: (value: AuthPersistence) => AuthPersistence,
  ) => {
    persistedState = updater(persistedState);
  },
}));

describe("securityService", () => {
  beforeEach(() => {
    vi.resetModules();

    persistedState = {
      username: "casey",
      totpSecret: "SECRET",
      requireTotpOnUnlock: true,
      securityQuestions: [
        { question: "Pet", answerHash: "hash:sam" },
        { question: "City", answerHash: "hash:portland" },
        { question: "Food", answerHash: "hash:pizza" },
      ],
      sessionTimeoutMinutes: 30,
      backupCodesUsed: ["A"],
    };

    hashStringMock.mockReset();
    hashStringMock.mockImplementation(async (value: string) => `hash:${value}`);

    derivePasswordKeyMock.mockReset();
    derivePasswordKeyMock.mockImplementation(async () => "phrase-key");

    encryptWithSecretMock.mockReset();
    encryptWithSecretMock.mockImplementation(async (secret, plain) => ({
      cipherText: `${secret}:${plain}`,
      iv: "iv",
      salt: "salt",
    }));

    generateRecoveryPhraseMock.mockReset();
    generateRecoveryPhraseMock.mockReturnValue([
      "alpha",
      "beta",
      "gamma",
    ]);

    normalizeRecoveryPhraseMock.mockReset();
    normalizeRecoveryPhraseMock.mockImplementation((phrase) =>
      Array.isArray(phrase) ? phrase.join(" ") : phrase,
    );

    verifyTotpMock.mockReset();
    verifyTotpMock.mockImplementation(async (_secret, token) => token === "123456");
  });

  it("hashes and stores configured security questions", async () => {
    const mod = await import("$lib/features/auth/securityService");
    const { configureSecurityQuestions } = mod;

    await configureSecurityQuestions([
      { question: "Pet", answerHash: "sam" },
      { question: "City", answerHash: "portland" },
      { question: "Food", answerHash: "pizza" },
    ]);

    expect(persistedState.securityQuestions).toEqual([
      { question: "Pet", answerHash: "hash:sam" },
      { question: "City", answerHash: "hash:portland" },
      { question: "Food", answerHash: "hash:pizza" },
    ]);
    expect(hashStringMock).toHaveBeenCalledWith("sam");
  });

  it("validates answers before starting recovery", async () => {
    const mod = await import("$lib/features/auth/securityService");
    const { prepareSecurityQuestionRecovery } = mod;

    const result = await prepareSecurityQuestionRecovery({
      answers: {
        Pet: "Sam",
        City: "Portland",
      },
      totpCode: "123456",
    });

    expect(result.newRecoveryPhrase).toEqual(["alpha", "beta", "gamma"]);
    expect(verifyTotpMock).toHaveBeenCalledWith("SECRET", "123456");
  });

  it("finalizes recovery by updating persisted credentials", async () => {
    const mod = await import("$lib/features/auth/securityService");
    const { finalizeSecurityQuestionRecovery } = mod;

    await finalizeSecurityQuestionRecovery({
      newRecoveryPhrase: ["delta", "epsilon", "zeta"],
      newPassword: "Str0ngPass!",
    });

    expect(normalizeRecoveryPhraseMock).toHaveBeenCalled();
    expect(encryptWithSecretMock).toHaveBeenCalledWith("SECRET", "Str0ngPass!");
    expect(persistedState.passwordHash).toBe("hash:Str0ngPass!");
    expect(persistedState.recoveryEnvelope).toEqual({
      cipherText: "phrase-key:Str0ngPass!",
      iv: "iv",
      salt: "salt",
    });
    expect(persistedState.failedAttempts).toBe(0);
    expect(persistedState.backupCodesUsed).toEqual(["A"]);
    expect(persistedState.sessionTimeoutMinutes).toBe(30);
  });
});
