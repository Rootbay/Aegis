import "@testing-library/svelte/vitest";
import { JSDOM } from "jsdom";
import { render } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import { tick } from "svelte";
import FriendsListTestHost from "./__tests__/FriendsListTestHost.svelte";
import type { Friend } from "$lib/features/friends/models/Friend";

vi.mock("$lib/services/tauri", () => ({
  getInvoke: async () => null,
  getListen: async () => null,
}));

vi.mock("./FriendItem.svelte", () => ({
  default: class MockFriendItem {},
}));

const dom = new JSDOM("<!doctype html><html><body></body></html>");
const { window } = dom;

type AnimationFrameCallback = (timestamp: number) => void;

function copyProps(src: Window & typeof globalThis, target: typeof globalThis) {
  const descriptors = Object.getOwnPropertyDescriptors(src) as Record<
    PropertyKey,
    PropertyDescriptor
  >;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key in target) continue;
    const descriptor = descriptors[key];
    if (descriptor) {
      Object.defineProperty(target, key, descriptor);
    }
  }
}

globalThis.window = window as unknown as typeof globalThis.window;
globalThis.document = window.document;
globalThis.navigator = window.navigator;
copyProps(window as Window & typeof globalThis, globalThis);
globalThis.HTMLElement = window.HTMLElement;
globalThis.SVGElement = window.SVGElement;
globalThis.MutationObserver = window.MutationObserver;
globalThis.requestAnimationFrame =
  window.requestAnimationFrame?.bind(window) ??
  ((cb: AnimationFrameCallback) => setTimeout(() => cb(Date.now()), 16));
globalThis.cancelAnimationFrame =
  window.cancelAnimationFrame?.bind(window) ??
  ((id: number) => clearTimeout(id));

describe("FriendsList", () => {
  const baseProps = {
    activeTab: "All",
  } as const;

  const renderList = (
    props: Partial<{ friends: Friend[]; activeTab: string; loading: boolean }>,
  ) =>
    render(FriendsListTestHost, {
      target: document.body,
      props: { friends: [], ...baseProps, ...props },
    });

  test("shows loading indicator while loading", () => {
    const { getByRole, queryByText } = renderList({ loading: true });

    getByRole("status");
    expect(queryByText(/no friends to display in this category/i)).toBeNull();
  });

  test("shows empty state after loading completes", async () => {
    const { getByText } = renderList({ loading: false });

    await tick();

    getByText(/no friends to display in this category/i);
  });
});
