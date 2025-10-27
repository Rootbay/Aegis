import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi, beforeEach } from "vitest";

const gotoMock = vi.hoisted(() => vi.fn());
const logoutMock = vi.hoisted(() => vi.fn());

function createReadableStore<T>(value: T) {
  return {
    subscribe(run: (value: T) => void) {
      run(value);
      return () => {};
    },
  };
}

vi.mock("$app/environment", () => ({
  browser: true,
}));

vi.mock("$app/navigation", () => ({
  goto: gotoMock,
}));

vi.mock("$app/stores", () => ({
  page: createReadableStore({ url: new URL("http://localhost/settings") }),
}));

vi.mock("$lib/stores/navigationStore", () => ({
  lastVisitedServerId: createReadableStore<string | null>(null),
}));

vi.mock("$lib/features/auth/stores/authStore", () => ({
  authStore: {
    logout: logoutMock,
  },
}));

import SettingsLayout from "../../src/routes/settings/+layout.svelte";

describe("Settings layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs out and redirects when the Log Out button is clicked", async () => {
    const { getByText } = render(SettingsLayout, {
      props: {
        children: () => null,
      },
    });

    await fireEvent.click(getByText("Log Out"));

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(gotoMock).toHaveBeenCalledWith("/");
  });
});
