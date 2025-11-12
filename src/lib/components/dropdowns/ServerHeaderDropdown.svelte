<svelte:options runes={true} />

<script lang="ts">
  import { createEventDispatcher } from "svelte";
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

  let { server }: Props = $props();

  const dispatch = createEventDispatcher<{
    action: ServerHeaderDropdownAction;
  }>();

  function handleAction(action: ServerHeaderDropdownAction) {
    dispatch("action", action);
  }
</script>

<DropdownMenu>
  <DropdownMenuTrigger>
    <Button
      variant="ghost"
      class="w-full h-full flex items-center justify-between font-bold text-lg truncate px-4 py-2 pr-8 hover:bg-base-400/50 cursor-pointer"
    >
      <span class="truncate">{server.name}</span>
      <ChevronDown size={10} class="mr-2" />
    </Button>
  </DropdownMenuTrigger>

  <DropdownMenuContent
    align="center"
    class="w-[218px] *:cursor-pointer"
  >
    <DropdownMenuItem onSelect={() => handleAction("invite_to_server")}>
      <UserPlus size={12} class="mr-2" /> Invite to Server
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={() => handleAction("server_settings")}>
      <Settings size={12} class="mr-2" /> Server Settings
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={() => handleAction("create_channel")}>
      <Plus size={12} class="mr-2" /> Create Channel
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={() => handleAction("create_category")}>
      <Plus size={12} class="mr-2" /> Create Category
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={() => handleAction("create_event")}>
      <Calendar size={12} class="mr-2" /> Create Event
    </DropdownMenuItem>

    <DropdownMenuSeparator />

    <DropdownMenuItem onSelect={() => handleAction("notification_settings")}>
      <Bell size={12} class="mr-2" /> Notification Settings
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={() => handleAction("privacy_settings")}>
      <Shield size={12} class="mr-2" /> Privacy Settings
    </DropdownMenuItem>

    <DropdownMenuSeparator />

    <DropdownMenuItem onSelect={() => handleAction("edit_profile")}>
      <UserRoundPen size={12} class="mr-2" /> Edit Per-server Profile
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={() => handleAction("hide_muted_channels")}>
      <Square size={12} class="mr-2" /> Hide Muted Channels
    </DropdownMenuItem>

    <DropdownMenuSeparator />

    <DropdownMenuItem
      class="text-destructive focus:text-destructive"
      onSelect={() => handleAction("leave_server")}
    >
      <CircleX size={12} class="mr-2" /> Leave Server
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={() => handleAction("view_reviews")}>
      <ExternalLink size={12} class="mr-2" /> View Reviews
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
