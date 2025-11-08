import { get, type Readable } from "svelte/store";
import { setContext } from "svelte";
import { friendStore } from "$lib/features/friends/stores/friendStore";
import { directMessageRoster } from "$lib/features/chat/stores/directMessageRoster";
import {
  CREATE_GROUP_CONTEXT_KEY,
  FRIENDS_LAYOUT_DATA_CONTEXT_KEY,
} from "$lib/contextKeys";
import type { FriendsLayoutContext } from "$lib/contextTypes";
import type { Chat } from "$lib/features/chat/models/Chat";
import type {
  GroupChatSummary,
  messagesByChatId,
} from "$lib/features/chat/stores/chatStore";
import type { Friend } from "$lib/features/friends/models/Friend";
import type { GroupModalUser } from "$lib/features/chat/utils/contextMenu";
import type { ModalManager } from "./modalManager";
import type { PageState } from "./types";

export type PageStateDependencies = {
  modalManager: ModalManager;
  allUsers: Readable<GroupModalUser[]>;
  groupChats: Readable<GroupChatSummary[]>;
  currentChat: Readable<Chat | null>;
  messages: typeof messagesByChatId;
  activeTab: Readable<string>;
};

export function createPageState({
  modalManager,
  allUsers,
  groupChats,
  currentChat,
  messages,
  activeTab,
}: PageStateDependencies) {
  const pageState: PageState = {
    get friends() {
      return get(friendStore).friends;
    },
    get allUsers() {
      return get(allUsers);
    },
    get groupChats() {
      return get(groupChats);
    },
    get directMessages() {
      return get(directMessageRoster);
    },
    get currentChat() {
      return get(currentChat);
    },
    openModal: modalManager.openModal,
    closeModal: modalManager.closeModal,
    openUserCardModal: modalManager.openUserCardModal,
    openDetailedProfileModal: modalManager.openDetailedProfileModal,
    openProfileReviewsModal: modalManager.openProfileReviewsModal,
    openCreateGroupModal: modalManager.openCreateGroupModal,
    openReportUserModal: modalManager.openReportUserModal,
    openCollaborativeDocument: modalManager.openCollaborativeDocument,
    openCollaborativeWhiteboard: modalManager.openCollaborativeWhiteboard,
    messagesByChatId: messages,
  };

  setContext(CREATE_GROUP_CONTEXT_KEY, pageState);

  const friendsLayoutContext: FriendsLayoutContext = {
    get friends() {
      return get(friendStore).friends;
    },
    get activeTab() {
      return get(activeTab);
    },
    get loading() {
      return get(friendStore).loading;
    },
  };

  setContext(FRIENDS_LAYOUT_DATA_CONTEXT_KEY, friendsLayoutContext);

  return { pageState, friendsLayoutContext };
}
