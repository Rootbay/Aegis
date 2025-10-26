import { get, writable, type Readable } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";

type BackendChannelPreference = {
  channel_id: string;
  hide_member_names: boolean;
};

type ChannelPreferenceState = Map<string, { hideMemberNames: boolean }>;

interface ChannelDisplayPreferencesStore
  extends Readable<ChannelPreferenceState> {
  loadForServer: (serverId: string, channelIds?: string[]) => Promise<void>;
  setHideMemberNames: (channelId: string, hide: boolean) => Promise<void>;
  toggleHideMemberNames: (channelId: string) => Promise<boolean>;
}

function createChannelDisplayPreferencesStore(): ChannelDisplayPreferencesStore {
  const stateStore = writable<ChannelPreferenceState>(new Map());
  const { subscribe, update } = stateStore;

  const applyPreferences = (
    preferences: BackendChannelPreference[],
    channelIdsToReset: string[] = [],
  ) => {
    update((state) => {
      const next = new Map(state);
      if (channelIdsToReset.length > 0) {
        for (const id of channelIdsToReset) {
          next.delete(id);
        }
      }
      for (const pref of preferences) {
        next.set(pref.channel_id, {
          hideMemberNames: pref.hide_member_names,
        });
      }
      return next;
    });
  };

  const loadForServer = async (
    serverId: string,
    channelIds: string[] = [],
  ): Promise<void> => {
    try {
      const result = await invoke<BackendChannelPreference[]>(
        "get_channel_display_preferences",
        { server_id: serverId },
      );
      applyPreferences(result, channelIds);
    } catch (error) {
      console.error(
        "Failed to load channel display preferences for server",
        serverId,
        error,
      );
    }
  };

  const setHideMemberNames = async (
    channelId: string,
    hide: boolean,
  ): Promise<void> => {
    const response = await invoke<BackendChannelPreference>(
      "set_channel_display_preferences",
      {
        channel_id: channelId,
        hide_member_names: hide,
      },
    );
    applyPreferences([response]);
  };

  const toggleHideMemberNames = async (channelId: string) => {
    const state = get(stateStore);
    const current = state.get(channelId)?.hideMemberNames ?? false;
    await setHideMemberNames(channelId, !current);
    return !current;
  };

  return {
    subscribe,
    loadForServer,
    setHideMemberNames,
    toggleHideMemberNames,
  };
}

export const channelDisplayPreferencesStore =
  createChannelDisplayPreferencesStore();
