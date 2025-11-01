import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../../src/lib/features/auth/models/User";
import AccountSettingsPage from "../../src/routes/settings/account/+page.svelte";

const { mockUser, userState, updateProfile, authPersistenceState } = vi.hoisted(
  () => {
    const baseUser: User = {
      id: "user-1",
      name: "Alice Example",
      avatar: "https://example.com/avatar.png",
      online: true,
      publicKey: "public-key",
      bio: "Testing avatar uploads",
      tag: "#1234",
      statusMessage: null,
      location: null,
    };
    type State = { me: User | null; loading: boolean };
    const subscribers = new Set<(value: State) => void>();
    let state: State = { me: baseUser, loading: false };
    const subscribe = (run: (value: State) => void) => {
      run(state);
      subscribers.add(run);
      return () => subscribers.delete(run);
    };
    const set = (value: State) => {
      state = value;
      subscribers.forEach((run) => run(state));
    };
    const update = vi.fn(async (_user: User) => {});
    type PersistenceState = {
      requireTotpOnUnlock: boolean;
      createdAt: string | null;
      lastLoginAt: string | null;
    };
    const persistenceSubscribers = new Set<(value: PersistenceState) => void>();
    let persistenceState: PersistenceState = {
      requireTotpOnUnlock: false,
      createdAt: null,
      lastLoginAt: null,
    };
    const persistenceStore = {
      subscribe(run: (value: PersistenceState) => void) {
        run(persistenceState);
        persistenceSubscribers.add(run);
        return () => persistenceSubscribers.delete(run);
      },
      set(value: PersistenceState) {
        persistenceState = value;
        persistenceSubscribers.forEach((run) => run(persistenceState));
      },
    };
    return {
      mockUser: baseUser,
      userState: { subscribe, set },
      updateProfile: update,
      authPersistenceState: persistenceStore,
    };
  },
);

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(async () => "data:image/png;base64,qr"),
  },
  toDataURL: vi.fn(async () => "data:image/png;base64,qr"),
}));

vi.mock("$lib/stores/userStore", () => ({
  userStore: {
    subscribe: userState.subscribe,
    updateProfile,
  },
}));

type UserState = { me: User | null; loading: boolean };
type TestUserState = {
  subscribe: (run: (value: UserState) => void) => () => void;
  set: (value: UserState) => void;
};

const typedUserState = userState as TestUserState;

vi.mock("$lib/features/auth/stores/authStore", () => ({
  authStore: {
    revealTotpSecret: vi.fn(),
    generateDeviceHandshake: vi.fn(),
    setRequireTotpOnUnlock: vi.fn(),
  },
  authPersistenceStore: {
    subscribe: authPersistenceState.subscribe,
  },
}));

class FileReaderMock {
  public result: string | ArrayBuffer | null = null;
  public readyState = 2;
  public onload: FileReader["onload"] = null;
  public onerror: FileReader["onerror"] = null;
  public onabort: FileReader["onabort"] = null;
  public onloadend: FileReader["onloadend"] = null;
  public onloadstart: FileReader["onloadstart"] = null;
  public onprogress: FileReader["onprogress"] = null;

  readAsDataURL(_file: Blob) {
    this.result = "data:image/png;base64,uploaded-avatar";
    const handler = this.onload;
    if (handler) {
      const event = new ProgressEvent("load") as ProgressEvent<FileReader>;
      handler.call(this as unknown as FileReader, event);
    }
  }
}

beforeAll(() => {
  vi.stubGlobal("FileReader", FileReaderMock as unknown as typeof FileReader);
});

beforeEach(() => {
  updateProfile.mockClear();
  typedUserState.set({ me: { ...mockUser }, loading: false });
  authPersistenceState.set({
    requireTotpOnUnlock: false,
    createdAt: null,
    lastLoginAt: null,
  });
});

describe("Account settings avatar management", () => {
  it("previews uploaded avatars and submits the data URL", async () => {
    const { container } = render(AccountSettingsPage);

    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await waitFor(() => {
      expect(
        container.querySelector<HTMLImageElement>(
          'img[alt="Avatar preview for Alice Example"]',
        ),
      ).toBeTruthy();
    });

    const avatarImage = container.querySelector<HTMLImageElement>(
      'img[alt="Avatar preview for Alice Example"]',
    )!;

    expect(fileInput).toBeTruthy();
    expect(avatarImage.getAttribute("src")).toBe(
      "https://example.com/avatar.png",
    );

    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    await fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(avatarImage.getAttribute("src") ?? "").toContain(
        "data:image/png;base64,uploaded-avatar",
      );
    });

    const saveButton = screen.getByRole("button", { name: "Save changes" });
    await fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalledTimes(1);
    });

    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        avatar: "data:image/png;base64,uploaded-avatar",
        name: "Alice Example",
      }),
    );
  });

  it("shows validation feedback when an unsupported file is uploaded", async () => {
    const { container } = render(AccountSettingsPage);

    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const invalidFile = new File(["invalid"], "avatar.txt", {
      type: "text/plain",
    });

    await fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    expect(
      screen.getByText(
        "Unsupported image type. Use PNG, JPG, GIF, SVG, or WebP.",
      ),
    ).toBeTruthy();

    const saveButton = screen.getByRole("button", { name: "Save changes" });
    await fireEvent.click(saveButton);

    await waitFor(() => {
      expect(
        screen.getByText("Resolve avatar issues before saving."),
      ).toBeTruthy();
    });

    expect(updateProfile).not.toHaveBeenCalled();
  });
});
