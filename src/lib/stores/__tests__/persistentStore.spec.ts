import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { get } from "svelte/store";

type MockedDiskStore = {
  get: Mock<[string], Promise<unknown>>;
  set: Mock<[string, unknown], Promise<void>>;
  save: Mock<[], Promise<void>>;
};

let diskStore: MockedDiskStore;
let loadSpy: Mock<[string], Promise<MockedDiskStore>>;

const waitFor = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();

  diskStore = {
    get: vi.fn(async (_key: string) => null),
    set: vi.fn(async (_key: string, _value: unknown) => {}),
    save: vi.fn(async () => {}),
  };

  loadSpy = vi.fn(async (_path: string) => diskStore);

  vi.doMock("@tauri-apps/plugin-store", () => ({
    Store: {
      load: loadSpy,
    },
  }));
});

afterEach(() => {
  vi.unmock("@tauri-apps/plugin-store");
});

describe("persistentStore", () => {
  it("provides initial values to dependent stores", async () => {
    const { theme } = await import("$lib/stores/theme");
    const { authPersistenceStore } = await import(
      "$lib/features/auth/persistenceService"
    );

    expect(get(theme)).toBe("light");
    expect(get(authPersistenceStore)).toEqual({});
  });

  it("reuses a shared Store.load promise across persistent stores", async () => {
    const { persistentStore } = await import("$lib/stores/persistentStore");

    persistentStore("first", 0);
    persistentStore("second", 1);

    await Promise.resolve();

    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it("debounces disk writes and serializes flushes", async () => {
    const { persistentStore, PERSISTENT_STORE_FLUSH_DELAY } = await import(
      "$lib/stores/persistentStore"
    );

    const store = persistentStore<{ count: number }>("counter", { count: 0 });

    await Promise.resolve();
    await waitFor(PERSISTENT_STORE_FLUSH_DELAY + 10);
    await Promise.resolve();

    diskStore.set.mockClear();
    diskStore.save.mockClear();

    store.set({ count: 1 });
    store.set({ count: 2 });

    const preFlushDelay = Math.max(0, PERSISTENT_STORE_FLUSH_DELAY - 5);
    if (preFlushDelay > 0) {
      await waitFor(preFlushDelay);
      expect(diskStore.set).not.toHaveBeenCalled();
    } else {
      expect(diskStore.set).not.toHaveBeenCalled();
    }

    await waitFor(10);
    await Promise.resolve();

    expect(diskStore.set).toHaveBeenCalledTimes(1);
    expect(diskStore.set).toHaveBeenCalledWith("counter", { count: 2 });
    expect(diskStore.save).toHaveBeenCalledTimes(1);

    store.set({ count: 3 });

    await waitFor(PERSISTENT_STORE_FLUSH_DELAY + 10);
    await Promise.resolve();

    expect(diskStore.set).toHaveBeenCalledTimes(2);
    expect(diskStore.set).toHaveBeenLastCalledWith("counter", { count: 3 });
    expect(diskStore.save).toHaveBeenCalledTimes(2);
  });
});
