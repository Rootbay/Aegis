import { get, writable, type Readable } from "svelte/store";
import { toasts } from "$lib/stores/ToastStore";
import { serverStore } from "./serverStore";
import type { Server } from "../models/Server";
import {
  acceptServerInvite as acceptServerInviteService,
  declineServerInvite as declineServerInviteService,
  joinPublicServer,
  listPendingServerInvites,
  listRecentServers,
  searchForServers,
  type ServerInviteSummary,
  type ServerSearchResult,
} from "../services/serverDiscoveryService";

interface ServerInvitesState {
  pendingInvites: ServerInviteSummary[];
  recentServers: ServerSearchResult[];
  searchResults: ServerSearchResult[];
  loading: boolean;
  searchLoading: boolean;
  respondingInviteIds: string[];
  joiningServerIds: string[];
  lastQuery: string;
  error: string | null;
}

interface ServerInvitesStore extends Readable<ServerInvitesState> {
  initialize: (options?: { force?: boolean }) => Promise<void>;
  search: (query: string) => Promise<ServerSearchResult[]>;
  acceptInvite: (inviteId: string) => Promise<Server | null>;
  declineInvite: (inviteId: string) => Promise<boolean>;
  joinServer: (serverId: string) => Promise<Server | null>;
}

const initialState: ServerInvitesState = {
  pendingInvites: [],
  recentServers: [],
  searchResults: [],
  loading: false,
  searchLoading: false,
  respondingInviteIds: [],
  joiningServerIds: [],
  lastQuery: "",
  error: null,
};

function uniquePush(list: string[], value: string): string[] {
  return list.includes(value) ? list : [...list, value];
}

function removeValue(list: string[], value: string): string[] {
  return list.filter((item) => item !== value);
}

function markServerAsJoined(
  results: ServerSearchResult[],
  serverId: string,
): ServerSearchResult[] {
  return results.map((entry) =>
    entry.server.id === serverId
      ? { ...entry, membership: "joined" }
      : entry,
  );
}

