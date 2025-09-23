<svelte:options runes={true} />

<script lang="ts">
  import type { Server } from "$lib/features/servers/models/Server";
  import { userStore } from "$lib/stores/userStore";
  import {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
  } from "$lib/components/ui/context-menu";
  import type { Snippet } from "svelte";

  type ServerContextMenuAction = {
    action: string;
    server: Server;
  };

  type ServerContextMenuHandler = (_payload: ServerContextMenuAction) => void; // eslint-disable-line no-unused-vars

  type MenuEntry =
    | { type: "separator"; id: string }
    | {
        type: "item";
        id: string;
        label: string;
        action: string;
        destructive?: boolean;
      };

  interface ServerContextMenuProps {
    server: Server;
    muted?: boolean;
    disabled?: boolean;
    onaction?: ServerContextMenuHandler;
    children?: Snippet;
  }

  let {
    server,
    muted = false,
    disabled = false,
    onaction,
    children,
  }: ServerContextMenuProps = $props();

  const menuEntries: MenuEntry[] = $derived(buildMenuEntries(server, muted));

  function buildMenuEntries(
    currentServer: Server,
    isMuted: boolean,
  ): MenuEntry[] {
    if (!currentServer) return [];

    const isOwner = currentServer.owner_id === $userStore.me?.id;

    const entries: MenuEntry[] = [
      {
        type: "item",
        id: "mark-read",
        label: "Mark As Read",
        action: "mark_as_read",
      },
      {
        type: "item",
        id: "toggle-mute",
        label: isMuted ? "Unmute Server" : "Mute Server",
        action: "mute_unmute_server",
      },
      {
        type: "item",
        id: "notifications",
        label: "Notification Settings",
        action: "notification_settings",
      },
      { type: "separator", id: "divider-utilities" },
      {
        type: "item",
        id: "copy-id",
        label: "Copy Server ID",
        action: "copy_server_id",
      },
      {
        type: "item",
        id: "view-icon",
        label: "View Icon",
        action: "view_icon",
      },
      { type: "item", id: "view-raw", label: "View Raw", action: "view_raw" },
    ];

    if (isOwner) {
      entries.push({ type: "separator", id: "divider-owner" });
      entries.push({
        type: "item",
        id: "server-settings",
        label: "Server Settings",
        action: "server-settings",
      });
      entries.push({
        type: "item",
        id: "create-channel",
        label: "Create Channel",
        action: "create_channel",
      });
      entries.push({
        type: "item",
        id: "create-category",
        label: "Create Category",
        action: "create_category",
      });
      entries.push({
        type: "item",
        id: "create-event",
        label: "Create Event",
        action: "create_event",
      });
    } else {
      entries.push({ type: "separator", id: "divider-member" });
      entries.push({
        type: "item",
        id: "invite-people",
        label: "Invite People",
        action: "invite_people",
      });
      entries.push({ type: "separator", id: "divider-danger" });
      entries.push({
        type: "item",
        id: "leave-server",
        label: "Leave Server",
        action: "leave_server",
        destructive: true,
      });
    }

    return normalizeEntries(entries);
  }

  function normalizeEntries(entries: MenuEntry[]): MenuEntry[] {
    const normalized: MenuEntry[] = [];
    for (const entry of entries) {
      const last = normalized.at(-1);
      if (entry.type === "separator") {
        if (!last || last.type === "separator") continue;
      }
      normalized.push(entry);
    }
    if (normalized.at(-1)?.type === "separator") normalized.pop();
    return normalized;
  }

  function handleSelect(action: string) {
    if (!server || disabled) return;
    onaction?.({ action, server });
  }
</script>

<ContextMenu>
  <ContextMenuTrigger>
    {@render children?.()}
  </ContextMenuTrigger>

  <ContextMenuContent class="server-context-menu__content">
    {#each menuEntries as entry (entry.id)}
      {#if entry.type === "separator"}
        <ContextMenuSeparator />
      {:else}
        <ContextMenuItem
          variant={entry.destructive ? "destructive" : "default"}
          onselect={() => handleSelect(entry.action)}
        >
          {entry.label}
        </ContextMenuItem>
      {/if}
    {/each}
  </ContextMenuContent>
</ContextMenu>
