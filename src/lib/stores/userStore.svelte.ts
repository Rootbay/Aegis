import { invoke } from "@tauri-apps/api/core";
import type { User } from "../features/auth/models/User";
import { toasts } from "./ToastStore";
import { userCache } from "../utils/cache";
import { presenceStore } from "../features/presence/presenceStore";

const FALLBACK_AVATAR = (id: string) =>
  `https://api.dicebear.com/8.x/bottts-neutral/svg?seed=${id}`;

type BackendUser = {
  id: string;
  username?: string;
  name?: string;
  avatar: string;
  is_online?: boolean;
  online?: boolean;
  public_key?: string;
  bio?: string;
  tag?: string;
  status_message?: string | null;
  location?: string | null;
};

interface InitializeOptions {
  username?: string;
}

const DEFAULT_IDENTITY_PASSWORD = "aegis-default-password";

class UserStore {
  #me = $state<User | null>(null);
  #loading = $state(false);

  get me() { return this.#me; }
  get loading() { return this.#loading; }

  subscribe(run: (value: { me: User | null; loading: boolean }) => void) {
    run({ me: this.#me, loading: this.#loading });
    return $effect.root(() => {
      $effect(() => {
        run({ me: this.#me, loading: this.#loading });
      });
    });
  }

  #ensureAvatar(id: string, avatar?: string | null) {
    const trimmed = avatar?.trim();
    if (trimmed && trimmed.length > 0) {
      return trimmed;
    }
    return FALLBACK_AVATAR(id);
  }

  #toBackendUser(u: User) {
    return {
      id: u.id,
      username: u.name,
      avatar: this.#ensureAvatar(u.id, u.avatar),
      is_online: u.online,
      public_key: u.publicKey ?? undefined,
      bio: u.bio ?? undefined,
      tag: u.tag ?? undefined,
      status_message: u.statusMessage ?? null,
      location: u.location ?? null,
    };
  }

  #fromBackendUser(u: BackendUser): User {
    const fallbackName = u.username ?? u.name;
    const name =
      fallbackName && fallbackName.trim().length > 0
        ? fallbackName
        : `User-${u.id.slice(0, 4)}`;
    return {
      id: u.id,
      name,
      avatar: this.#ensureAvatar(u.id, u.avatar),
      online: u.is_online ?? u.online ?? false,
      publicKey: u.public_key ?? undefined,
      bio: u.bio ?? undefined,
      tag: u.tag ?? undefined,
      statusMessage: u.status_message ?? null,
      location: u.location ?? null,
    };
  }

  async getUser(id: string): Promise<User | null> {
    if (userCache.has(id)) {
      return userCache.get(id) || null;
    }
    try {
      const backendUser: BackendUser | null = await invoke("get_user", { id });
      if (backendUser) {
        const mapped = this.#fromBackendUser(backendUser);
        userCache.set(id, mapped);
        return mapped;
      }
      return null;
    } catch (error) {
      console.error(`Failed to get user ${id}:`, error);
      return null;
    }
  }

  async initialize(
    password: string,
    options?: InitializeOptions,
  ): Promise<User> {
    this.#loading = true;

    const ensureInitialized = async () => {
      try {
        await invoke("initialize_app", { password });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes("decrypt identity") ||
          message.includes("aead::Error")
        ) {
          try {
            await invoke("rekey_identity", {
              old_password: DEFAULT_IDENTITY_PASSWORD,
              new_password: password,
            });
            await invoke("initialize_app", { password });
            return;
          } catch (rekeyError) {
            console.info(
              "Generating a fresh identity after failed rekey attempt.",
              rekeyError,
            );
            await invoke("reset_identity", { password });
            await invoke("initialize_app", { password });
          }
        } else {
          throw error;
        }
      }
    };

    try {
      await ensureInitialized();
      const peerId = await invoke<string>("get_peer_id");
      let existingUser = await this.getUser(peerId);

      if (!existingUser && options?.username) {
        const publicKey = await invoke<string>("get_public_key");
        existingUser = {
          id: peerId,
          name: options.username,
          avatar: `https://api.dicebear.com/8.x/bottts-neutral/svg?seed=${peerId}`,
          online: true,
          publicKey,
          bio: "Ready for secure comms.",
          tag: "#0000",
          statusMessage: null,
          location: null,
        };
        await invoke("update_user_profile", {
          user: this.#toBackendUser(existingUser),
        });
      } else if (!existingUser) {
        throw new Error("User profile is missing. Complete onboarding first.");
      }

      this.#me = existingUser;
      this.#loading = false;
      userCache.set(existingUser.id, existingUser);
      presenceStore.syncFromUser(existingUser);
      return existingUser;
    } catch (error) {
      console.error("Failed to initialize user:", error);
      toasts.addToast("Failed to load user profile.", "error");
      this.#me = null;
      this.#loading = false;
      throw error;
    }
  }

  async toggleOnlineStatus() {
    const currentUser = this.#me;

    if (!currentUser) return;

    const newStatus = !currentUser.online;
    try {
      const presenceResult = await presenceStore.broadcastPresence({
        isOnline: newStatus,
      });
      const updatedUser = {
        ...currentUser,
        online: presenceResult.isOnline,
        statusMessage: presenceResult.statusKey,
      } as User;
      this.#me = updatedUser;
      userCache.set(updatedUser.id, updatedUser);
      presenceStore.syncFromUser(updatedUser);
      toasts.addToast(
        `You are now ${newStatus ? "Online" : "Offline"}`,
        "success",
      );
    } catch (error) {
      console.error("Failed to toggle online status:", error);
      toasts.addToast(
        `Failed to set status to ${newStatus ? "Online" : "Offline"}`,
        "error",
      );
    }
  }

  async updateProfile(updatedUser: User) {
    try {
      const normalizedUser: User = {
        ...updatedUser,
        avatar: this.#ensureAvatar(updatedUser.id, updatedUser.avatar),
      };
      await invoke("update_user_profile", {
        user: this.#toBackendUser(normalizedUser),
      });
      this.#me = normalizedUser;
      userCache.set(normalizedUser.id, normalizedUser);
      presenceStore.syncFromUser(normalizedUser);
      toasts.addToast("Profile updated successfully!", "success");
    } catch (error) {
      console.error("Failed to update user profile:", error);
      toasts.addToast("Failed to update profile.", "error");
      throw error;
    }
  }

  applyPresence({
    online,
    statusMessage,
    location,
  }: {
    online?: boolean;
    statusMessage?: string | null;
    location?: string | null;
  }) {
    if (!this.#me) return;
    const nextUser: User = {
      ...this.#me,
      online: online ?? this.#me.online,
      statusMessage:
        statusMessage !== undefined
          ? statusMessage
          : (this.#me.statusMessage ?? null),
      location:
        location !== undefined ? location : (this.#me.location ?? null),
    };
    this.#me = nextUser;
    userCache.set(nextUser.id, nextUser);
    presenceStore.syncFromUser(nextUser);
  }

  reset() {
    this.#me = null;
    this.#loading = false;
    presenceStore.syncFromUser(null);
  }

  __setStateForTesting(state: { me: User | null; loading: boolean }) {
    this.#me = state.me;
    this.#loading = state.loading;
  }
}

export const userStore = new UserStore();