export function createServerInvitesStore(): ServerInvitesStore {
  const { subscribe, set, update } = writable<ServerInvitesState>(initialState);
  let initialized = false;
  let searchToken = 0;

  const initialize: ServerInvitesStore["initialize"] = async (options = {}) => {
    if (initialized && !options.force) {
      return;
    }

    update((state) => ({ ...state, loading: true, error: null }));

    try {
      const [pendingInvites, recentServers] = await Promise.all([
        listPendingServerInvites(),
        listRecentServers(),
      ]);

      initialized = true;
      set({
        ...initialState,
        pendingInvites,
        recentServers,
        loading: false,
      });
    } catch (error) {
      console.error("Failed to load server discovery data", error);
      update((state) => ({
        ...state,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load server invites.",
      }));
    }
  };

  const search: ServerInvitesStore["search"] = async (query) => {
    const trimmed = query.trim();
    searchToken += 1;
    const currentToken = searchToken;

    if (trimmed.length < 2) {
      update((state) => ({
        ...state,
        searchResults: [],
        searchLoading: false,
        lastQuery: trimmed,
      }));
      return [];
    }

    update((state) => ({
      ...state,
      searchLoading: true,
      lastQuery: trimmed,
    }));

    try {
      const results = await searchForServers(trimmed);
      if (currentToken !== searchToken) {
        return results;
      }

      update((state) => ({
        ...state,
        searchResults: results,
        searchLoading: false,
      }));
      return results;
    } catch (error) {
      console.error("Server search failed", error);
      if (currentToken !== searchToken) {
        return [];
      }

      update((state) => ({
        ...state,
        searchLoading: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to search servers right now.",
      }));
      return [];
    }
  };

  const acceptInvite: ServerInvitesStore["acceptInvite"] = async (inviteId) => {
    const { pendingInvites } = get({ subscribe });
    const invite = pendingInvites.find((item) => item.id === inviteId);
    if (!invite) {
      console.warn(`Attempted to accept unknown server invite ${inviteId}`);
      return null;
    }

    update((state) => ({
      ...state,
      respondingInviteIds: uniquePush(state.respondingInviteIds, inviteId),
    }));

    try {
      const server = await acceptServerInviteService(invite);
      if (!server) {
        throw new Error("Failed to resolve server from invite");
      }

      const alreadyPresent = get(serverStore).servers.some(
        (existing) => existing.id === server.id,
      );
      if (!alreadyPresent) {
        serverStore.addServer(server);
      }

      update((state) => ({
        ...state,
        pendingInvites: state.pendingInvites.filter((item) => item.id !== inviteId),
        respondingInviteIds: removeValue(state.respondingInviteIds, inviteId),
        recentServers: markServerAsJoined(state.recentServers, server.id),
        searchResults: markServerAsJoined(state.searchResults, server.id),
      }));

      toasts.addToast(`Joined ${server.name}.`, "success");
      return server;
    } catch (error) {
      console.error("Failed to accept server invite", error);
      update((state) => ({
        ...state,
        respondingInviteIds: removeValue(state.respondingInviteIds, inviteId),
      }));
      toasts.addToast("Unable to accept the server invite.", "error");
      return null;
    }
  };

  const declineInvite: ServerInvitesStore["declineInvite"] = async (inviteId) => {
    const { pendingInvites } = get({ subscribe });
    const invite = pendingInvites.find((item) => item.id === inviteId);
    if (!invite) {
      return true;
    }

    update((state) => ({
      ...state,
      respondingInviteIds: uniquePush(state.respondingInviteIds, inviteId),
    }));

    try {
      const success = await declineServerInviteService(inviteId);
      if (!success) {
        throw new Error("Backend declined the decline action");
      }

      update((state) => ({
        ...state,
        pendingInvites: state.pendingInvites.filter((item) => item.id !== inviteId),
        respondingInviteIds: removeValue(state.respondingInviteIds, inviteId),
        searchResults: state.searchResults.map((entry) =>
          entry.server.id === invite.server.id
            ? { ...entry, membership: "none" }
            : entry,
        ),
      }));

      toasts.addToast("Server invite dismissed.", "info");
      return true;
    } catch (error) {
      console.error("Failed to decline server invite", error);
      update((state) => ({
        ...state,
        respondingInviteIds: removeValue(state.respondingInviteIds, inviteId),
      }));
      toasts.addToast("Unable to decline the server invite.", "error");
      return false;
    }
  };

  const joinServer: ServerInvitesStore["joinServer"] = async (serverId) => {
    const trimmed = serverId.trim();
    if (!trimmed) {
      toasts.addToast("Select a server to join.", "error");
      return null;
    }

    update((state) => ({
      ...state,
      joiningServerIds: uniquePush(state.joiningServerIds, trimmed),
    }));

    try {
      const server = await joinPublicServer(trimmed);
      if (!server) {
        throw new Error("Server join returned no data");
      }

      const alreadyPresent = get(serverStore).servers.some(
        (existing) => existing.id === server.id,
      );
      if (!alreadyPresent) {
        serverStore.addServer(server);
      }

      update((state) => ({
        ...state,
        joiningServerIds: removeValue(state.joiningServerIds, trimmed),
        recentServers: markServerAsJoined(state.recentServers, server.id),
        searchResults: markServerAsJoined(state.searchResults, server.id),
      }));

      toasts.addToast(`Joined ${server.name}.`, "success");
      return server;
    } catch (error) {
      console.error("Failed to join server", error);
      update((state) => ({
        ...state,
        joiningServerIds: removeValue(state.joiningServerIds, trimmed),
      }));
      toasts.addToast("Unable to join that server right now.", "error");
      return null;
    }
  };

  return {
    subscribe,
    initialize,
    search,
    acceptInvite,
    declineInvite,
    joinServer,
  };
}

export const serverInvitesStore = createServerInvitesStore();
