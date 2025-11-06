import { get } from "svelte/store";
import { untrack } from "svelte";
import type {
  ActiveChannelIdReadable,
  ActiveChatIdReadable,
  ActiveChatTypeReadable,
  ChatStoreType,
  ServerStoreType,
} from "./types";

type ServerStoreState = Parameters<ServerStoreType["subscribe"]>[0] extends (
  value: infer T,
) => unknown
  ? T
  : never;

interface ServerSelectionOptions {
  serverStore: ServerStoreType;
  chatStore: ChatStoreType;
  activeChatId: ActiveChatIdReadable;
  activeChatType: ActiveChatTypeReadable;
  activeServerChannelId: ActiveChannelIdReadable;
}

export interface ServerSelectionController {
  initialize: () => void;
  teardown: () => void;
}

export function createServerSelectionController({
  serverStore,
  chatStore,
  activeChatId,
  activeChatType,
  activeServerChannelId,
}: ServerSelectionOptions): ServerSelectionController {
  let unsubscribe: (() => void) | null = null;

  const ensureActiveChannel = ($serverState: ServerStoreState) => {
    const serverId = $serverState.activeServerId;
    if (!serverId) {
      return;
    }

    const server = $serverState.servers.find((candidate) => candidate.id === serverId);
    if (!server) {
      return;
    }
    const channels = server?.channels ?? [];
    if (channels.length === 0) {
      return;
    }

    const generalChannel = channels.find((channel) => channel.name === "general");
    const targetChannelId = generalChannel
      ? generalChannel.id
      : channels[0]?.id ?? null;

    if (!targetChannelId) {
      return;
    }

    const chatType = get(activeChatType);
    const chatId = get(activeChatId);
    const selectedChannelId = get(activeServerChannelId);
    const hasValidChannel = Boolean(selectedChannelId) &&
      channels.some((channel) => channel.id === selectedChannelId);

    if (!hasValidChannel) {
      untrack(() => {
        chatStore.setActiveChat(server.id, "server", targetChannelId);
      });
      return;
    }

    const isServerChat = chatType === "server" && chatId === server.id;
    if (!isServerChat) {
      untrack(() => {
        chatStore.setActiveChat(server.id, "server");
      });
    }
  };

  const initialize = () => {
    if (unsubscribe) {
      return;
    }
    unsubscribe = serverStore.subscribe(ensureActiveChannel);
  };

  const teardown = () => {
    if (!unsubscribe) {
      return;
    }
    try {
      unsubscribe();
    } catch (error) {
      console.error("Failed to unsubscribe from server selection controller:", error);
    }
    unsubscribe = null;
  };

  return { initialize, teardown };
}
