import type { Message } from "$lib/features/chat/models/Message";
import type { User } from "$lib/features/auth/models/User";

export type FriendStatus = "Online" | "Offline" | "Blocked" | "Pending";

export type SpamDecision = "flagged" | "auto-muted" | "muted" | "allowed";

export interface Friend extends User {
  status: FriendStatus;
  timestamp: string;
  messages: Message[];
  lastMessage?: string;
  isFriend?: boolean;
  isPinned?: boolean;
  friendshipId?: string;
  relationshipStatus?: string;
  spamScore?: number;
  isSpamFlagged?: boolean;
  spamReasons?: string[];
  spamMuted?: boolean;
  spamDecision?: SpamDecision;
}
