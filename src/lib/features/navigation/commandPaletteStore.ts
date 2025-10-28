import { goto } from "$app/navigation";
import { get, derived, writable, type Readable } from "svelte/store";
import {
  chatStore,
  chatMetadataByChatId,
} from "$lib/features/chat/stores/chatStore";
import { directMessageRoster } from "$lib/features/chat/stores/directMessageRoster";
import { serverStore } from "$lib/features/servers/stores/serverStore";
import { settings } from "$lib/features/settings/stores/settings";
import type { DirectMessageListEntry } from "$lib/features/chat/stores/directMessageRoster";
import type { Server } from "$lib/features/servers/models/Server";
import type { ChatMetadata } from "$lib/features/chat/stores/chatStore";

export type CommandPaletteSection =
  | "Recent Chats"
  | "Servers"
  | "Settings"
  | "Actions";

export interface CommandPaletteCommand {
  id: string;
  section: CommandPaletteSection;
  label: string;
  description?: string;
  keywords?: string[];
  perform: () => void | Promise<void>;
  sortKey?: string | null;
}

interface CommandPaletteStore {
  isOpen: Readable<boolean>;
  query: Readable<string>;
  highlightedIndex: Readable<number>;
  filteredCommands: Readable<CommandPaletteCommand[]>;
  open: () => void;
  close: () => void;
  setQuery: (value: string) => void;
  moveSelection: (delta: number) => void;
  setHighlightedIndex: (index: number) => void;
  executeAt: (index: number) => CommandPaletteCommand | null;
  executeHighlighted: () => CommandPaletteCommand | null;
  reset: () => void;
}

const MAX_RECENT_CHATS = 8;
const SETTINGS_SECTIONS: Array<{ path: string; label: string; description?: string }> = [
  { path: "/settings", label: "Settings Home" },
  { path: "/settings/account", label: "Account" },
  { path: "/settings/advanced", label: "Advanced" },
  { path: "/settings/chat", label: "Chat" },
  { path: "/settings/messaging", label: "Messaging" },
  { path: "/settings/notifications", label: "Notifications" },
  { path: "/settings/privacy", label: "Privacy" },
  { path: "/settings/data_privacy", label: "Data Privacy" },
  { path: "/settings/data_storage", label: "Data Storage" },
  { path: "/settings/friend_management", label: "Friend Management" },
  { path: "/settings/appearance", label: "Appearance" },
  { path: "/settings/accessibility", label: "Accessibility" },
  { path: "/settings/voice_video", label: "Voice & Video" },
  { path: "/settings/devices", label: "Devices" },
  { path: "/settings/keybinds", label: "Keybinds" },
  { path: "/settings/network", label: "Network" },
  { path: "/settings/language", label: "Language" },
  { path: "/settings/connected_accounts", label: "Connected Accounts" },
  { path: "/settings/content_social", label: "Content & Social" },
  { path: "/settings/change_log", label: "Change Log" },
];

const ACTION_COMMANDS: CommandPaletteCommand[] = [
  {
    id: "action:friends",
    section: "Actions",
    label: "Open Friends",
    description: "View your friends list",
    keywords: ["home", "direct messages", "dm"],
    perform: () => {
      serverStore.setActiveServer(null);
      void goto("/friends?tab=All");
    },
  },
  {
    id: "action:settings",
    section: "Actions",
    label: "Open Settings",
    description: "Navigate to the main settings page",
    keywords: ["preferences", "configuration"],
    perform: () => {
      void goto("/settings");
    },
  },
  {
    id: "action:mesh",
    section: "Actions",
    label: "Open Mesh Map",
    description: "Inspect mesh connectivity",
    keywords: ["network", "connectivity"],
    perform: () => {
      void goto("/mesh");
    },
  },
];

function toTimestamp(value: string | null | undefined): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function buildRecentChatCommands(
  entries: DirectMessageListEntry[],
): CommandPaletteCommand[] {
  return entries.slice(0, MAX_RECENT_CHATS).map((entry) => ({
    id: `chat:${entry.id}`,
    section: "Recent Chats",
    label: entry.name,
    description:
      entry.lastMessageText ??
      (entry.type === "group"
        ? `${entry.memberCount ?? 0} members`
        : "Direct message"),
    keywords: [entry.name, ...(entry.memberIds ?? [])],
    sortKey: entry.lastActivityAt,
    perform: () => {
      serverStore.setActiveServer(null);
      void goto("/");
      void chatStore.setActiveChat(entry.id, entry.type);
    },
  }));
}

