import type { User } from "$lib/features/auth/models/User";
import type { Friend } from "$lib/features/friends/models/Friend";
import type { Chat } from "$lib/features/chat/models/Chat";
import type {
  GroupModalOptions,
  ReportUserModalPayload,
} from "$lib/features/chat/utils/contextMenu";

export interface CreateGroupContext {
  currentChat: Chat | null;
  openUserCardModal: (
    user: User,
    x: number,
    y: number,
    isServerMemberContext: boolean,
  ) => void;
  openDetailedProfileModal: (user: User) => void;
  openCreateGroupModal: (options?: GroupModalOptions) => void;
  openReportUserModal: (payload: ReportUserModalPayload) => void;
}
export interface FriendsLayoutContext {
  friends: Friend[];
  activeTab: string;
  loading: boolean;
}
