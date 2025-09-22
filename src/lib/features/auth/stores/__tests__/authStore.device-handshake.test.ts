import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import type { DeviceHandshakePayload } from "$lib/utils/security";

vi.mock("$app/environment", () => ({ browser: true }));

let mockHandshake: DeviceHandshakePayload | null = null;

const hashStringMock = vi.fn<(value: string) => Promise<string>>();
const encryptWithSecretMock = vi.fn<
  (
    secret: string,
    plain: string,
  ) => Promise<{ cipherText: string; iv: string; salt: string }>
>();
const verifyTotpMock = vi.fn<
  (secret: string, token: string) => Promise<boolean>
>();
const invokeMock = vi.fn<(...args: unknown[]) => unknown>();
const initializeMock = vi.fn<
  (password: string, opts: { username: string }) => void
>();
const addToastMock = vi.fn<
  (msg: string, variant: "success" | "error" | "info" | string) => void
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

vi.mock("$lib/utils/security", () => ({
  generateRecoveryPhrase: (count: number) =>
    Array.from({ length: count }, () => "word"),
  pickRecoveryConfirmationIndices: () => [0, 1, 2],
  normalizeRecoveryPhrase: (input: string | string[]) =>
    Array.isArray(input) ? input.join(" ") : input,
  derivePasswordKey: async () => "phrase-key",

  hashString: (...args: Parameters<typeof hashStringMock>) =>
    hashStringMock(...args),
  encryptWithSecret: (
    ...args: Parameters<typeof encryptWithSecretMock>
  ) => encryptWithSecretMock(...args),
  verifyTotp: (...args: Parameters<typeof verifyTotpMock>) =>
    verifyTotpMock(...args),

  decryptWithSecret: async () => "decrypted",
  generateTotpSecret: () => "TOTPMOCKSECRET",
  buildTotpUri: () => "otpauth://mock",
  encodeDeviceHandshake: () => "encoded-handshake",
  decodeDeviceHandshake: () => mockHandshake,
}));

type AuthModule = typeof import("$lib/features/auth/stores/authStore");

let authStore: AuthModule["authStore"];
let authPersistenceStore: AuthModule["authPersistenceStore"];

describe("authStore device handshake", () => {
  beforeEach(async () => {
    mockHandshake = null;

    initializeMock.mockReset();
    addToastMock.mockReset();

    hashStringMock.mockReset();
    hashStringMock.mockImplementation(async (value: string) => `hash:${value}`);

    encryptWithSecretMock.mockReset();
    encryptWithSecretMock.mockImplementation(async (secret, plain) => ({
      cipherText: `${secret}:${plain}`,
      iv: "iv",
      salt: "salt",
    }));

    verifyTotpMock.mockReset();
    verifyTotpMock.mockImplementation(async (_secret, token) => token === "123456");

    invokeMock.mockReset();
    invokeMock.mockImplementation(async () => undefined);

    const mod: AuthModule = await import("$lib/features/auth/stores/authStore");
    authStore = mod.authStore;
    authPersistenceStore = mod.authPersistenceStore;
    authStore.__resetForTests?.();
  });

  it("ingests and logs in via device handshake", async () => {
    mockHandshake = {
      version: 1,
      password: "SecurëPass💡",
      totpSecret: "SHAREDSECRET",
      username: "casey",
      issuedAt: Date.now(),
      recoveryEnvelope: null,
      recoveryHash: null,
      requireTotpOnUnlock: true,
    } satisfies DeviceHandshakePayload;

    authStore.ingestDeviceHandshake("qr://payload");
    await authStore.loginWithDeviceHandshake("123456");

    const persistence = get(authPersistenceStore);
    expect(persistence.passwordHash).toBe("hash:SecurëPass💡");
    expect(persistence.passwordEnvelope).toEqual({
      cipherText: "SHAREDSECRET:SecurëPass💡",
      iv: "iv",
      salt: "salt",
    });
    expect(persistence.requireTotpOnUnlock).toBe(true);
    expect(typeof persistence.lastLoginAt).toBe("string");

    const state = get(authStore);
    expect(state.status).toBe("authenticated");
    expect(state.pendingDeviceLogin).toBeNull();
    expect(state.requireTotpOnUnlock).toBe(true);

    expect(initializeMock).toHaveBeenCalledWith("SecurëPass💡", { username: "casey" });
    expect(hashStringMock).toHaveBeenCalledWith("SecurëPass💡");
    expect(encryptWithSecretMock).toHaveBeenCalledWith("SHAREDSECRET", "SecurëPass💡");
    expect(verifyTotpMock).toHaveBeenCalledWith("SHAREDSECRET", "123456");
    expect(addToastMock).toHaveBeenCalledWith(
      "Device approved and authenticated.",
      "success",
    );
  });

  it("falls back to existing unlock 2FA preference when handshake omits the flag", async () => {
    mockHandshake = {
      version: 1,
      password: "Another$ecret✓",
      totpSecret: "LEGACYSECRET",
      username: "casey",
      issuedAt: Date.now(),
      recoveryEnvelope: null,
      recoveryHash: null,
    } satisfies DeviceHandshakePayload;

    authStore.setRequireTotpOnUnlock(true);

    authStore.ingestDeviceHandshake("qr://payload");
    await authStore.loginWithDeviceHandshake("123456");

    const persistence = get(authPersistenceStore);
    expect(persistence.requireTotpOnUnlock).toBe(true);
  });

  it("allows legacy ASCII unlock passwords during identity migration", async () => {
    invokeMock.mockImplementation(async (cmd) => {
      if (cmd === "is_identity_created") return true;
      return undefined;
    });

    await authStore.bootstrap();
    authStore.beginOnboarding("casey");

    expect(() => authStore.saveOnboardingPassword("LegacyOnly1")).not.toThrow();

    const state = get(authStore);
    expect(state.passwordPolicy).toBe("legacy_allowed");
    expect(state.onboarding?.password).toBe("LegacyOnly1");
  });
});
