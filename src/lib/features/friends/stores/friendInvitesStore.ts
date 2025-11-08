import { get, writable, type Readable } from "svelte/store";
import { toasts } from "$lib/stores/ToastStore";
import { userStore } from "$lib/stores/userStore";
import { friendStore } from "./friendStore";
import type { Friend } from "../models/Friend";
import {
  acceptFriendInvite as acceptInviteService,
  declineFriendInvite as declineInviteService,
  listPendingFriendInvites,
  listRecentFriendPeers,
  searchForUsers,
  sendFriendRequest,
  type FriendInvite,
  type FriendPeer,
  type FriendSearchResult,
} from "../services/friendDiscoveryService";

interface FriendInvitesState {
  pendingInvites: FriendInvite[];
  recentPeers: FriendPeer[];
  searchResults: FriendSearchResult[];
  loading: boolean;
  searchLoading: boolean;
  respondingInviteIds: string[];
  sendingRequestIds: string[];
  lastQuery: string;
  error: string | null;
}

interface FriendInvitesStore extends Readable<FriendInvitesState> {
  initialize: (options?: { force?: boolean }) => Promise<void>;
  search: (query: string) => Promise<FriendSearchResult[]>;
  acceptInvite: (inviteId: string) => Promise<Friend | null>;
  declineInvite: (inviteId: string) => Promise<boolean>;
  sendRequest: (userId: string) => Promise<boolean>;
}

const initialState: FriendInvitesState = {
  pendingInvites: [],
  recentPeers: [],
  searchResults: [],
  loading: false,
  searchLoading: false,
  respondingInviteIds: [],
  sendingRequestIds: [],
  lastQuery: "",
  error: null,
};

function uniquePush(list: string[], value: string): string[] {
  return list.includes(value) ? list : [...list, value];
}

function removeValue(list: string[], value: string): string[] {
  return list.filter((item) => item !== value);
}

export function createFriendInvitesStore(): FriendInvitesStore {
  const { subscribe, set, update } = writable<FriendInvitesState>(initialState);
  let initialized = false;
  let searchToken = 0;

  const initialize: FriendInvitesStore["initialize"] = async (options = {}) => {
    if (initialized && !options.force) {
      return;
    }

    update((state) => ({ ...state, loading: true, error: null }));

    try {
      const [pendingInvites, recentPeers] = await Promise.all([
        listPendingFriendInvites(),
        listRecentFriendPeers(),
      ]);

      initialized = true;
      set({
        ...initialState,
        pendingInvites,
        recentPeers,
        loading: false,
      });
    } catch (error) {
      console.error("Failed to load friend discovery data", error);
      update((state) => ({
        ...state,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load friend discovery data.",
      }));
    }
  };

  const search: FriendInvitesStore["search"] = async (query) => {
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
      const results = await searchForUsers(trimmed);
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
      console.error("Friend search failed", error);
      if (currentToken !== searchToken) {
        return [];
      }

      update((state) => ({
        ...state,
        searchLoading: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to search for friends right now.",
      }));
      return [];
    }
  };

  const acceptInvite: FriendInvitesStore["acceptInvite"] = async (inviteId) => {
    const { pendingInvites } = get({ subscribe });
    const invite = pendingInvites.find((item) => item.id === inviteId);
    if (!invite) {
      console.warn(`Attempted to accept unknown invite ${inviteId}`);
      return null;
    }

    update((state) => ({
      ...state,
      respondingInviteIds: uniquePush(state.respondingInviteIds, inviteId),
    }));

    try {
      const friend = await acceptInviteService(invite);
      update((state) => ({
        ...state,
        pendingInvites: state.pendingInvites.filter((item) => item.id !== inviteId),
        respondingInviteIds: removeValue(state.respondingInviteIds, inviteId),
      }));

      if (friend) {
        friendStore.addFriend(friend);
        toasts.addToast(`You're now connected with ${friend.name}.`, "success");
      }

      return friend ?? null;
    } catch (error) {
      console.error("Failed to accept friend invite", error);
      update((state) => ({
        ...state,
        respondingInviteIds: removeValue(state.respondingInviteIds, inviteId),
      }));
      toasts.addToast("Unable to accept the invite. Please try again.", "error");
      return null;
    }
  };

  const declineInvite: FriendInvitesStore["declineInvite"] = async (inviteId) => {
    const { pendingInvites } = get({ subscribe });
    const inviteExists = pendingInvites.some((invite) => invite.id === inviteId);
    if (!inviteExists) {
      return true;
    }

    update((state) => ({
      ...state,
      respondingInviteIds: uniquePush(state.respondingInviteIds, inviteId),
    }));

    try {
      const success = await declineInviteService(inviteId);
      if (!success) {
        throw new Error("Backend rejected the decline operation");
      }

      update((state) => ({
        ...state,
        pendingInvites: state.pendingInvites.filter((item) => item.id !== inviteId),
        respondingInviteIds: removeValue(state.respondingInviteIds, inviteId),
      }));

      toasts.addToast("Invite dismissed.", "info");
      return true;
    } catch (error) {
      console.error("Failed to decline friend invite", error);
      update((state) => ({
        ...state,
        respondingInviteIds: removeValue(state.respondingInviteIds, inviteId),
      }));
      toasts.addToast("Unable to decline the invite. Please try again.", "error");
      return false;
    }
  };

  const sendRequest: FriendInvitesStore["sendRequest"] = async (userId) => {
    const trimmed = userId.trim();
    if (!trimmed) {
      toasts.addToast("Please choose a valid user to invite.", "error");
      return false;
    }

    update((state) => ({
      ...state,
      sendingRequestIds: uniquePush(state.sendingRequestIds, trimmed),
    }));

    try {
      const currentUserId = get(userStore).me?.id;
      const success = await sendFriendRequest(trimmed, currentUserId);
      if (success) {
        toasts.addToast("Friend request sent.", "success");
      } else {
        toasts.addToast("We already have a pending connection with this user.", "info");
      }

      update((state) => ({
        ...state,
        sendingRequestIds: removeValue(state.sendingRequestIds, trimmed),
      }));

      return success;
    } catch (error) {
      console.error("Failed to send friend request", error);
      update((state) => ({
        ...state,
        sendingRequestIds: removeValue(state.sendingRequestIds, trimmed),
      }));
      toasts.addToast("Unable to send the friend request right now.", "error");
      return false;
    }
  };

  return {
    subscribe,
    initialize,
    search,
    acceptInvite,
    declineInvite,
    sendRequest,
  };
}

export const friendInvitesStore = createFriendInvitesStore();
