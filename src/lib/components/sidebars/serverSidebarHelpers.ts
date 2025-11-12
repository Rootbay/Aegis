import type { Server } from "$lib/features/servers/models/Server";
import type { ServerInvite } from "$lib/features/servers/models/ServerInvite";

export type ServerInviteResponse = {
  id: string;
  server_id: string;
  code: string;
  created_by: string;
  created_at: string;
  expires_at?: string | null;
  max_uses?: number | null;
  uses: number;
};

export function mapInviteResponse(
  invite: ServerInviteResponse,
): ServerInvite {
  return {
    id: invite.id,
    serverId: invite.server_id,
    code: invite.code,
    createdBy: invite.created_by,
    createdAt: invite.created_at,
    expiresAt: invite.expires_at ?? undefined,
    maxUses: invite.max_uses ?? undefined,
    uses: invite.uses,
  };
}

export function buildChannelLink(serverId: string, channelId: string) {
  const path = `/channels/${serverId}/${channelId}`;
  try {
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}${path}`;
    }
  } catch (error) {
    void error;
  }
  return path;
}

export function buildInviteLinkFromCode(code: string) {
  const path = `/inv/${code}`;
  try {
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}${path}`;
    }
  } catch (error) {
    void error;
  }
  return path;
}

export function slugifyChannelName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

export function clampToViewport(
  x: number,
  y: number,
  approxWidth = 220,
  approxHeight = 260,
) {
  const maxX = Math.max(0, (window.innerWidth || 0) - approxWidth - 8);
  const maxY = Math.max(0, (window.innerHeight || 0) - approxHeight - 8);
  return { x: Math.min(x, maxX), y: Math.min(y, maxY) };
}

export function getCategoryKey(categoryId: string | null) {
  return categoryId ?? "";
}

export function getCategoryDisplayName(
  server: Server | undefined,
  categoryId: string,
) {
  const category = server?.categories?.find(
    (entry) => entry.id === categoryId,
  );
  return category?.name ?? "Category";
}
