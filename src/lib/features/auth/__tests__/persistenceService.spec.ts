import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("persistenceService", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("reads and writes persisted auth state", async () => {
    const mod = await import("$lib/features/auth/persistenceService");
    const { getAuthPersistence, setAuthPersistence } = mod;

    expect(getAuthPersistence()).toEqual({});

    setAuthPersistence({ username: "casey" });
    expect(getAuthPersistence()).toMatchObject({ username: "casey" });
  });

  it("updates and resets persisted state", async () => {
    const mod = await import("$lib/features/auth/persistenceService");
    const {
      getAuthPersistence,
      setAuthPersistence,
      updateAuthPersistence,
      resetAuthPersistence,
    } = mod;

    setAuthPersistence({ username: "aegis", failedAttempts: 1 });

    updateAuthPersistence((current) => ({
      ...current,
      failedAttempts: (current.failedAttempts ?? 0) + 1,
    }));

    expect(getAuthPersistence()).toMatchObject({ failedAttempts: 2 });

    resetAuthPersistence();
    expect(getAuthPersistence()).toEqual({});
  });

  it("exposes a readable store interface", async () => {
    const mod = await import("$lib/features/auth/persistenceService");
    const { authPersistenceStore, setAuthPersistence } = mod;

    let snapshot: unknown;
    const unsubscribe = authPersistenceStore.subscribe((value) => {
      snapshot = value;
    });

    setAuthPersistence({ username: "pat" });

    expect(snapshot).toMatchObject({ username: "pat" });

    unsubscribe();
  });
});
