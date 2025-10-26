<svelte:options runes={true} />

<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import ServerBackgroundContextMenu from "$lib/components/context-menus/ServerBackgroundContextMenu.svelte";
  import CategoryContextMenu from "$lib/components/context-menus/CategoryContextMenu.svelte";
  import ChannelContextMenu from "$lib/components/context-menus/ChannelContextMenu.svelte";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { chatStore } from "$lib/features/chat/stores/chatStore";
  import { toasts } from "$lib/stores/ToastStore";
  import type { Channel } from "$lib/features/channels/models/Channel";
  import type { ServerInvite } from "$lib/features/servers/models/ServerInvite";
  import {
    Bell,
    Plus,
    Settings,
    ChevronDown,
    Hash,
    CircleX,
    Mic,
    Info,
    UserPlus,
    ExternalLink,
    UserRoundPen,
    Shield,
    Square,
    Calendar,
  } from "@lucide/svelte";
  import type { Server } from "$lib/features/servers/models/Server";
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import { v4 as uuidv4 } from "uuid";
  import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
  } from "$lib/components/ui/dropdown-menu/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { SvelteSet } from "svelte/reactivity";
  import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
  } from "$lib/components/ui/collapsible/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import {
    Sidebar,
    SidebarHeader,
    SidebarContent,
  } from "$lib/components/ui/sidebar";
  import {
    Dialog,
    DialogHeader,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from "$lib/components/ui/dialog/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
  } from "$lib/components/ui/tooltip/index.js";
  import { channelDisplayPreferencesStore } from "$lib/features/channels/stores/channelDisplayPreferencesStore";

  type NavigationFn = (..._args: [string | URL]) => void; // eslint-disable-line no-unused-vars
  type ChannelSelectHandler = (..._args: [string, string]) => void; // eslint-disable-line no-unused-vars

  const gotoUnsafe: NavigationFn = goto as unknown as NavigationFn;

  let {
    server,
    onSelectChannel,
  }: { server: Server; onSelectChannel: ChannelSelectHandler } = $props();

  const { activeServerChannelId } = chatStore;

  let showCreateChannelModal = $state(false);
  let newChannelName = $state("");
  let newChannelType = $state<"text" | "voice">("text");
  let newChannelPrivate = $state(false);

  let showCategoryContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let contextMenuCategoryId = $state("");

  let showChannelContextMenu = $state(false);
  let channelContextMenuX = $state(0);
  let channelContextMenuY = $state(0);
  let selectedChannelForContextMenu = $state<Channel | null>(null);

  let textChannelsCollapsed = $state(false);
  let hideMutedChannels = $state(false);
  let mutedChannelIds = new SvelteSet<string>();
  let lastLoadedPreferencesKey = $state<string | null>(null);

  let isResizing = $state(false);
  let rafId: number | null = $state(null);
  let initialX = $state(0);
  let initialWidth = $state(0);
  const initialSidebarWidth = browser
    ? parseInt(localStorage.getItem("serverSidebarWidth") ?? "240", 10)
    : 240;
  let sidebarWidth = $state(initialSidebarWidth);

  const TEXT_COLLAPSED_KEY = "serverSidebar.textCollapsed";

  function gotoResolved(path: string) {
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    gotoUnsafe(path);
  }

  function slugifyChannelName(name: string) {
    return name.trim().toLowerCase().replace(/\s+/g, "-");
  }

  function startResize(e: MouseEvent) {
    isResizing = true;
    initialX = e.clientX;
    initialWidth = sidebarWidth;
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResize);
  }

  function resize(e: MouseEvent) {
    if (!isResizing) return;
    const targetWidth = Math.max(
      200,
      Math.min(400, initialWidth + (e.clientX - initialX)),
    );
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      sidebarWidth = targetWidth;
      rafId = null;
    });
  }

  function stopResize() {
    isResizing = false;
    if (browser) {
      localStorage.setItem("serverSidebarWidth", sidebarWidth.toString());
    }
    window.removeEventListener("mousemove", resize);
    window.removeEventListener("mouseup", stopResize);
  }

  onMount(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAllContextMenus();
    };
    const handleGlobalScroll = () => closeAllContextMenus();
    window.addEventListener("keydown", handleGlobalKeydown);
    window.addEventListener("scroll", handleGlobalScroll, true);

    try {
      const tc = localStorage.getItem(TEXT_COLLAPSED_KEY);
      if (tc !== null) textChannelsCollapsed = tc === "true";
      const hm = localStorage.getItem("serverSidebar.hideMuted");
      if (hm !== null) hideMutedChannels = hm === "true";
    } catch (e) {
      void e;
    }

    mutedChannelIds = loadMutedChannels();

    return () => {
      window.removeEventListener("keydown", handleGlobalKeydown);
      window.removeEventListener("scroll", handleGlobalScroll, true);
    };
  });

  $effect(() => {
    if (!server?.id) return;
    const channelIds = Array.isArray(server.channels)
      ? server.channels.map((c: Channel) => c.id)
      : [];
    const key = `${server.id}:${channelIds.length}`;
    if (lastLoadedPreferencesKey === key) return;
    lastLoadedPreferencesKey = key;
    channelDisplayPreferencesStore
      .loadForServer(server.id, channelIds)
      .catch((error) => {
        console.error(
          "Failed to load channel display preferences for server",
          server.id,
          error,
        );
      });
  });

  onDestroy(() => {
    if (rafId) cancelAnimationFrame(rafId);
  });

  function handleServerSettingsClick() {
    gotoResolved(`/channels/${server.id}/settings`);
  }
  function handlePrivacySettings() {
    gotoResolved("/settings/privacy");
  }
  function handleEditProfile() {
    gotoResolved(`/channels/${server.id}/settings?tab=profile`);
  }
  function handleHideMutedChannels() {
    const key = "serverSidebar.hideMuted";
    let next = !hideMutedChannels;
    if (browser) {
      try {
        const storedValue = localStorage.getItem(key);
        if (storedValue !== null) {
          next = storedValue !== "true";
        }
        localStorage.setItem(key, next.toString());
      } catch (e) {
        console.error(e);
      }
    }
    hideMutedChannels = next;
    toasts.addToast(
      `${next ? "Hiding" : "Showing"} muted channels (local).`,
      "info",
    );
  }

  function handleViewReviews() {
    // Replace with actual reviews dialog
  }

  async function handleInviteToServerClick() {
    try {
      const response = await invoke<ServerInviteResponse>(
        "generate_server_invite",
        {
          server_id: server.id,
        },
      );
      const invite = mapInviteResponse(response);
      serverStore.addInviteToServer(server.id, invite);
      const link = buildInviteLinkFromCode(invite.code);
      await navigator.clipboard.writeText(link);
      toasts.addToast("Invite link copied.", "success");
    } catch (error: any) {
      console.error("Failed to generate invite link:", error);
      toasts.addToast(
        error?.message ?? "Failed to generate invite link.",
        "error",
      );
    }
  }

  function handleCreateChannelClick() {
    showCreateChannelModal = true;
  }

  function handleCreateCategory() {
    toasts.addToast("Create Category not yet implemented.", "info");
  }

  function handleCreateEvent() {
    toasts.addToast("Create Event not yet implemented.", "info");
  }

  function handleNotificationSettings() {
    gotoResolved("/settings/notifications");
  }

  function closeAllContextMenus() {
    showCategoryContextMenu = false;
    showChannelContextMenu = false;
    selectedChannelForContextMenu = null;
  }

  function clampToViewport(
    x: number,
    y: number,
    approxWidth = 220,
    approxHeight = 260,
  ) {
    const maxX = Math.max(0, (window.innerWidth || 0) - approxWidth - 8);
    const maxY = Math.max(0, (window.innerHeight || 0) - approxHeight - 8);
    return { x: Math.min(x, maxX), y: Math.min(y, maxY) };
  }

  async function handleLeaveServer() {
    if (
      confirm(`Are you sure you want to leave the server "${server.name}"?`)
    ) {
      try {
        await invoke("leave_server", { server_id: server.id });
        serverStore.removeServer(server.id);
        serverStore.setActiveServer(null);
        gotoResolved("/friends?tab=All");
      } catch (error) {
        console.error("Failed to leave server:", error);
        toasts.addToast("Failed to leave server. Please try again.", "error");
      }
    }
  }

  async function createChannel() {
    if (!newChannelName.trim()) return;

    const newChannel: Channel = {
      id: uuidv4(),
      server_id: server.id,
      name: slugifyChannelName(newChannelName),
      channel_type: newChannelType,
      private: newChannelPrivate,
    };

    try {
      await invoke("create_channel", { channel: newChannel });
      serverStore.addChannelToServer(server.id, newChannel);
      toasts.addToast("Channel created.", "success");
      if (newChannel.channel_type === "text") {
        onSelectChannel(server.id, newChannel.id);
      }
      newChannelName = "";
      newChannelType = "text";
      newChannelPrivate = false;
      showCreateChannelModal = false;
    } catch (error) {
      console.error("Failed to create channel:", error);
      toasts.addToast("Failed to create channel.", "error");
    }
  }

  async function handleDeleteChannel(channelId: string) {
    try {
      await invoke("delete_channel", { channel_id: channelId });
      const current = server.channels || [];
      const updated = current.filter((c: Channel) => c.id !== channelId);
      let nextChannelId: string | null = null;
      const remainingText = updated.find(
        (c: Channel) => c.channel_type === "text",
      );
      nextChannelId = remainingText?.id || updated[0]?.id || null;

      serverStore.updateServer(server.id, { channels: updated });
      if ($activeServerChannelId === channelId && nextChannelId) {
        onSelectChannel(server.id, nextChannelId);
      }
    } catch (error) {
      console.error("Failed to delete channel:", error);
      toasts.addToast("Failed to delete channel.", "error");
    }
  }

  function handleCategoryContextMenu(event: MouseEvent, categoryId: string) {
    event.preventDefault();
    event.stopPropagation();

    closeAllContextMenus();
    const pos = clampToViewport(event.clientX, event.clientY);
    contextMenuX = pos.x;
    contextMenuY = pos.y;
    contextMenuCategoryId = categoryId;
    showCategoryContextMenu = true;
  }

  function handleCategoryAction({
    action,
    categoryId,
  }: {
    action: string;
    categoryId: string;
  }) {
    toasts.addToast(`Action: ${action} on category: ${categoryId}`, "info");
    showCategoryContextMenu = false;
  }

  function handleChannelContextMenu(event: MouseEvent, channel: Channel) {
    event.preventDefault();
    event.stopPropagation();

    closeAllContextMenus();
    const pos = clampToViewport(event.clientX, event.clientY);
    channelContextMenuX = pos.x;
    channelContextMenuY = pos.y;
    selectedChannelForContextMenu = channel;
    showChannelContextMenu = true;
  }

  function getChannelById(id: string) {
    return server.channels.find((c: Channel) => c.id === id);
  }

  function buildChannelLink(channelId: string) {
    const path = `/channels/${server.id}/${channelId}`;
    try {
      if (typeof window !== "undefined" && window.location?.origin) {
        return `${window.location.origin}${path}`;
      }
    } catch (e) {
      void e;
    }
    return path;
  }

  function buildInviteLinkFromCode(code: string) {
    const path = `/inv/${code}`;
    try {
      if (typeof window !== "undefined" && window.location?.origin) {
        return `${window.location.origin}${path}`;
      }
    } catch (e) {
      void e;
    }
    return path;
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

  const MUTED_CHANNELS_KEY = "mutedChannels";
  function loadMutedChannels(): SvelteSet<string> {
    if (!browser) return new SvelteSet();
    try {
      const raw = localStorage.getItem(MUTED_CHANNELS_KEY);
      if (!raw) return new SvelteSet();
      return new SvelteSet(JSON.parse(raw));
    } catch {
      return new SvelteSet();
    }
  }
  function saveMutedChannels(setVals: Set<string>) {
    if (!browser) return;
    try {
      localStorage.setItem(
        MUTED_CHANNELS_KEY,
        JSON.stringify(Array.from(setVals)),
      );
    } catch (e) {
      void e;
    }
  }

  async function handleChannelAction({
    action,
    channelId,
  }: {
    action: string;
    channelId: string;
  }) {
    try {
      switch (action) {
        case "delete_channel": {
          const channelName = getChannelById(channelId)?.name || "this channel";
          const confirmed = confirm(
            `Delete ${channelName}? This cannot be undone.`,
          );
          if (confirmed) {
            await handleDeleteChannel(channelId);
            toasts.addToast("Channel deleted.", "success");
          }
          break;
        }
        case "create_text_channel": {
          newChannelType = "text";
          showCreateChannelModal = true;
          break;
        }
        case "create_voice_channel": {
          newChannelType = "voice";
          showCreateChannelModal = true;
          break;
        }
        case "edit_channel": {
          const ch = getChannelById(channelId);
          if (!ch) break;
          const newName = prompt("Rename channel", ch.name)?.trim();
          if (newName && newName !== ch.name) {
            const updatedName = slugifyChannelName(newName);
            const updatedChannels = (server.channels || []).map((c: Channel) =>
              c.id === ch.id ? { ...c, name: updatedName } : c,
            );
            serverStore.updateServer(server.id, { channels: updatedChannels });
            toasts.addToast("Channel renamed.", "success");
          }
          break;
        }
        case "duplicate_channel": {
          const orig = getChannelById(channelId);
          if (!orig) break;
          const dup: Channel = {
            id: uuidv4(),
            server_id: server.id,
            name: `${orig.name}-copy`,
            channel_type: orig.channel_type,
            private: orig.private,
          };
          try {
            await invoke("create_channel", { channel: dup });
            serverStore.addChannelToServer(server.id, dup);
            toasts.addToast("Channel duplicated.", "success");
          } catch (e) {
            console.error("Failed to duplicate channel:", e);
            toasts.addToast("Failed to duplicate channel.", "error");
          }
          break;
        }
        case "copy_channel_id": {
          await navigator.clipboard.writeText(channelId);
          toasts.addToast("Channel ID copied.", "success");
          break;
        }
        case "copy_link": {
          const link = buildChannelLink(channelId);
          await navigator.clipboard.writeText(link);
          toasts.addToast("Channel link copied.", "success");
          break;
        }
        case "open_chat": {
          onSelectChannel(server.id, channelId);
          break;
        }
        case "mark_as_read": {
          toasts.addToast("Marked as read (local).", "info");
          break;
        }
        case "mute_channel": {
          const muted = loadMutedChannels();
          if (muted.has(channelId)) {
            muted.delete(channelId);
            toasts.addToast("Channel unmuted (local).", "info");
          } else {
            muted.add(channelId);
            toasts.addToast("Channel muted (local).", "info");
          }
          saveMutedChannels(muted);
          mutedChannelIds = new SvelteSet(muted);
          break;
        }
        case "hide_names": {
          try {
            const next = await channelDisplayPreferencesStore.toggleHideMemberNames(
              channelId,
            );
            toasts.addToast(
              next
                ? "Member names hidden for this channel."
                : "Member names visible for this channel.",
              "success",
            );
          } catch (error: any) {
            console.error("Failed to toggle hide names preference:", error);
            toasts.addToast(
              error?.message ?? "Failed to update channel preference.",
              "error",
            );
          }
          break;
        }
        case "notification_settings": {
          gotoResolved("/settings/notifications");
          break;
        }
        case "invite_people": {
          toasts.addToast("Invites not implemented yet.", "info");
          break;
        }
        default: {
          console.debug("Unhandled channel action:", action, channelId);
        }
      }
    } finally {
      showChannelContextMenu = false;
    }
  }

  function handleServerBackgroundAction({ action }: { action: string }) {
    switch (action) {
      case "create_channel":
        showCreateChannelModal = true;
        break;
      case "create_category":
        toasts.addToast("Create category not implemented yet.", "info");
        break;
      case "invite_people":
        handleInviteToServerClick();
        break;
      case "hide_muted_channels": {
        const key = "serverSidebar.hideMuted";
        let next = !hideMutedChannels;
        if (browser) {
          try {
            const storedValue = localStorage.getItem(key);
            if (storedValue !== null) {
              next = storedValue !== "true";
            }
            localStorage.setItem(key, next.toString());
          } catch (e) {
            console.error(e);
          }
        }
        hideMutedChannels = next;
        toasts.addToast(
          `${next ? "Hiding" : "Showing"} muted channels (local).`,
          "info",
        );
        break;
      }
      default:
        console.debug("Unhandled server background action", action);
    }
  }

  function handleInviteToChannelClick(channel: Channel, event?: MouseEvent) {
    event?.stopPropagation();
    const link = buildChannelLink(channel.id);
    navigator.clipboard
      .writeText(link)
      .then(() => {
        toasts.addToast("Channel link copied.", "success");
      })
      .catch(() => {
        toasts.addToast("Failed to copy link.", "error");
      });
  }

  function handleChannelSettingsClick(channel: Channel, event?: MouseEvent) {
    event?.stopPropagation();
    gotoResolved(`/channels/${server.id}/settings?tab=channels`);
  }
</script>

<ServerBackgroundContextMenu onaction={handleServerBackgroundAction}>
  <Sidebar
    side="left"
    variant="muted"
    class="relative flex"
    style={`width: ${sidebarWidth}px`}
    aria-label="Server sidebar"
  >
    {#if server}
      <SidebarHeader class="px-0 pl-2 shadow-sm">
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
            class="w-[218px] [&>*]:cursor-pointer"
          >
            <DropdownMenuItem onselect={handleInviteToServerClick}>
              <UserPlus size={12} class="mr-2" /> Invite to Server
            </DropdownMenuItem>
            <DropdownMenuItem onselect={handleServerSettingsClick}>
              <Settings size={12} class="mr-2" /> Server Settings
            </DropdownMenuItem>
            <DropdownMenuItem onselect={handleCreateChannelClick}>
              <Plus size={12} class="mr-2" /> Create Channel
            </DropdownMenuItem>
            <DropdownMenuItem onselect={handleCreateCategory}>
              <Plus size={12} class="mr-2" /> Create Category
            </DropdownMenuItem>
            <DropdownMenuItem onselect={handleCreateEvent}>
              <Calendar size={12} class="mr-2" /> Create Event
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onselect={handleNotificationSettings}>
              <Bell size={12} class="mr-2" /> Notification Settings
            </DropdownMenuItem>
            <DropdownMenuItem onselect={handlePrivacySettings}>
              <Shield size={12} class="mr-2" /> Privacy Settings
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onselect={handleEditProfile}>
              <UserRoundPen size={12} class="mr-2" /> Edit Per-server Profile
            </DropdownMenuItem>
            <DropdownMenuItem onselect={handleHideMutedChannels}>
              <Square size={12} class="mr-2" /> Hide Muted Channels
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              class="text-destructive focus:text-destructive"
              onselect={handleLeaveServer}
            >
              <CircleX size={12} class="mr-2" /> Leave Server
            </DropdownMenuItem>
            <DropdownMenuItem onselect={handleViewReviews}>
              <ExternalLink size={12} class="mr-2" /> View Reviews
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          class="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
          aria-label="Invite People"
        >
          <Plus size={12} />
        </Button>
      </SidebarHeader>

      <SidebarContent class="flex">
        <ScrollArea class="h-full w-full px-2">
          <Collapsible
            open={!textChannelsCollapsed}
            onOpenChange={(value) => {
              textChannelsCollapsed = !value;
            }}
          >
            <div class="flex justify-between items-center py-1 mt-4">
              <CollapsibleTrigger
                class="flex items-center group cursor-pointer"
              >
                <h3
                  class="text-sm font-semibold text-muted-foreground uppercase group-hover:text-foreground select-none"
                  class:text-foreground={showCategoryContextMenu &&
                    contextMenuCategoryId === "text-channels"}
                  oncontextmenu={(e) =>
                    handleCategoryContextMenu(e, "text-channels")}
                >
                  Text Channels
                </h3>
                <ChevronDown
                  size={10}
                  class="ml-1 transition-transform duration-200 {textChannelsCollapsed
                    ? 'rotate-[-90deg]'
                    : ''}"
                />
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Create Channel"
                onclick={handleCreateChannelClick}
              >
                <Plus size={12} />
              </Button>
            </div>

            <CollapsibleContent>
              {#if server && server.channels && server.channels.length > 0}
                {#each server.channels.filter((c: Channel) => c.channel_type === "text" && (!hideMutedChannels || !mutedChannelIds.has(c.id))) as channel (channel.id)}
                  <div
                    role="button"
                    tabindex="0"
                    class="group w-full h-[34px] text-left py-2 px-2 flex items-center justify-between transition-colors cursor-pointer my-1 rounded-md
                    {$activeServerChannelId === channel.id
                      ? 'bg-primary/80 text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}"
                    onclick={() => onSelectChannel(server.id, channel.id)}
                    onkeydown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        onSelectChannel(server.id, channel.id);
                      }
                    }}
                    oncontextmenu={(e) => handleChannelContextMenu(e, channel)}
                  >
                    <div class="flex items-center truncate">
                      <Hash size={10} class="mr-1" />
                      <span class="truncate select-none ml-2"
                        >{channel.name}</span
                      >
                    </div>
                    <div
                      class="ml-auto flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        class="text-muted-foreground hover:text-foreground"
                        aria-label="Invite to channel"
                        onclick={(event) =>
                          handleInviteToChannelClick(channel, event)}
                      >
                        <Plus size={10} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="text-muted-foreground hover:text-foreground"
                        aria-label="Channel settings"
                        onclick={(event) =>
                          handleChannelSettingsClick(channel, event)}
                      >
                        <Settings size={10} />
                      </Button>
                    </div>
                  </div>
                {/each}
              {:else}
                <p class="text-xs text-muted-foreground px-2 py-1">
                  No text channels yet.
                </p>
              {/if}
            </CollapsibleContent>
          </Collapsible>
        </ScrollArea>
      </SidebarContent>
    {:else}
      <SidebarContent class="flex">
        <ScrollArea class="h-full w-full px-2">
          <p class="text-xs text-muted-foreground px-2 py-1">
            No server selected.
          </p>
        </ScrollArea>
      </SidebarContent>
    {/if}

    <button
      class="absolute top-0 right-0 w-2 h-full cursor-ew-resize"
      onmousedown={startResize}
      aria-label="Resize server sidebar"
    ></button>
  </Sidebar>
</ServerBackgroundContextMenu>
{#if showCategoryContextMenu}
  <CategoryContextMenu
    x={contextMenuX}
    y={contextMenuY}
    categoryId={contextMenuCategoryId}
    onaction={handleCategoryAction}
    onclose={() => (showCategoryContextMenu = false)}
  />
{/if}

{#if showChannelContextMenu && selectedChannelForContextMenu}
  <ChannelContextMenu
    x={channelContextMenuX}
    y={channelContextMenuY}
    channel={selectedChannelForContextMenu}
    onaction={handleChannelAction}
    onclose={() => {
      showChannelContextMenu = false;
      selectedChannelForContextMenu = null;
    }}
  />
{/if}

<Dialog
  open={showCreateChannelModal}
  onOpenChange={(value) => (showCreateChannelModal = value)}
>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Create Channel</DialogTitle>
      <DialogDescription>
        Create a text or voice channel with a name, optional topic, and privacy.
      </DialogDescription>
    </DialogHeader>

    <div class="space-y-6">
      <div>
        <Label
          class="text-xs font-semibold uppercase text-muted-foreground mb-2"
        >
          Channel Type
        </Label>
        <div class="grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant={newChannelType === "text" ? "secondary" : "outline"}
            class="flex items-center gap-3 text-left"
            onclick={() => (newChannelType = "text")}
          >
            <Hash size={16} />
            <div>
              <div class="text-sm font-medium">Text</div>
              <div class="text-xs text-muted-foreground">
                Chat with messages, images, links
              </div>
            </div>
          </Button>
          <Button
            type="button"
            variant={newChannelType === "voice" ? "secondary" : "outline"}
            class="flex items-center gap-3 text-left"
            onclick={() => (newChannelType = "voice")}
          >
            <Mic size={16} />
            <div>
              <div class="text-sm font-medium">Voice</div>
              <div class="text-xs text-muted-foreground">
                Talk, video, and share screen
              </div>
            </div>
          </Button>
        </div>
      </div>

      <div>
        <Label
          for="channel-name"
          class="text-xs font-semibold uppercase text-muted-foreground mb-2"
        >
          Channel Name
        </Label>
        <div
          class="flex items-center bg-muted border border-border rounded-md px-3 focus-within:ring-2 focus-within:ring-ring"
        >
          {#if newChannelType === "text"}
            <span class="text-muted-foreground mr-2">#</span>
          {/if}
          <Input
            id="channel-name"
            placeholder={newChannelType === "text"
              ? "new-channel"
              : "New Voice Channel"}
            class="flex-1 border-0 bg-transparent px-0 py-2 text-sm focus-visible:ring-0"
            bind:value={newChannelName}
            autofocus
            onkeydown={(e) => {
              if (e.key === "Enter") createChannel();
            }}
          />
        </div>
      </div>

      <div class="flex items-center justify-between gap-4">
        <div class="flex flex-col">
          <span class="text-sm font-medium flex items-center gap-1">
            Private Channel
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="text-muted-foreground hover:text-foreground"
                    aria-label="More info about private channels"
                  >
                    <Info size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  align="start"
                  class="max-w-xs text-xs leading-snug"
                >
                  When enabled, only selected members and roles will be able to
                  see and join this channel.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </span>
          <span class="text-xs text-muted-foreground">
            Restrict access to specific members or roles
          </span>
        </div>
        <Switch
          bind:checked={newChannelPrivate}
          id="priv"
          aria-label="Private Channel"
        />
      </div>

      {#if newChannelType === "text"}
        <div>
          <Label
            for="channel-topic"
            class="text-xs font-semibold uppercase text-muted-foreground mb-2"
          >
            Topic
          </Label>
          <Input
            id="channel-topic"
            placeholder="What’s this channel about?"
            class="w-full"
          />
        </div>
      {/if}
    </div>

    <DialogFooter>
      <Button variant="ghost" onclick={() => (showCreateChannelModal = false)}
        >Cancel</Button
      >
      <Button onclick={createChannel} disabled={!newChannelName.trim()}>
        <Plus size={14} class="mr-2" /> Create Channel
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
