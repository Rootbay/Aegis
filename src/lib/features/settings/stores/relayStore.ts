import { writable, get, type Readable } from "svelte/store";
import { getInvoke } from "../../../services/tauri";
import { toasts } from "../../../stores/ToastStore";
import { serverStore } from "../../servers/stores/serverStore";
import type {
  RelayConfig,
  RelayHealthUpdate,
  RelayRecord,
  RelaySnapshot,
} from "../models/relay";

interface RelayStoreState {
  relays: RelayRecord[];
  loading: boolean;
  error: string | null;
}

interface RelayStore extends Readable<RelayStoreState> {
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  registerRelay: (config: RelayConfig) => Promise<RelayRecord | null>;
  removeRelay: (relayId: string) => Promise<boolean>;
  updateRelayHealth: (update: RelayHealthUpdate) => Promise<RelayRecord | null>;
  mapRelayParticipation: (snapshot: RelaySnapshot[]) => void;
}

const initialState: RelayStoreState = {
  relays: [],
  loading: false,
  error: null,
};

function createRelayStore(): RelayStore {
  const { subscribe, update, set } = writable<RelayStoreState>(initialState);

  const applyRelayState = (relays: RelayRecord[]) => {
    set({ relays, loading: false, error: null });
    serverStore.applyRelayBindings(relays);
  };

  const loadRelays = async () => {
    const invoke = await getInvoke();
    if (!invoke) {
      applyRelayState([]);
      return;
    }

    try {
      const backendRelays = await invoke<RelayRecord[]>("list_relays");
      applyRelayState(backendRelays ?? []);
    } catch (error) {
      console.error("Failed to load relay configuration", error);
      update((state) => ({
        ...state,
        loading: false,
        error: "Failed to load relay configuration.",
      }));
    }
  };

  const initialize = async () => {
    if (get({ subscribe }).loading || get({ subscribe }).relays.length > 0) {
      return;
    }
    update((state) => ({ ...state, loading: true }));
    await loadRelays();
  };

  const refresh = async () => {
    update((state) => ({ ...state, loading: true }));
    await loadRelays();
  };

  const registerRelay = async (config: RelayConfig) => {
    const invoke = await getInvoke();
    if (!invoke) {
      toasts.addToast(
        "Relay management requires the desktop client.",
        "warning",
      );
      return null;
    }

    try {
      const record = await invoke<RelayRecord>("register_relay", {
        payload: { config },
      });
      if (!record) {
        return null;
      }
      update((state) => {
        const relays = state.relays.filter(
          (relay) => relay.config.id !== record.config.id,
        );
        relays.push(record);
        relays.sort((a, b) => a.config.label.localeCompare(b.config.label));
        serverStore.applyRelayBindings(relays);
        return { relays, loading: false, error: null };
      });
      return record;
    } catch (error) {
      console.error("Failed to register relay", error);
      toasts.addToast("Failed to register relay endpoint.", "error");
      return null;
    }
  };

  const removeRelay = async (relayId: string) => {
    const invoke = await getInvoke();
    if (!invoke) {
      toasts.addToast(
        "Relay management requires the desktop client.",
        "warning",
      );
      return false;
    }

    try {
      await invoke("remove_relay", { relayId });
      update((state) => {
        const relays = state.relays.filter(
          (relay) => relay.config.id !== relayId,
        );
        serverStore.applyRelayBindings(relays);
        return { ...state, relays };
      });
      return true;
    } catch (error) {
      console.error("Failed to remove relay", error);
      toasts.addToast("Failed to remove relay.", "error");
      return false;
    }
  };

  const updateRelayHealth = async (updatePayload: RelayHealthUpdate) => {
    const invoke = await getInvoke();
    if (!invoke) {
      return null;
    }

    try {
      const record = await invoke<RelayRecord>("update_relay_health", {
        payload: {
          relayId: updatePayload.relayId,
          status: updatePayload.status,
          latencyMs: updatePayload.latencyMs ?? undefined,
          uptimePercent: updatePayload.uptimePercent ?? undefined,
          error: updatePayload.error ?? undefined,
          checkedAt: updatePayload.checkedAt ?? undefined,
        },
      });

      if (!record) {
        return null;
      }

      update((state) => {
        const relays = state.relays.map((existing) =>
          existing.config.id === record.config.id ? record : existing,
        );
        serverStore.applyRelayBindings(relays);
        return { ...state, relays };
      });

      return record;
    } catch (error) {
      console.error("Failed to update relay health", error);
      return null;
    }
  };

  const mapRelayParticipation = (snapshot: RelaySnapshot[]) => {
    update((state) => {
      if (state.relays.length === 0) {
        return state;
      }
      const nextRelays = state.relays.map((relay) => {
        const telemetry = snapshot.find(
          (entry) => entry.id === relay.config.id,
        );
        if (!telemetry) {
          return relay;
        }
        return {
          ...relay,
          health: {
            status: telemetry.status ?? relay.health.status,
            lastCheckedAt:
              telemetry.lastCheckedAt ?? relay.health.lastCheckedAt,
            latencyMs: telemetry.latencyMs ?? relay.health.latencyMs,
            uptimePercent:
              telemetry.uptimePercent ?? relay.health.uptimePercent,
            error: telemetry.error ?? relay.health.error,
          },
        };
      });
      serverStore.applyRelayBindings(nextRelays);
      return { ...state, relays: nextRelays };
    });
  };

  return {
    subscribe,
    initialize,
    refresh,
    registerRelay,
    removeRelay,
    updateRelayHealth,
    mapRelayParticipation,
  };
}

export const relayStore = createRelayStore();
