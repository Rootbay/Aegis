<svelte:options runes={true} />

<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { ComponentType } from "svelte";

  import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
  } from "$lib/components/ui/dropdown-menu/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    UserPlus,
    Settings,
    Plus,
    Calendar,
    Bell,
    Shield,
    UserRoundPen,
    Square,
    CircleX,
    ExternalLink,
    ChevronDown,
  } from "@lucide/svelte";
  import type { Server } from "$lib/features/servers/models/Server";

  export type ServerHeaderDropdownAction =
    | "invite_to_server"
    | "server_settings"
    | "create_channel"
    | "create_category"
    | "create_event"
    | "notification_settings"
    | "privacy_settings"
    | "edit_profile"
    | "hide_muted_channels"
    | "leave_server"
    | "view_reviews";

  type Props = {
    server: Server;
  };

  type IconComponent = typeof UserPlus;

  type MenuActionItem = {
    type: "item";
    id: string;
    label: string;
    action: ServerHeaderDropdownAction;
    icon: IconComponent;
    className?: string;
  };

  type MenuSeparator = {
    type: "separator";
    id: string;
  };

  type MenuEntry = MenuActionItem | MenuSeparator;

  const MENU_ITEMS: MenuEntry[] = [
    {
      type: "item",
      id: "invite",
      label: "Invite to Server",
      action: "invite_to_server",
      icon: UserPlus,
    },
    {
      type: "item",
      id: "settings",
      label: "Server Settings",
      action: "server_settings",
      icon: Settings,
    },
    {
      type: "item",
      id: "create-channel",
      label: "Create Channel",
      action: "create_channel",
      icon: Plus,
    },
    {
      type: "item",
      id: "create-category",
      label: "Create Category",
      action: "create_category",
      icon: Plus,
    },
    {
      type: "item",
      id: "create-event",
      label: "Create Event",
      action: "create_event",
      icon: Calendar,
    },
    { type: "separator", id: "sep-main" },
    {
      type: "item",
      id: "notifications",
      label: "Notification Settings",
      action: "notification_settings",
      icon: Bell,
    },
    {
      type: "item",
      id: "privacy",
      label: "Privacy Settings",
      action: "privacy_settings",
      icon: Shield,
    },
    { type: "separator", id: "sep-options" },
    {
      type: "item",
      id: "edit-profile",
      label: "Edit Per-server Profile",
      action: "edit_profile",
      icon: UserRoundPen,
    },
    {
      type: "item",
      id: "hide-muted",
      label: "Hide Muted Channels",
      action: "hide_muted_channels",
      icon: Square,
    },
    { type: "separator", id: "sep-more" },
    {
      type: "item",
      id: "leave",
      label: "Leave Server",
      action: "leave_server",
      icon: CircleX,
      className: "text-destructive focus:text-destructive",
    },
    {
      type: "item",
      id: "reviews",
      label: "View Reviews",
      action: "view_reviews",
      icon: ExternalLink,
    },
  ];

  let { server }: Props = $props();

  const dispatch = createEventDispatcher<{
    action: ServerHeaderDropdownAction;
  }>();

  function handleAction(action: ServerHeaderDropdownAction) {
    dispatch("action", action);
  }
</script>

<DropdownMenu>
  <DropdownMenuTrigger class="w-full h-full">
    <Button
      variant="ghost"
      class="w-full h-full flex items-center justify-between font-bold text-lg hover:bg-base-400/50 rounded-none cursor-pointer"
    >
      <span class="truncate">{server.name}</span>
      <ChevronDown size={10} class="mr-2" />
    </Button>
  </DropdownMenuTrigger>

  <DropdownMenuContent
    align="center"
    class="w-[218px] *:cursor-pointer"
  >
    {#each MENU_ITEMS as entry (entry.id)}
      {#if entry.type === "separator"}
        <DropdownMenuSeparator />
      {:else}
        {@const Icon = entry.icon}
        <DropdownMenuItem
          class={entry.className}
          onSelect={() => handleAction(entry.action)}
        >
          <Icon size={12} class="mr-2" /> {entry.label}
        </DropdownMenuItem>
      {/if}
    {/each}
  </DropdownMenuContent>
</DropdownMenu>
