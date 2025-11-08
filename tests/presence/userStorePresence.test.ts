import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { userStore } from "../../src/lib/stores/userStore";
import { presenceStore } from "../../src/lib/features/presence/presenceStore";
import { DEFAULT_PRESENCE_STATUS_KEY } from "../../src/lib/features/presence/statusPresets";
import type { User } from "../../src/lib/features/auth/models/User";

describe("userStore presence integration", () => {
  const baseUser: User = {
    id: "user-1",
    name: "Scout",
    avatar: "https://example.com/avatar.png",
    online: false,
    statusMessage: DEFAULT_PRESENCE_STATUS_KEY,
    location: null,
  };

  beforeEach(() => {
    presenceStore.syncFromUser(null);
    userStore.__setStateForTesting?.({ me: { ...baseUser }, loading: false });
    presenceStore.syncFromUser(baseUser);
  });

  afterEach(() => {
    userStore.__setStateForTesting?.({ me: null, loading: false });
    presenceStore.syncFromUser(null);
  });

  it("updates the current user and presence store when switching presets", () => {
    userStore.applyPresence({ statusMessage: "rendezvous" });

    const currentUser = get(userStore).me;
    expect(currentUser?.statusMessage).toBe("rendezvous");
    expect(get(presenceStore).statusKey).toBe("rendezvous");

    userStore.applyPresence({ statusMessage: "safe" });

    const updatedUser = get(userStore).me;
    expect(updatedUser?.statusMessage).toBe("safe");
    expect(get(presenceStore).statusKey).toBe("safe");
  });
});
