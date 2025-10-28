import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("$app/environment", () => ({
  browser: false,
}));

vi.mock("$services/tauri", () => ({
  getInvoke: vi.fn(() => Promise.resolve(invokeMock)),
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  Store: {
    load: vi.fn(async () => ({
      get: vi.fn(async () => null),
      set: vi.fn(),
      save: vi.fn(),
    })),
  },
}));

vi.mock("$lib/stores/ToastStore", () => ({
  toasts: {
    addToast: vi.fn(),
  },
}));

import AccessibilityPage from "../../src/routes/settings/accessibility/+page.svelte";
import ContentSocialPage from "../../src/routes/settings/content_social/+page.svelte";
import DataStoragePage from "../../src/routes/settings/data_storage/+page.svelte";
import KeybindsPage from "../../src/routes/settings/keybinds/+page.svelte";
import LanguagePage from "../../src/routes/settings/language/+page.svelte";
import ConnectedAccountsPage from "../../src/routes/settings/connected_accounts/+page.svelte";
import {
  settings,
  defaultSettings,
  type ConnectedAccount,
} from "../../src/lib/features/settings/stores/settings";

describe("settings pages integrate with store", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_connected_accounts") {
        return [];
      }
      return null;
    });
    settings.set(structuredClone(defaultSettings));
  });

  it("updates accessibility toggles", async () => {
    render(AccessibilityPage);
    const toggle = screen.getByLabelText("Toggle high contrast mode");
    const initial = get(settings).enableHighContrast;

    await fireEvent.click(toggle);

    expect(get(settings).enableHighContrast).toBe(!initial);
  });

  it("updates content and social preferences", async () => {
    render(ContentSocialPage);
    const toggle = screen.getByLabelText("Toggle activity sharing");
    const initial = get(settings).autoShareActivityStatus;

    await fireEvent.click(toggle);

    expect(get(settings).autoShareActivityStatus).toBe(!initial);
  });

  it("updates data storage toggles", async () => {
    render(DataStoragePage);
    const toggle = screen.getByLabelText("Toggle automatic media downloads");
    const initial = get(settings).autoDownloadMedia;

    await fireEvent.click(toggle);

    expect(get(settings).autoDownloadMedia).toBe(!initial);
  });

  it("normalises keybind input", async () => {
    render(KeybindsPage);
    const input = screen.getByLabelText(
      "Command palette shortcut",
    ) as HTMLInputElement;

    await fireEvent.input(input, { target: { value: " ctrl + k " } });
    await fireEvent.blur(input);

    expect(get(settings).commandPaletteShortcut).toBe("ctrl+k");
  });

  it("applies language selection", async () => {
    render(LanguagePage);
    const button = screen.getByRole("button", { name: "Español" });

    await fireEvent.click(button);

    expect(get(settings).preferredLanguage).toBe("es-ES");
  });

  it("links external accounts via backend", async () => {
    const linkedAccount: ConnectedAccount = {
      id: "account-1",
      provider: "matrix",
      username: "@alice:matrix.org",
      linkedAt: new Date().toISOString(),
      scopes: ["chat"],
    };

    invokeMock.mockImplementation(async (cmd: string, args?: unknown) => {
      if (cmd === "list_connected_accounts") {
        return [];
      }
      if (cmd === "link_external_account") {
        expect(args).toEqual({
          provider: "matrix",
          username: linkedAccount.username,
        });
        return linkedAccount;
      }
      return null;
    });

    render(ConnectedAccountsPage);
    const handleInput = screen.getByLabelText(
      "Account handle",
    ) as HTMLInputElement;
    const submitButton = screen.getByRole("button", { name: "Link" });

    await fireEvent.input(handleInput, {
      target: { value: linkedAccount.username },
    });
    await fireEvent.click(submitButton);

    expect(get(settings).connectedAccounts).toEqual([linkedAccount]);
    expect(get(settings).connectedAccounts[0]).toMatchObject({
      id: linkedAccount.id,
      username: linkedAccount.username,
    });
  });
});
