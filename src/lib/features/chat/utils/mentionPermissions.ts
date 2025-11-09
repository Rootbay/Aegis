import type { User } from "$lib/features/auth/models/User";
import type { Chat } from "$lib/features/chat/models/Chat";
import type { MentionCandidate } from "$lib/features/chat/stores/mentionSuggestions";
import type { Server } from "$lib/features/servers/models/Server";
import {
  aggregateChannelPermissions,
  allowAllChannelPermissions,
  buildRolePermissionMap,
  collectMemberRoleIds,
} from "$lib/features/chat/utils/permissions";

type SpecialMentionKey = "everyone" | "here";

type CanMentionEveryoneParams = {
  chat: Chat | null | undefined;
  server?: Server | null;
  me?: User | null;
};

export function canMemberMentionEveryone({
  chat,
  server,
  me,
}: CanMentionEveryoneParams): boolean {
  if (!chat || chat.type !== "channel") {
    return false;
  }

  if (!server || !me) {
    return false;
  }

  if (me.id === server.owner_id) {
    return true;
  }

  const rolePermissionMap = buildRolePermissionMap(server.roles);
  const channel = server.channels?.find((entry) => entry.id === chat.id);
  const hasOverrides = Boolean(channel?.permission_overrides);

  if (rolePermissionMap.size === 0 && !hasOverrides) {
    return false;
  }

  const memberRoleIds = collectMemberRoleIds({ me, server, chat });
  if (memberRoleIds.length === 0 && !hasOverrides) {
    return false;
  }

  const noRoleData =
    rolePermissionMap.size === 0 || memberRoleIds.length === 0;

  const permissions = aggregateChannelPermissions({
    memberRoleIds,
    rolePermissionMap,
    basePermissions: noRoleData ? allowAllChannelPermissions() : undefined,
    overrides: channel?.permission_overrides,
    userId: me.id,
  });

  return permissions.mention_everyone === true;
}

export function buildSpecialMentionCandidates(
  canMentionEveryone: boolean,
): MentionCandidate[] {
  if (!canMentionEveryone) {
    return [];
  }

  return [
    {
      id: "@everyone",
      name: "@everyone",
      kind: "special",
      specialKey: "everyone",
      searchText: "everyone",
    },
    {
      id: "@here",
      name: "@here",
      kind: "special",
      specialKey: "here",
      searchText: "here",
    },
  ];
}

export function extractSpecialMentionKeys(
  content: string | null | undefined,
): Set<SpecialMentionKey> {
  const detected = new Set<SpecialMentionKey>();
  if (!content) {
    return detected;
  }

  const pattern = /@(?:everyone|here)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const index = match.index;
    if (index > 0) {
      const prev = content[index - 1];
      if (prev && /[@\w]/u.test(prev)) {
        continue;
      }
    }

    const token = match[0].toLowerCase();
    detected.add(token === "@here" ? "here" : "everyone");
  }

  return detected;
}
