import { invoke } from "@tauri-apps/api/core";
import { writable, get, type Readable } from "svelte/store";
import type { User } from "$lib/features/auth/models/User";

interface PresenceState {
  statusMessage: string;
  locationInput: string;
  sharedLocation: string | null;
  locationConsent: boolean;
  isOnline: boolean;
  updating: boolean;
  lastError: string | null;
}

interface PresenceBroadcastResult {
  statusMessage: string | null;
  location: string | null;
  isOnline: boolean;
}

interface PresenceStore extends Readable<PresenceState> {
  syncFromUser: (user: User | null) => void;
  setStatusMessage: (message: string) => void;
  setLocationInput: (value: string) => void;
  setLocationConsent: (enabled: boolean) => void;
  clearError: () => void;
  broadcastPresence: (update?: {
    statusMessage?: string;
    locationInput?: string;
    locationConsent?: boolean;
    isOnline?: boolean;
  }) => Promise<PresenceBroadcastResult>;
}

const initialState: PresenceState = {
  statusMessage: "",
  locationInput: "",
  sharedLocation: null,
  locationConsent: false,
  isOnline: false,
  updating: false,
  lastError: null,
};

function normalizeStatusMessage(value?: string | null): string {
  return value?.trim() ?? "";
}

function normalizeLocation(value?: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
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

    const statusMessage = normalizeStatusMessage(user.statusMessage);
    const normalizedLocation = normalizeLocation(user.location);

    update((state) => ({
      ...state,
      statusMessage,
      locationInput:
        normalizedLocation !== null ? normalizedLocation : state.locationInput,
      sharedLocation: normalizedLocation,
      locationConsent: normalizedLocation !== null,
      isOnline: user.online ?? state.isOnline,
      updating: false,
      lastError: null,
    }));
  };

  const setStatusMessage = (message: string) => {
    update((state) => ({
      ...state,
      statusMessage: normalizeStatusMessage(message),
    }));
  };

  const setLocationInput = (value: string) => {
    update((state) => ({
      ...state,
      locationInput: value,
    }));
  };

  const setLocationConsent = (enabled: boolean) => {
    update((state) => ({
      ...state,
      locationConsent: enabled,
    }));
  };

  const clearError = () => {
    update((state) => ({ ...state, lastError: null }));
  };

  const broadcastPresence = async (updateOverrides?: {
    statusMessage?: string;
    locationInput?: string;
    locationConsent?: boolean;
    isOnline?: boolean;
  }): Promise<PresenceBroadcastResult> => {
    const current = get({ subscribe });
    const nextStatusMessage = normalizeStatusMessage(
      updateOverrides?.statusMessage ?? current.statusMessage,
    );
    const nextLocationInput =
      updateOverrides?.locationInput ?? current.locationInput;
    const normalizedInput = nextLocationInput.trim();
    const nextLocationConsent =
      updateOverrides?.locationConsent ?? current.locationConsent;
    const nextIsOnline = updateOverrides?.isOnline ?? current.isOnline;

    const locationCandidate = normalizeLocation(normalizedInput);
    const locationToShare = nextLocationConsent ? locationCandidate : null;
    const statusMessageToShare =
      nextStatusMessage.length > 0 ? nextStatusMessage : null;

    update((state) => ({
      ...state,
      statusMessage: nextStatusMessage,
      locationInput: normalizedInput,
      locationConsent: nextLocationConsent,
      isOnline: nextIsOnline,
      updating: true,
      lastError: null,
    }));

    try {
      await invoke("send_presence_update", {
        is_online: nextIsOnline,
        status_message: statusMessageToShare ?? null,
        location: locationToShare ?? null,
      });

      update((state) => ({
        ...state,
        updating: false,
        sharedLocation: locationToShare,
      }));

      return {
        statusMessage: statusMessageToShare,
        location: locationToShare,
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
    setStatusMessage,
    setLocationInput,
    setLocationConsent,
    clearError,
    broadcastPresence,
  };
}

export const presenceStore = createPresenceStore();
