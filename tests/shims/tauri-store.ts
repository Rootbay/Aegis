import { vi } from "vitest";

type StoreValue = unknown;

type StoreMap = Map<string, StoreValue>;

class MemoryStore {
  #data: StoreMap;

  constructor(data?: StoreMap) {
    this.#data = data ?? new Map();
  }

  async get<T>(key: string): Promise<T | null> {
    return (this.#data.get(key) as T | undefined) ?? null;
  }

  async set(key: string, value: StoreValue): Promise<void> {
    const clone =
      typeof structuredClone === "function"
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
    this.#data.set(key, clone);
  }

  async save(): Promise<void> {
    // No-op for in-memory store used in tests.
  }

  async delete(key: string): Promise<void> {
    this.#data.delete(key);
  }
}

const stores = new Map<string, MemoryStore>();

function getOrCreateStore(path: string): MemoryStore {
  if (!stores.has(path)) {
    stores.set(path, new MemoryStore());
  }
  return stores.get(path)!;
}

export const Store = {
  load: vi.fn(async (path: string) => getOrCreateStore(path)),
};

export function __resetAllStores() {
  stores.clear();
  Store.load.mockClear();
}
