import type { User } from "$lib/features/auth/models/User";
import type { Friend } from "$lib/features/friends/models/Friend";
import type { Chat } from "$lib/features/chat/models/Chat";
import type {
  GroupModalOptions,
  ReportUserModalPayload,
} from "$lib/features/chat/utils/contextMenu";
import type { CollaborationSessionKind } from "$lib/features/collaboration/collabDocumentStore";

export interface CreateGroupContext {
  currentChat: Chat | null;
  openUserCardModal: (
    user: User,
    x: number,
    y: number,
    isServerMemberContext: boolean,
  ) => void;
  openDetailedProfileModal: (user: User) => void;
  openProfileReviewsModal: (options: {
    subjectType: "user" | "server";
    subjectId: string;
    subjectName?: string;
    subjectAvatarUrl?: string | null;
  }) => void;
  openCreateGroupModal: (options?: GroupModalOptions) => void;
  openReportUserModal: (payload: ReportUserModalPayload) => void;
  openCollaborativeDocumentModal: (options?: {
    documentId?: string;
    initialContent?: string;
    kind?: CollaborationSessionKind;
  }) => void;
  openCollaborativeWhiteboard: (options?: { documentId?: string }) => void;
}
export interface FriendsLayoutContext {
  friends: Friend[];
  activeTab: string;
  loading: boolean;
}
