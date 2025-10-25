import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/environment", () => ({
  browser: true,
}));

type ListenFn = <T>(event: string, handler: (payload: T) => void) => Promise<() => void>;

describe("getListen", () => {
  beforeEach(async () => {
    delete (window as typeof window & { __TAURI__?: unknown }).__TAURI__;

    const module = await import("./tauri");
    module.__resetTauriServiceStateForTesting();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as typeof window & { __TAURI__?: unknown }).__TAURI__;
  });

  it("polls for the Tauri listen function and resolves once available", async () => {
    vi.useFakeTimers();

    const { getListen } = await import("./tauri");

    const listenFn: ListenFn = async () => vi.fn();

    setTimeout(() => {
      (window as typeof window & { __TAURI__?: { event?: { listen?: ListenFn } } }).__TAURI__ = {
        event: { listen: listenFn },
      };
    }, 60);

    const promise = getListen();

    await vi.advanceTimersByTimeAsync(60);
    await vi.advanceTimersByTimeAsync(50);

    const resolved = await promise;
    expect(resolved).toBe(listenFn);
  });

  it("returns null after timing out when Tauri never initialises", async () => {
    vi.useFakeTimers();

    const { getListen } = await import("./tauri");

    const promise = getListen();

    await vi.advanceTimersByTimeAsync(5000);

    const resolved = await promise;
    expect(resolved).toBeNull();
  });

  it("caches the resolved listen function to avoid re-polling", async () => {
    const { getListen } = await import("./tauri");

    const listenFn: ListenFn = async () => vi.fn();

    (window as typeof window & { __TAURI__?: { event?: { listen?: ListenFn } } }).__TAURI__ = {
      event: { listen: listenFn },
    };

    const first = await getListen();
    expect(first).toBe(listenFn);

    delete (window as typeof window & { __TAURI__?: unknown }).__TAURI__;

    const second = await getListen();
    expect(second).toBe(listenFn);
  });
});
