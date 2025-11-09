<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { House, Plus, RadioTower, Settings } from "@lucide/svelte";
  import { goto } from "$app/navigation";
  import { SvelteURLSearchParams } from "svelte/reactivity";
  import { page } from "$app/stores";
  import { userStore } from "$lib/stores/userStore";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { friendStore } from "$lib/features/friends/stores/friendStore";
  import {
    chatStore,
    serverUnreadCountByServerId,
  } from "$lib/features/chat/stores/chatStore";
  import { toasts } from "$lib/stores/ToastStore";
  import ServerContextMenu from "$lib/components/context-menus/ServerContextMenu.svelte";
  import type { Server } from "$lib/features/servers/models/Server";
  import type { ServerInvite } from "$lib/features/servers/models/ServerInvite";
  import { lastVisitedServerId } from "$lib/stores/navigationStore";
  import { get } from "svelte/store";
  import { SvelteSet } from "svelte/reactivity";
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    Avatar,
    AvatarImage,
    AvatarFallback,
  } from "$lib/components/ui/avatar/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import {
    Sidebar,
    SidebarHeader,
    SidebarContent,
    SidebarFooter,
    SidebarMenu,
    SidebarMenuItem,
  } from "$lib/components/ui/sidebar";
  import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
  } from "$lib/components/ui/tooltip/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import UserCardModal from "$lib/components/modals/UserCardModal.svelte";
  import ServerEventModal from "$lib/components/modals/ServerEventModal.svelte";
  import { cn } from "$lib/utils";
  import type { User } from "$lib/features/auth/models/User";

  type OpenProfileHandler = (user: User) => void; // eslint-disable-line no-unused-vars
  let {
    onCreateJoinServerClick,
    openDetailedProfileModal,
  }: {
    onCreateJoinServerClick: () => void;
    openDetailedProfileModal: OpenProfileHandler;
  } = $props();
  const MUTED_SERVERS_STORAGE_KEY = "sidebar.mutedServers";
  let mutedServerIds = $state<SvelteSet<string>>(loadMutedServers());
  let eventModalServer = $state<Server | null>(null);

  const formatUnreadCount = (value: number) => {
    if (value <= 0) return "0";
    return value > 99 ? "99+" : `${value}`;
  };

  type NavigationFn = (..._args: [string | URL]) => Promise<void>; // eslint-disable-line no-unused-vars

  const gotoUnsafe: NavigationFn = goto as unknown as NavigationFn;

  function loadMutedServers(): SvelteSet<string> {
    if (typeof localStorage === "undefined") return new SvelteSet();
    try {
      const raw = localStorage.getItem(MUTED_SERVERS_STORAGE_KEY);
      if (!raw) return new SvelteSet();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new SvelteSet(
          parsed.filter((id): id is string => typeof id === "string"),
        );
      }
    } catch (error) {
      console.warn("Failed to load muted servers from storage", error);
    }
    return new SvelteSet();
  }

  function saveMutedServers(ids: SvelteSet<string>) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(
        MUTED_SERVERS_STORAGE_KEY,
        JSON.stringify(Array.from(ids)),
      );
    } catch (error) {
      console.warn("Failed to persist muted servers", error);
    }
  }

  function gotoResolved(path: string) {
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    return gotoUnsafe(path);
  }

  function gotoServerSettings(serverId: string, tab?: string) {
    const params = new SvelteURLSearchParams();
    if (tab) params.set("tab", tab);

    const query = params.toString();
    const href = query
      ? `/channels/${serverId}/settings?${query}`
      : `/channels/${serverId}/settings`;
    gotoResolved(href);
  }

  type ServerInviteResponse = {
    id: string;
    server_id: string;
    code: string;
    created_by: string;
    created_at: string;
    expires_at?: string | null;
    max_uses?: number | null;
    uses: number;
  };

  const mapInviteResponse = (invite: ServerInviteResponse): ServerInvite => ({
    id: invite.id,
    serverId: invite.server_id,
    code: invite.code,
    createdBy: invite.created_by,
    createdAt: invite.created_at,
    expiresAt: invite.expires_at ?? undefined,
    maxUses: invite.max_uses ?? undefined,
    uses: invite.uses,
  });

  function buildInviteLinkFromCode(code: string) {
    const path = `/inv/${code}`;
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}${path}`;
    }
    return path;
  }

  async function copyText(
    value: string,
    successMessage: string,
    errorMessage: string,
  ) {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(value);
        toasts.addToast(successMessage, "success");
      } else {
        throw new Error("Clipboard API unavailable");
      }
    } catch (error) {
      console.error(error);
      toasts.addToast(errorMessage, "error");
    }
  }

  function gotoWithTab(pathname: string, tab: string) {
    const params = new SvelteURLSearchParams($page.url.search);
    params.set("tab", tab);
    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    return gotoResolved(href);
  }

  function handleServerClick(server: Server) {
    lastVisitedServerId.set(server.id);
    serverStore.setActiveServer(server.id);
    const targetPath = `/channels/${server.id}`;
    if ($page.url.pathname !== targetPath) gotoResolved(targetPath);
  }

  async function handleServerAction({
    action,
    server,
  }: {
    action: string;
    server: Server;
  }) {
    switch (action) {
      case "mark_as_read": {
        const snapshot = get(serverStore);
        const liveServer =
          snapshot.servers.find((entry) => entry.id === server.id) ?? server;
        for (const channel of liveServer.channels ?? []) {
          await chatStore.markChatRead(channel.id, {
            serverId: liveServer.id,
          });
        }
        toasts.addToast("All channels marked as read.", "success");
        break;
      }
      case "mute_unmute_server": {
        const next = new SvelteSet(mutedServerIds);
        if (next.has(server.id)) {
          next.delete(server.id);
          toasts.addToast("Server unmuted (local).", "info");
        } else {
          next.add(server.id);
          toasts.addToast("Server muted (local).", "info");
        }
        mutedServerIds = next;
        saveMutedServers(next);
        break;
      }
      case "notification_settings":
        lastVisitedServerId.set(server.id);
        gotoResolved("/settings/notifications");
        break;
      case "copy_server_id":
        await copyText(
          server.id,
          "Server ID copied.",
          "Failed to copy server ID.",
        );
        break;
      case "view_icon":
        if (server.iconUrl) {
          await copyText(
            server.iconUrl,
            "Icon URL copied.",
            "Failed to copy icon URL.",
          );
        } else {
          toasts.addToast("This server does not have an icon.", "info");
        }
        break;
      case "view_raw":
        await copyText(
          JSON.stringify(server, null, 2),
          "Server data copied.",
          "Failed to copy server data.",
        );
        break;
      case "invite_people": {
        try {
          const response = await invoke<ServerInviteResponse>(
            "generate_server_invite",
            { server_id: server.id },
          );
          const invite = mapInviteResponse(response);
          serverStore.addInviteToServer(server.id, invite);
          const link = buildInviteLinkFromCode(invite.code);
          await copyText(
            link,
            "Invite link copied.",
            "Failed to copy invite link.",
          );
        } catch (error: any) {
          console.error("Failed to generate invite link:", error);
          toasts.addToast(
            error?.message ?? "Failed to generate invite link.",
            "error",
          );
        }
        break;
      }
      case "server-settings":
        lastVisitedServerId.set(server.id);
        serverStore.setActiveServer(server.id);
        gotoServerSettings(server.id);
        break;
      case "create_channel":
        lastVisitedServerId.set(server.id);
        serverStore.setActiveServer(server.id);
        gotoServerSettings(server.id, "channels");
        toasts.addToast(
          "Opening server settings. Use the Channels tab to create a channel.",
          "info",
        );
        break;
      case "create_category":
        lastVisitedServerId.set(server.id);
        serverStore.setActiveServer(server.id);
        gotoServerSettings(server.id, "channels");
        toasts.addToast("Manage categories from the Channels tab.", "info");
        break;
      case "create_event":
        lastVisitedServerId.set(server.id);
        serverStore.setActiveServer(server.id);
        eventModalServer = server;
        break;
      case "leave_server":
        if (
          confirm(`Are you sure you want to leave the server "${server.name}"?`)
        ) {
          try {
            await invoke("leave_server", { server_id: server.id });
            serverStore.removeServer(server.id);

            if (get(serverStore).activeServerId === server.id) {
              serverStore.setActiveServer(null);
              lastVisitedServerId.set(null);
              gotoWithTab("/friends", "All");
            }
          } catch (error) {
            console.error("Failed to leave server:", error);
            toasts.addToast(
              "Failed to leave server. Please try again.",
              "error",
            );
          }
        }
        break;
      case "delete_server":
        if (confirm(`Delete "${server.name}"? This cannot be undone.`)) {
          try {
            await invoke("delete_server", { server_id: server.id });
            const activeServerId = get(serverStore).activeServerId;
            serverStore.removeServer(server.id);

            if (activeServerId === server.id) {
              serverStore.setActiveServer(null);
              lastVisitedServerId.set(null);
              gotoWithTab("/friends", "All");
            }
            toasts.addToast("Server deleted.", "success");
          } catch (error) {
            console.error("Failed to delete server:", error);
            toasts.addToast("Failed to delete server.", "error");
          }
        }
        break;
      default:
        console.debug("Unhandled server action:", action, server.id);
    }
  }
</script>

<Sidebar
  side="left"
  variant="solid"
  class="flex flex-col w-16 min-w-16 items-center bg-background px-0 py-4 gap-4 text-foreground border-0"
  aria-label="Server navigation"
>
  <TooltipProvider>
    <SidebarHeader class="h-auto w-full border-0 px-0 pb-4 justify-center">
      <Tooltip>
        <TooltipTrigger>
          <Button
            size="icon"
            variant="secondary"
            aria-label="Home"
            class="rounded-xl cursor-pointer"
              onclick={async () => {
                serverStore.setActiveServer(null);
                chatStore.clearActiveChat();
                if ($friendStore.friends.length > 0) {
                  await gotoWithTab("/", "All");
                } else {
                  await gotoResolved("/friends/add");
                }
                chatStore.clearActiveChat();
              }}
          >
            <House class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Home</TooltipContent>
      </Tooltip>
    </SidebarHeader>

    <SidebarContent class="w-full px-0">
      <ScrollArea class="h-full w-full">
          <SidebarMenu class="items-center gap-2">
          {#each $serverStore.servers as server (server.id)}
            <SidebarMenuItem
              class="group relative flex w-full items-center justify-center"
            >
              {@const unreadCount =
                $serverUnreadCountByServerId.get(server.id) ?? 0}
              {@const isMuted = mutedServerIds.has(server.id)}
              <span
                aria-hidden="true"
                class={cn(
                  "pointer-events-none absolute top-1/2 h-6 -translate-y-1/2 rounded-r bg-primary transition-all duration-200 ease-out",
                  $serverStore.activeServerId === server.id
                    ? "w-1 opacity-100"
                    : "w-0 opacity-0 group-hover:w-1 group-hover:opacity-100",
                )}
              ></span>
              <ServerContextMenu
                {server}
                muted={isMuted}
                onaction={handleServerAction}
              >
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  class={cn(
                    "size-10 p-0 rounded-full border-2 cursor-pointer relative",
                    $serverStore.activeServerId === server.id
                      ? "border-primary"
                      : "border-border",
                    isMuted && "opacity-60 grayscale",
                  )}
                  onclick={() => handleServerClick(server)}
                  aria-label={
                    unreadCount > 0
                      ? `${server.name} (${unreadCount} unread messages)`
                      : server.name
                  }
                >
                  {#if unreadCount > 0}
                    {@const unreadBadgeClasses =
                      cn(
                        "pointer-events-none absolute -top-1 -right-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-tight text-destructive-foreground shadow-sm",
                        unreadCount > 9 ? "px-1.5" : "px-1",
                        isMuted && "opacity-70",
                      )}
                    <span class={unreadBadgeClasses} aria-hidden="true">
                      {formatUnreadCount(unreadCount)}
                    </span>
                  {/if}
                  {#if server.iconUrl}
                    <Avatar class="size-10">
                      <AvatarImage
                        src={server.iconUrl}
                        alt={`${server.name} icon`}
                      />
                      <AvatarFallback
                        class="text-[10px] font-semibold uppercase"
                      >
                        {server.name.slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                  {:else}
                    <Avatar class="size-10">
                      <AvatarFallback class="text-xs font-semibold uppercase">
                        {server.name.slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                  {/if}
                </Button>
              </ServerContextMenu>
            </SidebarMenuItem>
          {/each}

          <SidebarMenuItem class="flex justify-center">
            <Tooltip>
              <TooltipTrigger>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Create or Join Server"
                  class="rounded-xl cursor-pointer"
                  onclick={onCreateJoinServerClick}
                >
                  <Plus class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Create or Join</TooltipContent>
            </Tooltip>
          </SidebarMenuItem>
        </SidebarMenu>
      </ScrollArea>
    </SidebarContent>

    <Separator class="w-10" />

    <SidebarFooter class="w-full border-0 px-0 pt-0 p-0">
      <div class="flex flex-col items-center gap-3">
        <Tooltip>
          <TooltipTrigger>
            <Button
              size="icon"
              variant="ghost"
              class="rounded-xl cursor-pointer"
              aria-label="Mesh Explorer"
              onclick={() => gotoResolved("/settings/network#mesh-explorer")}
            >
              <RadioTower class="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Mesh Explorer</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <Button
              size="icon"
              variant="ghost"
              class="rounded-xl cursor-pointer"
              aria-label="Settings"
              onclick={() => gotoResolved("/settings")}
            >
              <Settings class="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>

        <Popover.Root>
          <Popover.Trigger>
            <Button
              variant="outline"
              size="icon"
              class="size-10 p-0 rounded-full overflow-hidden cursor-pointer"
              aria-label="Open Profile"
            >
              <Avatar class="size-10">
                <AvatarImage src={$userStore.me?.avatar} alt="User Avatar" />
                <AvatarFallback class="text-xs">ME</AvatarFallback>
              </Avatar>
            </Button>
          </Popover.Trigger>
          <Popover.Content side="right" class="w-auto p-0 border-none">
            {#if $userStore.me}
              <UserCardModal
                profileUser={$userStore.me}
                {openDetailedProfileModal}
                isServerMemberContext={false}
              />
            {/if}
          </Popover.Content>
        </Popover.Root>
      </div>
    </SidebarFooter>
  </TooltipProvider>
</Sidebar>

{#if eventModalServer}
  <ServerEventModal
    server={eventModalServer}
    onclose={() => {
      eventModalServer = null;
    }}
  />
{/if}
