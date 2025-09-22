import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import type { Writable } from "svelte/store";

vi.mock("$app/environment", () => ({ browser: true }));

type AuthModule = typeof import("$lib/features/auth/stores/authStore");

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
const initializeMock = vi.fn<
  (password: string, opts: { username: string }) => void
>();
const addToastMock = vi.fn<
  (msg: string, variant: "success" | "error" | "info" | string) => void
>();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
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

let authPersistenceWritable: Writable<unknown> | null = null;

vi.mock("$lib/stores/persistentStore", async () => {
  const { writable } = await import("svelte/store");
  return {
    persistentStore: (key: string, initialValue: unknown) => {
      const store = writable(initialValue);
      if (key === "auth-state") {
        authPersistenceWritable = store;
      }
      return {
        subscribe: store.subscribe,
        set: store.set,
        update: store.update,
      };
    },
    __getAuthStore: () => authPersistenceWritable,
  };
});

const generatedPhrase = [
  "alpha",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "golf",
  "hotel",
  "india",
  "juliet",
  "kilo",
  "lima",
];

vi.mock("$lib/utils/security", () => ({
  generateRecoveryPhrase: (count: number) => generatedPhrase.slice(0, count),
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
  decodeDeviceHandshake: () => null,
}));

describe("security question recovery acknowledgment", () => {
  let authStore: AuthModule["authStore"];
  let authPersistenceStore: AuthModule["authPersistenceStore"];

  beforeEach(async () => {
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
    verifyTotpMock.mockResolvedValue(true);

    const mod: AuthModule = await import("$lib/features/auth/stores/authStore");
    authStore = mod.authStore;
    authPersistenceStore = mod.authPersistenceStore;
    authStore.__resetForTests?.();

    const persistenceMock = (await import(
      "$lib/stores/persistentStore"
    )) as unknown as {
      __getAuthStore?: () => Writable<unknown> | null;
    };
    const writable = persistenceMock.__getAuthStore?.();
    if (!writable) {
      throw new Error("persistentStore mock did not capture auth store");
    }
    const now = new Date().toISOString();
    writable.set({
      username: "casey",
      securityQuestions: [
        { question: "First pet?", answerHash: "hash:fluffy" },
        { question: "City?", answerHash: "hash:denver" },
        { question: "Teacher?", answerHash: "hash:smith" },
      ],
      trustedDevices: [],
      sessionTimeoutMinutes: 60,
      requireTotpOnUnlock: false,
      backupCodes: [],
      backupCodesUsed: [],
      createdAt: now,
      lastLoginAt: now,
    });
  });

  it("stages a new recovery phrase and requires acknowledgment before completion", async () => {
    const answers = {
      "First pet?": "Fluffy",
      "City?": "Denver",
      "Teacher?": "Smith",
    };

    const stagedPhrase = await authStore.loginWithSecurityQuestions({
      answers,
      newPassword: "N3wP@ssw0rd!Ω",
      totpCode: undefined,
    });

    expect(stagedPhrase).toEqual(generatedPhrase);
    const stateAfterStage = get(authStore);
    expect(stateAfterStage.status).toBe("recovery_ack_required");
    expect(stateAfterStage.pendingRecoveryRotation?.newRecoveryPhrase).toEqual(
      generatedPhrase,
    );
    expect(stateAfterStage.pendingRecoveryRotation?.newPassword).toBe(
      "N3wP@ssw0rd!Ω",
    );
    expect(initializeMock).not.toHaveBeenCalled();

    expect(addToastMock).toHaveBeenCalledWith(
      "Write down your new recovery phrase before finalizing recovery.",
      "info",
    );

    const persistenceAfterStage = get(authPersistenceStore);
    expect(persistenceAfterStage).not.toHaveProperty("recoveryHash");

    await authStore.completeSecurityQuestionRecovery();

    const persistence = get(authPersistenceStore);
    expect(persistence.username).toBe("casey");
    expect(persistence.recoveryHash).toBe(
      "hash:" + generatedPhrase.join(" "),
    );
    expect(persistence.recoveryEnvelope).toEqual({
      cipherText: "phrase-key:N3wP@ssw0rd!Ω",
      iv: "iv",
      salt: "salt",
    });
    expect(persistence.passwordHash).toBe("hash:N3wP@ssw0rd!Ω");

    const finalState = get(authStore);
    expect(finalState.status).toBe("authenticated");
    expect(finalState.pendingRecoveryRotation).toBeNull();
    expect(initializeMock).toHaveBeenCalledWith("N3wP@ssw0rd!Ω", {
      username: "casey",
    });
    expect(addToastMock).toHaveBeenLastCalledWith(
      "Account recovered successfully. Store your new recovery phrase safely.",
      "success",
    );
  });

  it("blocks repeated security question recovery attempts while acknowledgment is pending", async () => {
    const answers = {
      "First pet?": "Fluffy",
      "City?": "Denver",
      "Teacher?": "Smith",
    };

    await authStore.loginWithSecurityQuestions({
      answers,
      newPassword: "Another$ecure9!Ω",
      totpCode: undefined,
    });

    await expect(
      authStore.loginWithSecurityQuestions({
        answers,
        newPassword: "NewPass123!Ω",
        totpCode: undefined,
      }),
    ).rejects.toThrow(
      "Finish storing your new recovery phrase before continuing.",
    );

    const state = get(authStore);
    expect(state.status).toBe("recovery_ack_required");
    expect(state.pendingRecoveryRotation?.newPassword).toBe("Another$ecure9!Ω");
  });
});
