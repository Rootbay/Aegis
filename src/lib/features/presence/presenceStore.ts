import { invoke } from "@tauri-apps/api/core";
import { writable, get, type Readable } from "svelte/store";
import type { User } from "$lib/features/auth/models/User";
import {
  DEFAULT_PRESENCE_STATUS_KEY,
  isPresenceStatusKey,
  type PresenceStatusKey,
} from "./statusPresets";

interface PresenceState {
  statusKey: PresenceStatusKey;
  isOnline: boolean;
  updating: boolean;
  lastError: string | null;
}

interface PresenceBroadcastResult {
  statusKey: PresenceStatusKey;
  isOnline: boolean;
}

interface PresenceStore extends Readable<PresenceState> {
  syncFromUser: (user: User | null) => void;
  setStatusKey: (statusKey: PresenceStatusKey) => void;
  clearError: () => void;
  broadcastPresence: (update?: {
    statusKey?: PresenceStatusKey;
    isOnline?: boolean;
  }) => Promise<PresenceBroadcastResult>;
}

const initialState: PresenceState = {
  statusKey: DEFAULT_PRESENCE_STATUS_KEY,
  isOnline: false,
  updating: false,
  lastError: null,
};

function coerceStatusKey(value?: string | null): PresenceStatusKey {
  if (isPresenceStatusKey(value)) {
    return value;
  }
  return DEFAULT_PRESENCE_STATUS_KEY;
}

function createPresenceStore(): PresenceStore {
  const { subscribe, update, set } = writable<PresenceState>({
    ...initialState,
  });

  const syncFromUser = (user: User | null) => {
    if (!user) {
      set({ ...initialState });
      return;
    }

    update((state) => ({
      ...state,
      statusKey: coerceStatusKey(user.statusMessage),
      isOnline: user.online ?? state.isOnline,
      updating: false,
      lastError: null,
    }));
  };

  const setStatusKey = (statusKey: PresenceStatusKey) => {
    update((state) => ({
      ...state,
      statusKey,
    }));
  };

  const clearError = () => {
    update((state) => ({ ...state, lastError: null }));
  };

  const broadcastPresence = async (updateOverrides?: {
    statusKey?: PresenceStatusKey;
    isOnline?: boolean;
  }): Promise<PresenceBroadcastResult> => {
    const current = get({ subscribe });
    const nextStatusKey = updateOverrides?.statusKey ?? current.statusKey;
    if (!isPresenceStatusKey(nextStatusKey)) {
      throw new Error("Invalid presence status");
    }
    const nextIsOnline = updateOverrides?.isOnline ?? current.isOnline;

    update((state) => ({
      ...state,
      statusKey: nextStatusKey,
      isOnline: nextIsOnline,
      updating: true,
      lastError: null,
    }));

    try {
      await invoke("send_presence_update", {
        is_online: nextIsOnline,
        status_message: nextStatusKey,
        location: null,
      });

      update((state) => ({
        ...state,
        updating: false,
      }));

      return {
        statusKey: nextStatusKey,
        isOnline: nextIsOnline,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error ?? "Unknown error");
      update((state) => ({
        ...state,
        updating: false,
        lastError: message,
      }));
      throw error;
    }
  };

  return {
    subscribe,
    syncFromUser,
    setStatusKey,
    clearError,
    broadcastPresence,
  };
}

export const presenceStore = createPresenceStore();
