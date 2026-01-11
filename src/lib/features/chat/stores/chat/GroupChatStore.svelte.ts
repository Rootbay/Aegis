import { SvelteMap } from "svelte/reactivity";
import type { BackendGroupChat } from "./types";
import { normalizeTimestamp } from "./mapping";

export interface GroupChatSummary {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  memberIds: string[];
}

export class GroupChatStore {
  #groupChats = new SvelteMap<string, GroupChatSummary>();

  get groupChats() { return this.#groupChats; }

  mapBackendGroupChat(chat: BackendGroupChat): GroupChatSummary {
    const memberIdsRaw = chat.member_ids ?? chat.memberIds ?? [];
    const memberIds = Array.from(
      new Set(
        memberIdsRaw.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        ),
      ),
    );
    return {
      id: chat.id,
      name: chat.name || `Group ${chat.id.slice(0, 6)}`,
      ownerId: chat.owner_id ?? chat.ownerId ?? "",
      createdAt: normalizeTimestamp(chat.created_at ?? chat.createdAt),
      memberIds,
    };
  }

  upsertGroupChat(chat: BackendGroupChat) {
    const summary = this.mapBackendGroupChat(chat);
    this.#groupChats.set(summary.id, summary);
    return summary;
  }

  removeGroupChat(groupId: string) {
    this.#groupChats.delete(groupId);
  }
}
