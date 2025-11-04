import { get, derived, writable } from "svelte/store";
import type { Readable } from "svelte/store";
import { fetchServerLayoutData } from "$lib/features/servers/services/serverDataService";
import type {
  ServerLayoutData,
  ServerMember,
} from "$lib/features/servers/services/serverDataService";
import type { Server } from "$lib/features/servers/models/Server";
import type { Channel } from "$lib/features/channels/models/Channel";
import type { ServerLayoutContext } from "$lib/contextTypes";

export interface ServerLayoutController {
  readonly serverId: Readable<string | null>;
  readonly server: Readable<
    (Server & { channels: Channel[]; members: ServerMember[] }) | null
  >;
  readonly channels: Readable<Channel[]>;
  readonly members: Readable<ServerMember[]>;
  readonly loading: Readable<boolean>;
  readonly hasServer: Readable<boolean>;
  readonly context: ServerLayoutContext;
  setActiveServerId(serverId: string | null): void;
  refresh(): Promise<void>;
  handleSelectChannel(serverId: string | null, channelId: string): void;
  reset(): void;
}

interface Dependencies {
  navigate: (value: string | URL) => void | Promise<void>;
  notifyError: (message: string) => void;
}

const DEFAULT_ERROR_MESSAGE = "Failed to load server data.";

export function createServerLayoutController({
  navigate,
  notifyError,
}: Dependencies): ServerLayoutController {
  const serverId = writable<string | null>(null);
  const server = writable<
    (Server & { channels: Channel[]; members: ServerMember[] }) | null
  >(null);
  const channels = writable<Channel[]>([]);
  const members = writable<ServerMember[]>([]);
  const loading = writable<boolean>(false);

  const hasServer = derived(server, ($server) => Boolean($server));

  const context: ServerLayoutContext = {
    server: () => get(server),
    channels: () => get(channels),
    members: () => get(members),
  };

  let requestToken = 0;

  function reset() {
    server.set(null);
    channels.set([]);
    members.set([]);
  }

  async function loadServerData(targetServerId: string) {
    const currentToken = ++requestToken;
    loading.set(true);

    try {
      const data: ServerLayoutData = await fetchServerLayoutData(targetServerId);
      if (currentToken !== requestToken) {
        return;
      }

      server.set(data.server);
      channels.set(data.channels);
      members.set(data.members);
    } catch (error) {
      if (currentToken !== requestToken) {
        return;
      }

      console.error("Failed to fetch server data:", error);
      reset();
      const message = error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE;
      notifyError(message);
    } finally {
      if (currentToken === requestToken) {
        loading.set(false);
      }
    }
  }

  function setActiveServerId(nextServerId: string | null) {
    const currentId = get(serverId);
    if (nextServerId === currentId) {
      return;
    }

    serverId.set(nextServerId);

    if (!nextServerId) {
      reset();
      return;
    }

    void loadServerData(nextServerId);
  }

  async function refresh() {
    const current = get(serverId);
    if (!current) {
      return;
    }
    await loadServerData(current);
  }

  function handleSelectChannel(serverIdArg: string | null, channelId: string) {
    const targetServerId = serverIdArg ?? get(serverId);
    if (!targetServerId) {
      return;
    }

    navigate(`/channels/${targetServerId}/${channelId}`);
  }

  return {
    serverId,
    server,
    channels,
    members,
    loading,
    hasServer,
    context,
    setActiveServerId,
    refresh,
    handleSelectChannel,
    reset,
  };
}
