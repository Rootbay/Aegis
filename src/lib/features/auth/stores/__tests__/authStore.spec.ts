import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

vi.mock("$lib/stores/persistentStore", async () => {
  const { writable } = await import("svelte/store");
  return {
    persistentStore: (_key: string, initialValue: unknown) => {
      const store = writable(initialValue);
      return {
        subscribe: store.subscribe,
        set: store.set,
        update: store.update,
      };
    },
  };
});

const invokeMock = vi.fn<(...args: unknown[]) => unknown>();
const addToastMock =
  vi.fn<
    (msg: string, variant: "success" | "error" | "info" | string) => void
  >();
const initializeMock =
  vi.fn<
    (password: string, options: { username?: string }) => Promise<void> | void
  >();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("$lib/stores/userStore", () => ({
  userStore: {
    initialize: (...args: Parameters<typeof initializeMock>) =>
      initializeMock(...args),
    reset: vi.fn(),
  },
}));

vi.mock("$lib/stores/ToastStore", () => ({
  toasts: {
    addToast: (...args: Parameters<typeof addToastMock>) =>
      addToastMock(...args),
  },
}));

const ingestDeviceHandshakeMock = vi.fn<(raw: string) => unknown>();
const approveDeviceHandshakeMock = vi.fn<
  (options: unknown) => Promise<{
    updatedPersistence: Record<string, unknown>;
    totpRequirement: boolean;
  }>
>();
const createDeviceHandshakeMock =
  vi.fn<(options: unknown) => Promise<string>>();
const getDeviceInfoMock =
  vi.fn<() => Promise<{ id: string; name: string; lastUsed: string }>>();

vi.mock("$lib/features/auth/deviceHandshakeService", () => ({
  ingestDeviceHandshake: (
    ...args: Parameters<typeof ingestDeviceHandshakeMock>
  ) => ingestDeviceHandshakeMock(...args),
  approveDeviceHandshake: (
    ...args: Parameters<typeof approveDeviceHandshakeMock>
  ) => approveDeviceHandshakeMock(...args),
  createDeviceHandshake: (
    ...args: Parameters<typeof createDeviceHandshakeMock>
  ) => createDeviceHandshakeMock(...args),
  getDeviceInfo: (...args: Parameters<typeof getDeviceInfoMock>) =>
    getDeviceInfoMock(...args),
}));

const configureSecurityQuestionsMock =
  vi.fn<(options: unknown) => Promise<void>>();
const prepareSecurityQuestionRecoveryMock =
  vi.fn<(options: unknown) => Promise<{ newRecoveryPhrase: string[] }>>();
const finalizeSecurityQuestionRecoveryMock =
  vi.fn<
    (
      options: unknown,
    ) => Promise<{ requireTotpOnUnlock?: boolean; username?: string }>
  >();

vi.mock("$lib/features/auth/securityService", () => ({
  configureSecurityQuestions: (
    ...args: Parameters<typeof configureSecurityQuestionsMock>
  ) => configureSecurityQuestionsMock(...args),
  prepareSecurityQuestionRecovery: (
    ...args: Parameters<typeof prepareSecurityQuestionRecoveryMock>
  ) => prepareSecurityQuestionRecoveryMock(...args),
  finalizeSecurityQuestionRecovery: (
    ...args: Parameters<typeof finalizeSecurityQuestionRecoveryMock>
  ) => finalizeSecurityQuestionRecoveryMock(...args),
}));

vi.mock("$lib/utils/security", () => ({
  generateRecoveryPhrase: (count: number) =>
    Array.from({ length: count }, () => "word"),
  pickRecoveryConfirmationIndices: () => [0, 1, 2],
  normalizeRecoveryPhrase: (input: string | string[]) =>
    Array.isArray(input) ? input.join(" ") : input,
  derivePasswordKey: async () => "phrase-key",
  hashString: async (value: string) => `hash:${value}`,
  generateTotpSecret: () => "TOTP-SECRET",
  buildTotpUri: () => "otpauth://mock",
  verifyTotp: async () => true,
  encryptWithSecret: async (_secret: string, plain: string) => ({
    cipherText: `cipher:${plain}`,
    iv: "iv",
    salt: "salt",
  }),
  decryptWithSecret: async () => "decrypted",
}));