function buildServerCommands(
  serverState: { servers: Server[] },
  metadata: Map<string, ChatMetadata>,
): CommandPaletteCommand[] {
  const commands: CommandPaletteCommand[] = [];
  for (const server of serverState.servers ?? []) {
    const channels = server.channels ?? [];
    for (const channel of channels) {
      if (channel.channel_type !== "text") continue;
      const meta = metadata.get(channel.id);
      const description = meta?.lastMessage?.content?.trim();
      commands.push({
        id: `server:${server.id}:${channel.id}`,
        section: "Servers",
        label: `${server.name} #${channel.name}`,
        description: description && description.length > 0 ? description : "Open channel",
        keywords: [server.name, channel.name],
        sortKey: meta?.lastActivityAt ?? null,
        perform: () => {
          serverStore.setActiveServer(server.id);
          void goto(`/channels/${server.id}`);
          void chatStore.setActiveChat(server.id, "server", channel.id);
        },
      });
    }
  }
  commands.sort(
    (a, b) => toTimestamp(b.sortKey ?? null) - toTimestamp(a.sortKey ?? null),
  );
  return commands;
}

function buildSettingsCommands(): CommandPaletteCommand[] {
  return SETTINGS_SECTIONS.map((section) => ({
    id: `settings:${section.path}`,
    section: "Settings",
    label: section.label,
    description: section.description,
    keywords: [section.label, section.path.replace("/settings", "")],
    perform: () => {
      void goto(section.path);
    },
  }));
}

function normalizeScore(query: string, command: CommandPaletteCommand): number {
  if (!query.length) {
    return 0;
  }
  const haystack = [
    command.label,
    command.description ?? "",
    ...(command.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();
  if (haystack.startsWith(query)) {
    return 2;
  }
  if (haystack.includes(query)) {
    return 1;
  }
  return Number.NEGATIVE_INFINITY;
}

function createCommandPaletteStore(): CommandPaletteStore {
  const isOpenStore = writable(false);
  const queryStore = writable("");
  const highlightedIndexStore = writable(0);

  const recentCommands = derived(directMessageRoster, ($entries) =>
    buildRecentChatCommands($entries),
  );

  const serverCommands = derived(
    [serverStore, chatMetadataByChatId],
    ([$serverState, $metadata]) => buildServerCommands($serverState, $metadata),
  );

  const allCommands = derived(
    [recentCommands, serverCommands],
    ([$recent, $servers]) => [
      ...$recent,
      ...$servers,
      ...buildSettingsCommands(),
      ...ACTION_COMMANDS,
    ],
  );

  const filteredCommands = derived(
    [queryStore, allCommands],
    ([$query, $commands]) => {
      const trimmed = $query.trim().toLowerCase();
      if (!trimmed.length) {
        highlightedIndexStore.set(
          Math.min(
            get(highlightedIndexStore),
            Math.max($commands.length - 1, 0),
          ),
        );
        return $commands;
      }
      const scored = $commands
        .map((command, index) => ({
          command,
          index,
          score: normalizeScore(trimmed, command),
        }))
        .filter((entry) => entry.score > Number.NEGATIVE_INFINITY)
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          const aTime = toTimestamp(a.command.sortKey ?? null);
          const bTime = toTimestamp(b.command.sortKey ?? null);
          return bTime - aTime;
        })
        .map((entry) => entry.command);
      highlightedIndexStore.set(
        Math.min(
          get(highlightedIndexStore),
          Math.max(scored.length - 1, 0),
        ),
      );
      return scored;
    },
  );

  const open = () => {
    if (!get(settings).enableCommandPalette) {
      return;
    }
    isOpenStore.set(true);
    highlightedIndexStore.set(0);
  };

  const close = () => {
    if (!get(isOpenStore)) {
      return;
    }
    isOpenStore.set(false);
    queryStore.set("");
    highlightedIndexStore.set(0);
  };

  const setQuery = (value: string) => {
    queryStore.set(value);
    highlightedIndexStore.set(0);
  };

  const moveSelection = (delta: number) => {
    const commands = get(filteredCommands);
    if (commands.length === 0) {
      highlightedIndexStore.set(0);
      return;
    }
    const nextIndex = (get(highlightedIndexStore) + delta + commands.length) %
      commands.length;
    highlightedIndexStore.set(nextIndex);
  };

  const setHighlightedIndex = (index: number) => {
    const commands = get(filteredCommands);
    if (index < 0 || index >= commands.length) {
      return;
    }
    highlightedIndexStore.set(index);
  };

  const executeCommand = (
    command: CommandPaletteCommand | undefined,
  ): CommandPaletteCommand | null => {
    if (!command) {
      return null;
    }
    void command.perform();
    close();
    return command;
  };

  const executeAt = (index: number) => {
    const commands = get(filteredCommands);
    return executeCommand(commands[index]);
  };

  const executeHighlighted = () => {
    const commands = get(filteredCommands);
    const command = commands[get(highlightedIndexStore)];
    return executeCommand(command);
  };

  const reset = () => {
    isOpenStore.set(false);
    queryStore.set("");
    highlightedIndexStore.set(0);
  };

  return {
    isOpen: { subscribe: isOpenStore.subscribe },
    query: { subscribe: queryStore.subscribe },
    highlightedIndex: { subscribe: highlightedIndexStore.subscribe },
    filteredCommands,
    open,
    close,
    setQuery,
    moveSelection,
    setHighlightedIndex,
    executeAt,
    executeHighlighted,
    reset,
  };
}

export const commandPaletteStore = createCommandPaletteStore();
