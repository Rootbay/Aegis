import { derived, type Readable } from "svelte/store";
import { friendStore } from "$lib/features/friends/stores/friendStore";
import {
  chatMetadataByChatId,
  groupChats,
} from "$lib/features/chat/stores/chatStore";
import { userStore } from "$lib/stores/userStore";
import {
  mergeDirectMessageRoster as mergeRosterEntries,
  type DirectMessageListEntry,
} from "$lib/features/chat/stores/directMessageRosterCore";

export { mergeDirectMessageRoster } from "$lib/features/chat/stores/directMessageRosterCore";
export type { DirectMessageListEntry } from "$lib/features/chat/stores/directMessageRosterCore";

export const directMessageRoster: Readable<DirectMessageListEntry[]> = derived(
  [friendStore, groupChats, chatMetadataByChatId, userStore],
  ([$friendStore, $groupChats, $metadata, $userStore]) => {
    const friends = $friendStore.friends ?? [];
    const summaries = Array.from($groupChats.values());
    const currentUserId = $userStore.me?.id ?? null;
    return mergeRosterEntries(
      friends,
      summaries,
      $metadata,
      currentUserId,
    );
  },
);