describe("authStore (integration)", () => {
  beforeEach(() => {
    vi.resetModules();

    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd) => {
      if (cmd === "is_identity_created") return false;
      if (cmd === "rekey_identity") return undefined;
      return undefined;
    });

    addToastMock.mockReset();
    initializeMock.mockReset();

    ingestDeviceHandshakeMock.mockReset();
    approveDeviceHandshakeMock.mockReset();
    createDeviceHandshakeMock.mockReset();
    getDeviceInfoMock.mockReset();

    configureSecurityQuestionsMock.mockReset();
    prepareSecurityQuestionRecoveryMock.mockReset();
    finalizeSecurityQuestionRecoveryMock.mockReset();

    approveDeviceHandshakeMock.mockImplementation(async () => ({
      updatedPersistence: {
        username: "casey",
        passwordHash: "hash:pass",
        requireTotpOnUnlock: false,
      },
      totpRequirement: false,
    }));

    ingestDeviceHandshakeMock.mockImplementation(() => ({
      password: "pass",
      totpSecret: "secret",
      username: "casey",
    }));

    getDeviceInfoMock.mockImplementation(async () => ({
      id: "device-1",
      name: "Test Device",
      lastUsed: new Date().toISOString(),
    }));

    prepareSecurityQuestionRecoveryMock.mockImplementation(async () => ({
      newRecoveryPhrase: ["alpha", "beta"],
    }));

    finalizeSecurityQuestionRecoveryMock.mockImplementation(async () => ({
      requireTotpOnUnlock: false,
      username: "casey",
    }));
  });

  it("boots into setup when identity is missing", async () => {
    const mod = await import("$lib/features/auth/stores/authStore");
    const { authStore } = mod;

    await authStore.bootstrap();

    const state = get(authStore);
    expect(state.status).toBe("needs_setup");
    expect(state.loading).toBe(false);
  });

  it("starts a quickstart session and gates handoff until hardened", async () => {
    const mod = await import("$lib/features/auth/stores/authStore");
    const { authStore } = mod;

    await authStore.beginQuickstart("Nova");

    const state = get(authStore);
    expect(state.status).toBe("quickstart");
    expect(state.setupChecklist.quickstart).toBe(true);
    expect(state.highRiskBlocked).toBe(true);

    await expect(authStore.generateDeviceHandshake("123456")).rejects.toThrow(
      /Device handoff is blocked/,
    );
    expect(createDeviceHandshakeMock).not.toHaveBeenCalled();
  });

  it("authenticates via delegated device handshake", async () => {
    const mod = await import("$lib/features/auth/stores/authStore");
    const { authStore, authPersistenceStore } = mod;

    authStore.ingestDeviceHandshake("qr://payload");
    await authStore.loginWithDeviceHandshake("123456");

    const state = get(authStore);
    expect(state.status).toBe("authenticated");
    expect(state.pendingDeviceLogin).toBeNull();
    expect(approveDeviceHandshakeMock).toHaveBeenCalled();

    const persistence = get(authPersistenceStore);
    expect(persistence.username).toBe("casey");
  });

  it("configures security questions and starts recovery flow", async () => {
    const mod = await import("$lib/features/auth/stores/authStore");
    const { authStore } = mod;

    await authStore.configureSecurityQuestions([
      { question: "Pet", answerHash: "sam" },
      { question: "City", answerHash: "portland" },
      { question: "Food", answerHash: "pizza" },
    ]);

    let state = get(authStore);
    expect(state.securityQuestionsConfigured).toBe(true);

    await authStore.loginWithSecurityQuestions({
      answers: { Pet: "Sam", City: "Portland" },
      newPassword: "Str0ng✨Pass!23",
    });

    state = get(authStore);
    expect(state.status).toBe("recovery_ack_required");
    expect(state.pendingRecoveryRotation?.newRecoveryPhrase).toEqual([
      "alpha",
      "beta",
    ]);

    await authStore.completeSecurityQuestionRecovery();
    state = get(authStore);
    expect(state.status).toBe("authenticated");
    expect(finalizeSecurityQuestionRecoveryMock).toHaveBeenCalled();
  });
});
