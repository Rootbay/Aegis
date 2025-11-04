import { invoke } from "@tauri-apps/api/core";
import type { Channel } from "$lib/features/channels/models/Channel";
import type { User } from "$lib/features/auth/models/User";
import type { Server } from "$lib/features/servers/models/Server";

export type ServerMember = User & Record<string, unknown>;

export interface ServerLayoutData {
  server: (Server & {
    channels: Channel[];
    members: ServerMember[];
  }) | null;
  channels: Channel[];
  members: ServerMember[];
}

async function invokeWithServer<T>(
  command: string,
  serverId: string,
): Promise<T> {
  const args = { serverId, server_id: serverId };
  return invoke<T>(command, args);
}

export async function fetchServerLayoutData(
  serverId: string,
): Promise<ServerLayoutData> {
  const [server, channels, members] = await Promise.all([
    invokeWithServer<Server | null>("get_server_details", serverId),
    invokeWithServer<Channel[]>("get_channels_for_server", serverId),
    invokeWithServer<ServerMember[]>("get_members_for_server", serverId),
  ]);

  return {
    server: server
      ? {
          ...server,
          channels,
          members,
        }
      : null,
    channels,
    members,
  };
}
