import { get } from "svelte/store";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";

import { createToastStore } from "../ToastStore";
import type { ToastStoreOptions } from "../ToastStore";

describe("createToastStore", () => {
  const createStore = (options: ToastStoreOptions = {}) =>
    createToastStore({
      maxDedupeCacheSize: 50,
      ...options,
    });

  let now = 0;
  type DateNowSpy = MockInstance<() => number>;
  let nowSpy: DateNowSpy | undefined;

  beforeEach(() => {
    now = 0;
    const dateNowSpy = vi.spyOn(Date, "now");
    dateNowSpy.mockImplementation(() => now);
    nowSpy = dateNowSpy;
  });

  afterEach(() => {
    nowSpy?.mockRestore();
  });

  it("dedupes identical messages within the dedupe window", () => {
    const store = createStore();
    const firstId = store.addToast("Hello", "info");
    const secondId = store.addToast("Hello", "info");

    expect(firstId).not.toBe("");
    expect(secondId).toBe("");

    const activeToasts = get(store);
    expect(activeToasts).toHaveLength(1);
    expect(activeToasts[0]?.message).toBe("Hello");
  });

  it("prunes stale dedupe entries once they fall outside the dedupe window", () => {
    const dedupeCache = new Map<string, number>();
    const store = createStore({
      dedupeCache,
      dedupeWindowMs: 2000,
    });

    store.addToast("A", "info");
    expect(dedupeCache.size).toBe(1);

    now += 2100;
    store.addToast("B", "info");

    expect(dedupeCache.size).toBe(1);
    expect([...dedupeCache.keys()]).toEqual(["info:B"]);
  });

  it("evicts the oldest dedupe entry when the cache size limit is exceeded", () => {
    const dedupeCache = new Map<string, number>();
    const store = createStore({
      dedupeCache,
      dedupeWindowMs: 10_000,
      maxDedupeCacheSize: 2,
    });

    const first = store.addToast("First", "info");
    now += 10;
    const second = store.addToast("Second", "info");
    now += 10;
    const third = store.addToast("Third", "info");

    expect(first).not.toBe("");
    expect(second).not.toBe("");
    expect(third).not.toBe("");
    expect(dedupeCache.size).toBe(2);
    expect([...dedupeCache.keys()]).toEqual(["info:Second", "info:Third"]);

    const readded = store.addToast("First", "info");
    expect(readded).not.toBe("");
    expect(dedupeCache.size).toBe(2);
    expect([...dedupeCache.keys()]).toEqual(["info:Third", "info:First"]);
  });
});
