import type { Readable } from "svelte/store";
import type { AuthState } from "$lib/features/auth/stores/authStore";
import type { Chat } from "$lib/features/chat/models/Chat";
import type {
  GroupChatSummary,
  messagesByChatId,
} from "$lib/features/chat/stores/chatStore";
import type { DirectMessageListEntry } from "$lib/features/chat/stores/directMessageRoster";
import type { Friend } from "$lib/features/friends/models/Friend";
import type { GroupModalUser } from "$lib/features/chat/utils/contextMenu";
import type {
  GroupModalOptions,
  ReportMessageModalPayload,
  ReportUserModalPayload,
} from "$lib/features/chat/utils/contextMenu";
import type { CollaborationSessionKind } from "$lib/features/collaboration/collabDocumentStore";
import type { ConnectivityState } from "$lib/stores/connectivityStore";
import type { User } from "$lib/features/auth/models/User";

export type AppModalType =
  | "createGroup"
  | "serverManagement"
  | "detailedProfile"
  | "profileReviews"
  | "userCard"
  | "reportUser"
  | "reportMessage"
  | "collaborationDocument"
  | "collaborationWhiteboard";

export type ProfileReviewsModalOptions = {
  subjectType: "user" | "server";
  subjectId: string;
  subjectName?: string;
  subjectAvatarUrl?: string | null;
};

export type ModalState = {
  activeModal: Readable<AppModalType | null>;
  modalProps: Readable<Record<string, unknown>>;
};

export type PageState = {
  readonly friends: Friend[];
  readonly allUsers: GroupModalUser[];
  readonly groupChats: GroupChatSummary[];
  readonly directMessages: DirectMessageListEntry[];
  readonly currentChat: Chat | null;
  readonly openModal: (
    modalType: AppModalType,
    props?: Record<string, unknown>,
  ) => void;
  readonly closeModal: () => void;
  readonly openUserCardModal: (
    user: User,
    x: number,
    y: number,
    isServerMemberContext: boolean,
    options?: {
      preferredSide?: "left" | "right";
      triggerLeft?: number;
    },
  ) => void;
  readonly openDetailedProfileModal: (user: User) => void;
  readonly openProfileReviewsModal: (
    options: ProfileReviewsModalOptions,
  ) => void;
  readonly openCreateGroupModal: (options?: GroupModalOptions) => void;
  readonly openReportUserModal: (payload: ReportUserModalPayload) => void;
  readonly openReportMessageModal: (payload: ReportMessageModalPayload) => void;
  readonly openCollaborativeDocument: (options?: {
    documentId?: string;
    initialContent?: string;
    kind?: CollaborationSessionKind;
  }) => void;
  readonly openCollaborativeWhiteboard: (options?: {
    documentId?: string;
  }) => void;
  readonly messagesByChatId: typeof messagesByChatId;
};

export type ConnectivityBindings = {
  state: Readable<ConnectivityState>;
  statusMessage: Readable<string>;
  fallbackMessage: Readable<string | null>;
  showBridgePrompt: Readable<boolean>;
};

export type AppHandlers = {
  handleKeydown: (event: KeyboardEvent) => void;
  handleFriendsTabSelect: (tab: string) => void;
  handleFriendsAddClick: () => void;
  handleSelectChannel: (serverId: string, channelId: string | null) => void;
  handleSelectDirectMessage: (params: {
    chatId: string | null;
    type?: "dm" | "group";
    skipNavigation?: boolean;
  }) => void;
  openModal: PageState["openModal"];
  closeModal: PageState["closeModal"];
  openDetailedProfileModal: PageState["openDetailedProfileModal"];
  openProfileReviewsModal: PageState["openProfileReviewsModal"];
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
};

export type AppController = {
  authState: Readable<AuthState>;
  currentUser: Readable<User | null>;
  currentChat: Readable<Chat | null>;
  allUsers: Readable<GroupModalUser[]>;
  friendsLoading: Readable<boolean>;
  groupChats: Readable<GroupChatSummary[]>;
  directMessages: Readable<DirectMessageListEntry[]>;
  isAnySettingsPage: Readable<boolean>;
  isFriendsOrRootPage: Readable<boolean>;
  activeTab: Readable<string>;
  modal: ModalState;
  shouldShowInitialSetup: Readable<boolean>;
  pageState: PageState;
  connectivity: ConnectivityBindings;
  handlers: AppHandlers;
};
