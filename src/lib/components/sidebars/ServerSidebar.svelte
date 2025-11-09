<svelte:options runes={true} />

<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import ServerBackgroundContextMenu from "$lib/components/context-menus/ServerBackgroundContextMenu.svelte";
  import CategoryContextMenu from "$lib/components/context-menus/CategoryContextMenu.svelte";
  import ChannelContextMenu from "$lib/components/context-menus/ChannelContextMenu.svelte";
  import CreateCategoryModal from "$lib/components/modals/CreateCategoryModal.svelte";
  import ServerEventModal from "$lib/components/modals/ServerEventModal.svelte";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import {
    chatMetadataByChatId,
    chatStore,
  } from "$lib/features/chat/stores/chatStore";
  import { callStore } from "$lib/features/calls/stores/callStore";
  import { toasts } from "$lib/stores/ToastStore";
  import type { Channel } from "$lib/features/channels/models/Channel";
  import type { ChannelCategory } from "$lib/features/channels/models/ChannelCategory";
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
    Lock,
  } from "@lucide/svelte";
  import type { Server } from "$lib/features/servers/models/Server";
  import { getContext, onDestroy, onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import { SvelteURLSearchParams } from "svelte/reactivity";
  import { v4 as uuidv4 } from "uuid";
  import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
  } from "$lib/components/ui/dropdown-menu/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge";
  import {
    Avatar,
    AvatarImage,
    AvatarFallback,
  } from "$lib/components/ui/avatar/index.js";
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
  import { mutedChannelsStore } from "$lib/features/channels/stores/mutedChannelsStore";
  import { CREATE_GROUP_CONTEXT_KEY } from "$lib/contextKeys";
  import type { CreateGroupContext } from "$lib/contextTypes";
  import type { ChatMetadata } from "$lib/features/chat/stores/chatStore";
  import { userStore } from "$lib/stores/userStore";

  type NavigationFn = (..._args: [string | URL]) => void; // eslint-disable-line no-unused-vars
  type ChannelSelectHandler = (..._args: [string, string]) => void; // eslint-disable-line no-unused-vars

  const gotoUnsafe: NavigationFn = goto as unknown as NavigationFn;

  let {
    server,
    onSelectChannel,
  }: { server: Server; onSelectChannel: ChannelSelectHandler } = $props();

  const { activeServerChannelId } = chatStore;

  let channelMetadataLookup = $state(new Map<string, ChatMetadata>());

  const unsubscribeChatMetadata = chatMetadataByChatId.subscribe(
    (metadataMap) => {
      channelMetadataLookup = new Map(metadataMap);
    },
  );

  const createGroupContext = getContext<CreateGroupContext | undefined>(
    CREATE_GROUP_CONTEXT_KEY,
  );
  const openProfileReviewsModal = createGroupContext?.openProfileReviewsModal;

  let showCreateChannelModal = $state(false);
  let showCreateCategoryModal = $state(false);
  let showServerEventModal = $state(false);
  let newChannelName = $state("");
  let newChannelType = $state<"text" | "voice">("text");
  let newChannelPrivate = $state(false);
  let newChannelTopic = $state("");
  let selectedRoleIds = new SvelteSet<string>();
  let selectedMemberIds = new SvelteSet<string>();
  let roleSearchTerm = $state("");
  let memberSearchTerm = $state("");

  let showCategoryContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let contextMenuCategoryId = $state("");

  let showChannelContextMenu = $state(false);
  let channelContextMenuX = $state(0);
  let channelContextMenuY = $state(0);
  let selectedChannelForContextMenu = $state<Channel | null>(null);

  let textChannelsCollapsed = $state(false);
  let voiceChannelsCollapsed = $state(false);
  let collapsedCategoryIds = new SvelteSet<string>();
  let lastCollapsedServerId = $state<string | null>(null);
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
  const VOICE_COLLAPSED_KEY = "serverSidebar.voiceCollapsed";

  const sortedRoles = $derived.by(() => {
    if (!server?.roles) return [];
    return [...server.roles].sort((a, b) => a.name.localeCompare(b.name));
  });

  const filteredRoles = $derived.by(() => {
    const term = roleSearchTerm.trim().toLowerCase();
    if (!term) return sortedRoles;
    return sortedRoles.filter((role) => role.name.toLowerCase().includes(term));
  });

  const sortedMembers = $derived.by(() => {
    if (!server?.members) return [];
    return [...server.members].sort((a, b) => a.name.localeCompare(b.name));
  });

  const filteredMembers = $derived.by(() => {
    const term = memberSearchTerm.trim().toLowerCase();
    if (!term) return sortedMembers;
    return sortedMembers.filter((member) =>
      member.name.toLowerCase().includes(term),
    );
  });

  function clearAccessSelections() {
    selectedRoleIds = new SvelteSet<string>();
    selectedMemberIds = new SvelteSet<string>();
    roleSearchTerm = "";
    memberSearchTerm = "";
  }

  function toggleRoleSelection(roleId: string | null | undefined) {
    if (!roleId) return;
    const trimmed = roleId.trim();
    if (!trimmed) return;
    const next = new SvelteSet(selectedRoleIds);
    if (next.has(trimmed)) {
      next.delete(trimmed);
    } else {
      next.add(trimmed);
    }
    selectedRoleIds = next;
  }

  function toggleMemberSelection(memberId: string | null | undefined) {
    if (!memberId) return;
    const trimmed = memberId.trim();
    if (!trimmed) return;
    const next = new SvelteSet(selectedMemberIds);
    if (next.has(trimmed)) {
      next.delete(trimmed);
    } else {
      next.add(trimmed);
    }
    selectedMemberIds = next;
  }

  function toUniqueIdList(ids: Iterable<string>): string[] {
    const seen = new Set<string>();
    for (const id of ids) {
      const trimmed = id.trim();
      if (trimmed.length > 0) {
        seen.add(trimmed);
      }
    }
    return Array.from(seen);
  }

  function ensureDefaultPrivateMembers() {
    if (!newChannelPrivate) {
      return;
    }
    const defaults = [server?.owner_id ?? null, $userStore.me?.id ?? null];
    const next = new SvelteSet(selectedMemberIds);
    let changed = false;
    for (const candidate of defaults) {
      if (!candidate) continue;
      const trimmed = candidate.trim();
      if (!trimmed) continue;
      if (!next.has(trimmed)) {
        next.add(trimmed);
        changed = true;
      }
    }
    if (changed) {
      selectedMemberIds = next;
    }
  }

  function persistCollapsedState(key: string, collapsed: boolean) {
    if (!browser) return;
    try {
      localStorage.setItem(key, collapsed.toString());
    } catch (error) {
      console.error("Failed to persist sidebar state", error);
    }
  }

  function isCategoryCollapsed(categoryId: string) {
    return collapsedCategoryIds.has(categoryId);
  }

  function setCategoryCollapsed(categoryId: string, collapsed: boolean) {
    const next = new SvelteSet(collapsedCategoryIds);
    if (collapsed) {
      next.add(categoryId);
    } else {
      next.delete(categoryId);
    }
    collapsedCategoryIds = next;
  }

  function collapseAllCategories() {
    const categories = server?.categories ?? [];
    collapsedCategoryIds = new SvelteSet(
      categories.map((category: ChannelCategory) => category.id),
    );
    textChannelsCollapsed = true;
    voiceChannelsCollapsed = true;
    persistCollapsedState(TEXT_COLLAPSED_KEY, true);
    persistCollapsedState(VOICE_COLLAPSED_KEY, true);
  }

  function getSortedCategories() {
    return [...(server?.categories ?? [])].sort(
      (a: ChannelCategory, b: ChannelCategory) => {
        if (a.position !== b.position) return a.position - b.position;
        return a.name.localeCompare(b.name);
      },
    );
  }

  function getVisibleChannels(
    categoryId: string | null,
    type: "text" | "voice",
  ) {
    return (server?.channels ?? []).filter((channel: Channel) => {
      const matchesType = channel.channel_type === type;
      const matchesCategory = (channel.category_id ?? null) === categoryId;
      const isVisible = !hideMutedChannels || !mutedChannelIds.has(channel.id);
      const hasAccess =
        !server?.id || !channel.private
          ? true
          : serverStore.canAccessChannel({
              serverId: server.id,
              channel,
            });
      return matchesType && matchesCategory && isVisible && hasAccess;
    });
  }

  function gotoResolved(path: string) {
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    gotoUnsafe(path);
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
      const vc = localStorage.getItem(VOICE_COLLAPSED_KEY);
      if (vc !== null) voiceChannelsCollapsed = vc === "true";
    } catch (e) {
      void e;
    }

    const unsubscribeMutedChannels = mutedChannelsStore.subscribe((ids) => {
      mutedChannelIds = new SvelteSet(ids);
    });

    return () => {
      window.removeEventListener("keydown", handleGlobalKeydown);
      window.removeEventListener("scroll", handleGlobalScroll, true);
      unsubscribeMutedChannels();
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

  $effect(() => {
    if (!showCreateChannelModal || !newChannelPrivate) {
      return;
    }
    ensureDefaultPrivateMembers();
  });

  $effect(() => {
    if (!server?.id) {
      if (collapsedCategoryIds.size > 0) {
        collapsedCategoryIds = new SvelteSet<string>();
        lastCollapsedServerId = null;
      }
      return;
    }

    if (lastCollapsedServerId !== server.id) {
      collapsedCategoryIds = new SvelteSet<string>();
      lastCollapsedServerId = server.id;
      return;
    }

    const validIds = new SvelteSet(
      (server.categories ?? []).map((category: ChannelCategory) => category.id),
    );

    if (collapsedCategoryIds.size === 0) {
      return;
    }

    let changed = false;
    const next = new SvelteSet<string>();
    for (const id of collapsedCategoryIds) {
      if (validIds.has(id)) {
        next.add(id);
      } else {
        changed = true;
      }
    }

    if (changed) {
      collapsedCategoryIds = new SvelteSet(next);
    }
  });

  onDestroy(() => {
    if (rafId) cancelAnimationFrame(rafId);
    unsubscribeChatMetadata();
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
    toasts.addToast(`${next ? "Hiding" : "Showing"} muted channels.`, "info");
  }

  function handleViewReviews() {
    if (!server?.id || !openProfileReviewsModal) {
      return;
    }
    closeAllContextMenus();
    openProfileReviewsModal({
      subjectType: "server",
      subjectId: server.id,
      subjectName: server.name,
      subjectAvatarUrl: server.iconUrl ?? null,
    });
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

  function handleCreateChannelClick(type: "text" | "voice" = "text") {
    newChannelType = type;
    newChannelName = "";
    newChannelPrivate = false;
    newChannelTopic = "";
    clearAccessSelections();
    showCreateChannelModal = true;
  }

  function handleCreateCategory() {
    showCreateCategoryModal = true;
  }

  function handleCreateEvent() {
    showServerEventModal = true;
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

    const normalizedTopic =
      newChannelType === "text" ? newChannelTopic.trim() : "";
    const topicValue =
      newChannelType === "text"
        ? normalizedTopic.length > 0
          ? normalizedTopic
          : null
        : null;

    const allowedRoleIds = newChannelPrivate
      ? toUniqueIdList(selectedRoleIds)
      : [];
    const aggregatedMemberIds = newChannelPrivate
      ? new Set<string>(toUniqueIdList(selectedMemberIds))
      : new Set<string>();

    if (newChannelPrivate) {
      const defaults = [server.owner_id ?? null, $userStore.me?.id ?? null];
      for (const candidate of defaults) {
        if (!candidate) continue;
        const trimmed = candidate.trim();
        if (trimmed.length > 0) {
          aggregatedMemberIds.add(trimmed);
        }
      }
    }

    const allowedUserIds = Array.from(aggregatedMemberIds);

    if (newChannelPrivate && allowedRoleIds.length === 0 && allowedUserIds.length === 0) {
      toasts.addToast(
        "Select at least one role or member for a private channel.",
        "error",
      );
      return;
    }

    const newChannel: Channel = {
      id: uuidv4(),
      server_id: server.id,
      name: slugifyChannelName(newChannelName),
      channel_type: newChannelType,
      private: newChannelPrivate,
      category_id: null,
      topic: topicValue,
      allowed_role_ids: newChannelPrivate ? allowedRoleIds : [],
      allowed_user_ids: newChannelPrivate ? allowedUserIds : [],
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
      newChannelTopic = "";
      clearAccessSelections();
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

      const result = await serverStore.updateServer(server.id, {
        channels: updated,
      });
      if (!result?.success) {
        toasts.addToast("Failed to update channel list.", "error");
        return;
      }
      if ($activeServerChannelId === channelId && nextChannelId) {
        const nextChannel = getChannelById(nextChannelId);
        if (nextChannel) {
          handleChannelSelect(nextChannel);
        }
      }
    } catch (error) {
      console.error("Failed to delete channel:", error);
      toasts.addToast("Failed to delete channel.", "error");
    }
  }

  async function deleteCategory(categoryId: string) {
    try {
      await invoke("delete_channel_category", {
        request: {
          server_id: server.id,
          category_id: categoryId,
        },
      });
      serverStore.removeCategoryFromServer(server.id, categoryId);
      toasts.addToast("Category deleted.", "success");
    } catch (error: any) {
      console.error("Failed to delete category:", error);
      const message =
        error?.message ?? "Failed to delete category. Please try again.";
      toasts.addToast(message, "error");
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
    showCategoryContextMenu = false;

    switch (action) {
      case "create_category":
        showCreateCategoryModal = true;
        break;
      case "collapse_category": {
        if (categoryId === "text-channels") {
          textChannelsCollapsed = true;
          persistCollapsedState(TEXT_COLLAPSED_KEY, true);
          break;
        }
        if (categoryId === "voice-channels") {
          voiceChannelsCollapsed = true;
          persistCollapsedState(VOICE_COLLAPSED_KEY, true);
          break;
        }
        setCategoryCollapsed(categoryId, true);
        break;
      }
      case "collapse_all":
        collapseAllCategories();
        break;
      case "delete_category": {
        const exists = Array.isArray(server.categories)
          ? server.categories.some((category) => category.id === categoryId)
          : false;
        if (!exists) {
          toasts.addToast("Select a custom category to delete.", "info");
          break;
        }
        void deleteCategory(categoryId);
        break;
      }
      case "copy_id": {
        if (categoryId === "text-channels" || categoryId === "voice-channels") {
          toasts.addToast("No category ID for default sections.", "info");
          break;
        }
        const clipboard =
          typeof navigator === "undefined" ? null : navigator.clipboard;
        if (!clipboard || typeof clipboard.writeText !== "function") {
          toasts.addToast("Clipboard unavailable.", "error");
          break;
        }
        clipboard
          .writeText(categoryId)
          .then(() => {
            toasts.addToast("Category ID copied.", "success");
          })
          .catch(() => {
            toasts.addToast("Failed to copy category ID.", "error");
          });
        break;
      }
      default:
        toasts.addToast(`Action: ${action} on category: ${categoryId}`, "info");
    }
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
          handleCreateChannelClick("text");
          break;
        }
        case "create_voice_channel": {
          handleCreateChannelClick("voice");
          break;
        }
        case "edit_channel": {
          const ch = getChannelById(channelId);
          if (!ch) break;
          const nameInput = prompt("Rename channel", ch.name);
          if (nameInput === null) break;

          const trimmedName = nameInput.trim();
          if (!trimmedName) {
            toasts.addToast("Channel name cannot be empty.", "error");
            break;
          }

          const topicInput = prompt(
            "Update channel topic (leave blank for none)",
            ch.topic ?? "",
          );

          const normalizedTopic =
            topicInput === null
              ? ch.topic ?? null
              : topicInput.trim().length > 0
                ? topicInput.trim()
                : null;

          const updatedName = slugifyChannelName(trimmedName);
          const nameChanged = updatedName !== ch.name;
          const topicChanged = normalizedTopic !== (ch.topic ?? null);

          if (!nameChanged && !topicChanged) {
            break;
          }

          const updatedChannels = (server.channels || []).map((c: Channel) =>
            c.id === ch.id
              ? { ...c, name: updatedName, topic: normalizedTopic }
              : c,
          );
          const result = await serverStore.updateServer(server.id, {
            channels: updatedChannels,
          });
          if (!result?.success) {
            toasts.addToast("Failed to update channel.", "error");
          } else {
            toasts.addToast("Channel updated.", "success");
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
            category_id: orig.category_id ?? null,
            topic: orig.topic ?? null,
            allowed_role_ids: orig.allowed_role_ids
              ? [...orig.allowed_role_ids]
              : [],
            allowed_user_ids: orig.allowed_user_ids
              ? [...orig.allowed_user_ids]
              : [],
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
          const channelToOpen = getChannelById(channelId);
          if (channelToOpen) {
            handleChannelSelect(channelToOpen);
          }
          break;
        }
        case "mark_as_read": {
          await chatStore.markChatRead(channelId, { serverId: server.id });
          toasts.addToast("Channel marked as read.", "success");
          break;
        }
        case "mute_channel": {
          if (mutedChannelsStore.isMuted(channelId)) {
            mutedChannelsStore.unmute(channelId);
            toasts.addToast("Channel unmuted.", "info");
          } else {
            mutedChannelsStore.mute(channelId);
            toasts.addToast("Channel muted.", "info");
          }
          break;
        }
        case "hide_names": {
          try {
            const next =
              await channelDisplayPreferencesStore.toggleHideMemberNames(
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
          await handleInviteToServerClick();
          showChannelContextMenu = false;
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
        handleCreateChannelClick();
        break;
      case "create_category":
        gotoServerSettings(server.id, "channels");
        toasts.addToast("Manage categories from the Channels tab.", "info");
        break;
      case "invite_people":
        void handleInviteToServerClick();
        break;
      case "view_reviews":
        handleViewReviews();
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

  function handleChannelSelect(channel: Channel): boolean {
    if (!server?.id) {
      return false;
    }
    const allowed = serverStore.canAccessChannel({
      serverId: server.id,
      channel,
    });
    if (!allowed) {
      toasts.addToast("You do not have access to this channel.", "error");
      return false;
    }
    onSelectChannel(server.id, channel.id);
    return true;
  }

  function handleVoiceChannelClick(channel: Channel) {
    const allowed = handleChannelSelect(channel);
    if (!allowed) {
      return;
    }
    void callStore.joinVoiceChannel({
      chatId: channel.id,
      chatName: channel.name,
    });
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
            class="w-[218px] *:cursor-pointer"
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
          {@const categories = getSortedCategories()}
          {#if categories.length > 0}
            {#each categories as category (category.id)}
              {@const collapsed = isCategoryCollapsed(category.id)}
              <Collapsible
                open={!collapsed}
                onOpenChange={(value) =>
                  setCategoryCollapsed(category.id, !value)}
              >
                <div class="flex justify-between items-center py-1 mt-4">
                  <CollapsibleTrigger
                    class="flex items-center group cursor-pointer"
                  >
                    <h3
                      class="text-sm font-semibold text-muted-foreground uppercase group-hover:text-foreground select-none"
                      class:text-foreground={showCategoryContextMenu &&
                        contextMenuCategoryId === category.id}
                      oncontextmenu={(e) =>
                        handleCategoryContextMenu(e, category.id)}
                    >
                      {category.name}
                    </h3>
                    <ChevronDown
                      size={10}
                      class={`ml-1 transition-transform duration-200 ${
                        collapsed ? "-rotate-90" : ""
                      }`}
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
                  {@const textChannels = getVisibleChannels(
                    category.id,
                    "text",
                  )}
                  {@const voiceChannels = getVisibleChannels(
                    category.id,
                    "voice",
                  )}
                  {#if textChannels.length === 0 && voiceChannels.length === 0}
                    <p class="text-xs text-muted-foreground px-2 py-1">
                      No channels in this category yet.
                    </p>
                  {/if}

                  {#each textChannels as channel (channel.id)}
                    {@const metadata = channelMetadataLookup.get(channel.id)}
                    {@const unreadCount = metadata?.unreadCount ?? 0}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            role="button"
                            tabindex="0"
                          class={`group w-full h-[34px] text-left py-2 px-2 flex items-center justify-between transition-colors cursor-pointer my-1 rounded-md ${
                            $activeServerChannelId === channel.id
                              ? "bg-primary/80 text-foreground"
                              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          }`}
                          onclick={() => handleChannelSelect(channel)}
                          onkeydown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              handleChannelSelect(channel);
                            }
                          }}
                            oncontextmenu={(e) =>
                              handleChannelContextMenu(e, channel)}
                            title={channel.topic ?? undefined}
                          >
                          <div class="flex items-center truncate">
                            <Hash size={10} class="mr-1" />
                            <span class="truncate select-none ml-2"
                              >{channel.name}</span
                            >
                            {#if channel.private}
                              <Badge
                                class="ml-2 flex items-center gap-1 border border-primary/20 bg-primary/10 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide text-primary"
                              >
                                <Lock size={10} />
                                Private
                              </Badge>
                            {/if}
                          </div>
                            <div class="ml-auto flex items-center gap-2">
                              {#if unreadCount > 0}
                                <Badge
                                  class="shrink-0 bg-primary/10 text-primary border border-primary/20 px-2 py-0 text-[11px]"
                                >
                                  {unreadCount > 99 ? "99+" : unreadCount}
                                </Badge>
                              {/if}
                              <div
                                class="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
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
                          </div>
                        </TooltipTrigger>
                        {#if channel.topic}
                          <TooltipContent
                            side="right"
                            align="start"
                            class="max-w-xs text-xs leading-snug"
                          >
                            {channel.topic}
                          </TooltipContent>
                        {/if}
                      </Tooltip>
                    </TooltipProvider>
                  {/each}

                  {#each voiceChannels as channel (channel.id)}
                    {@const activeCall = $callStore.activeCall}
                    {@const isActiveVoiceChannel =
                      activeCall &&
                      activeCall.chatType === "channel" &&
                      activeCall.type === "voice" &&
                      activeCall.status !== "ended" &&
                      activeCall.status !== "error" &&
                      activeCall.chatId === channel.id}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            role="button"
                            tabindex="0"
                            class={`group w-full h-[34px] text-left py-2 px-2 flex items-center justify-between transition-colors cursor-pointer my-1 rounded-md ${
                              isActiveVoiceChannel
                                ? "bg-primary/80 text-foreground shadow-sm"
                                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            }`}
                            data-active={isActiveVoiceChannel ? "true" : undefined}
                            onclick={() => handleVoiceChannelClick(channel)}
                            onkeydown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                handleVoiceChannelClick(channel);
                              }
                            }}
                            oncontextmenu={(e) =>
                              handleChannelContextMenu(e, channel)}
                            title={channel.topic ?? undefined}
                          >
                            <div class="flex items-center truncate">
                              <Mic size={12} class="mr-1" />
                              <span class="truncate select-none ml-2"
                                >{channel.name}</span
                              >
                              {#if channel.private}
                                <Badge
                                  class="ml-2 flex items-center gap-1 border border-primary/20 bg-primary/10 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide text-primary"
                                >
                                  <Lock size={10} />
                                  Private
                                </Badge>
                              {/if}
                            </div>
                            <div
                              class="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
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
                        </TooltipTrigger>
                        {#if channel.topic}
                          <TooltipContent
                            side="right"
                            align="start"
                            class="max-w-xs text-xs leading-snug"
                          >
                            {channel.topic}
                          </TooltipContent>
                        {/if}
                      </Tooltip>
                    </TooltipProvider>
                  {/each}
                </CollapsibleContent>
              </Collapsible>
            {/each}
          {/if}

          <Collapsible
            open={!textChannelsCollapsed}
            onOpenChange={(value) => {
              textChannelsCollapsed = !value;
              persistCollapsedState(TEXT_COLLAPSED_KEY, textChannelsCollapsed);
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
                    ? '-rotate-90'
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
                {#each server.channels.filter((c: Channel) => c.channel_type === "text" && (c.category_id ?? null) === null && (!hideMutedChannels || !mutedChannelIds.has(c.id))) as channel (channel.id)}
                  {@const metadata = channelMetadataLookup.get(channel.id)}
                  {@const unreadCount = metadata?.unreadCount ?? 0}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          role="button"
                          tabindex="0"
                          class={`group w-full h-[34px] text-left py-2 px-2 flex items-center justify-between transition-colors cursor-pointer my-1 rounded-md ${
                            $activeServerChannelId === channel.id
                              ? "bg-primary/80 text-foreground"
                              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          }`}
                          onclick={() => handleChannelSelect(channel)}
                          onkeydown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              handleChannelSelect(channel);
                            }
                          }}
                          oncontextmenu={(e) => handleChannelContextMenu(e, channel)}
                          title={channel.topic ?? undefined}
                        >
                          <div class="flex items-center truncate">
                            <Hash size={10} class="mr-1" />
                            <span class="truncate select-none ml-2"
                              >{channel.name}</span
                            >
                            {#if channel.private}
                              <Badge
                                class="ml-2 flex items-center gap-1 border border-primary/20 bg-primary/10 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide text-primary"
                              >
                                <Lock size={10} />
                                Private
                              </Badge>
                            {/if}
                          </div>
                          <div class="ml-auto flex items-center gap-2">
                            {#if unreadCount > 0}
                              <Badge
                                class="shrink-0 bg-primary/10 text-primary border border-primary/20 px-2 py-0 text-[11px]"
                              >
                                {unreadCount > 99 ? "99+" : unreadCount}
                              </Badge>
                            {/if}
                            <div
                              class="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
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
                        </div>
                      </TooltipTrigger>
                      {#if channel.topic}
                        <TooltipContent
                          side="right"
                          align="start"
                          class="max-w-xs text-xs leading-snug"
                        >
                          {channel.topic}
                        </TooltipContent>
                      {/if}
                    </Tooltip>
                  </TooltipProvider>
                {/each}
              {:else}
                <p class="text-xs text-muted-foreground px-2 py-1">
                  No text channels yet.
                </p>
              {/if}
            </CollapsibleContent>
          </Collapsible>

          <Collapsible
            open={!voiceChannelsCollapsed}
            onOpenChange={(value) => {
              voiceChannelsCollapsed = !value;
              persistCollapsedState(
                VOICE_COLLAPSED_KEY,
                voiceChannelsCollapsed,
              );
            }}
          >
            <div class="flex justify-between items-center py-1 mt-6">
              <CollapsibleTrigger
                class="flex items-center group cursor-pointer"
              >
                <h3
                  class="text-sm font-semibold text-muted-foreground uppercase group-hover:text-foreground select-none"
                  class:text-foreground={showCategoryContextMenu &&
                    contextMenuCategoryId === "voice-channels"}
                  oncontextmenu={(e) =>
                    handleCategoryContextMenu(e, "voice-channels")}
                >
                  Voice Channels
                </h3>
                <ChevronDown
                  size={10}
                  class="ml-1 transition-transform duration-200 {voiceChannelsCollapsed
                    ? '-rotate-90'
                    : ''}"
                />
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Create Voice Channel"
                onclick={() => handleCreateChannelClick("voice")}
              >
                <Plus size={12} />
              </Button>
            </div>

            <CollapsibleContent>
              {#if server && server.channels && server.channels.length > 0}
                {#each server.channels.filter((c: Channel) => c.channel_type === "voice" && (c.category_id ?? null) === null && (!hideMutedChannels || !mutedChannelIds.has(c.id))) as channel (channel.id)}
                  {@const activeCall = $callStore.activeCall}
                  {@const isActiveVoiceChannel =
                    activeCall &&
                    activeCall.chatType === "channel" &&
                    activeCall.type === "voice" &&
                    activeCall.status !== "ended" &&
                    activeCall.status !== "error" &&
                    activeCall.chatId === channel.id}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          role="button"
                          tabindex="0"
                          class="group w-full h-[34px] text-left py-2 px-2 flex items-center justify-between transition-colors cursor-pointer my-1 rounded-md {isActiveVoiceChannel
                            ? 'bg-primary/80 text-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}"
                          data-active={isActiveVoiceChannel ? "true" : undefined}
                          onclick={() => handleVoiceChannelClick(channel)}
                          onkeydown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              handleVoiceChannelClick(channel);
                            }
                          }}
                          oncontextmenu={(e) => handleChannelContextMenu(e, channel)}
                          title={channel.topic ?? undefined}
                        >
                          <div class="flex items-center truncate">
                            <Mic size={12} class="mr-1" />
                            <span class="truncate select-none ml-2"
                              >{channel.name}</span
                            >
                            {#if channel.private}
                              <Badge
                                class="ml-2 flex items-center gap-1 border border-primary/20 bg-primary/10 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide text-primary"
                              >
                                <Lock size={10} />
                                Private
                              </Badge>
                            {/if}
                          </div>
                          <div
                            class="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
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
                      </TooltipTrigger>
                      {#if channel.topic}
                        <TooltipContent
                          side="right"
                          align="start"
                          class="max-w-xs text-xs leading-snug"
                        >
                          {channel.topic}
                        </TooltipContent>
                      {/if}
                    </Tooltip>
                  </TooltipProvider>
                {/each}
              {:else}
                <p class="text-xs text-muted-foreground px-2 py-1">
                  No voice channels yet.
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
  />
{/if}

{#if showChannelContextMenu && selectedChannelForContextMenu}
  <ChannelContextMenu
    x={channelContextMenuX}
    y={channelContextMenuY}
    channel={selectedChannelForContextMenu}
    onaction={handleChannelAction}
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

      {#if newChannelPrivate}
        <div class="space-y-4 rounded-md border border-border/60 bg-muted/20 p-3">
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold uppercase text-muted-foreground">
                Allowed Roles
              </span>
              <span class="text-[11px] text-muted-foreground">
                Choose roles that can access this channel
              </span>
            </div>
            <Input
              type="text"
              placeholder="Search roles..."
              bind:value={roleSearchTerm}
              class="w-full"
            />
            <ScrollArea class="max-h-32 pr-1">
              {#if filteredRoles.length > 0}
                <div class="space-y-1">
                  {#each filteredRoles as role (role.id)}
                    <label
                      class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        class="h-3.5 w-3.5 rounded border-border bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        checked={selectedRoleIds.has(role.id)}
                        onchange={() => toggleRoleSelection(role.id)}
                      />
                      <span class="truncate">{role.name}</span>
                    </label>
                  {/each}
                </div>
              {:else}
                <p class="text-xs text-muted-foreground">
                  No roles match your search.
                </p>
              {/if}
            </ScrollArea>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold uppercase text-muted-foreground">
                Allowed Members
              </span>
              <span class="text-[11px] text-muted-foreground">
                You’re always included.
              </span>
            </div>
            <Input
              type="text"
              placeholder="Search members..."
              bind:value={memberSearchTerm}
              class="w-full"
            />
            <ScrollArea class="max-h-48 pr-1">
              {#if filteredMembers.length > 0}
                <div class="space-y-1">
                  {#each filteredMembers as member (member.id)}
                    <label
                      class="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        class="h-3.5 w-3.5 rounded border-border bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        checked={selectedMemberIds.has(member.id)}
                        onchange={() => toggleMemberSelection(member.id)}
                      />
                      <Avatar class="h-6 w-6">
                        <AvatarImage src={member.avatar} alt={member.name} />
                        <AvatarFallback class="text-xs font-medium">
                          {member.name?.[0] ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span class="truncate">{member.name}</span>
                    </label>
                  {/each}
                </div>
              {:else}
                <p class="text-xs text-muted-foreground">
                  No members match your search.
                </p>
              {/if}
            </ScrollArea>
          </div>
        </div>
      {/if}

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
            bind:value={newChannelTopic}
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

{#if showCreateCategoryModal}
  <CreateCategoryModal
    {server}
    onclose={() => {
      showCreateCategoryModal = false;
    }}
  />
{/if}

{#if showServerEventModal}
  <ServerEventModal
    {server}
    onclose={() => {
      showServerEventModal = false;
    }}
  />
{/if}
