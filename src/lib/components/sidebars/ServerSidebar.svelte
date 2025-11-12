<svelte:options runes={true} />

<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import ServerBackgroundContextMenu from "$lib/components/context-menus/ServerBackgroundContextMenu.svelte";
  import CategoryContextMenu from "$lib/components/context-menus/CategoryContextMenu.svelte";
  import ChannelContextMenu from "$lib/components/context-menus/ChannelContextMenu.svelte";
  import ServerHeaderDropdown from "$lib/components/dropdowns/ServerHeaderDropdown.svelte";
  import type { ServerHeaderDropdownAction } from "$lib/components/dropdowns/ServerHeaderDropdown.svelte";
  import CreateCategoryModal from "$lib/components/modals/CreateCategoryModal.svelte";
  import ServerEventModal from "$lib/components/modals/ServerEventModal.svelte";
  import {
    serverStore,
    voiceChannelPresence,
  } from "$lib/features/servers/stores/serverStore";
  import type { Role } from "$lib/features/servers/models/Role";
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
    Plus,
    Settings,
    ChevronDown,
    Hash,
    Check,
    Mic,
    Info,
    Lock,
  } from "@lucide/svelte";
  import type { Server } from "$lib/features/servers/models/Server";
  import { getContext, onDestroy, onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import { SvelteURLSearchParams } from "svelte/reactivity";
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
  import { mutedCategoriesStore } from "$lib/features/channels/stores/mutedCategoriesStore";
  import {
    categoryNotificationPreferencesStore,
    type CategoryNotificationLevel,
    DEFAULT_CATEGORY_NOTIFICATION_LEVEL,
  } from "$lib/features/channels/stores/categoryNotificationPreferencesStore";
  import { CREATE_GROUP_CONTEXT_KEY } from "$lib/contextKeys";
  import type { CreateGroupContext } from "$lib/contextTypes";
  import type { ChatMetadata } from "$lib/features/chat/stores/chatStore";
  import { userStore } from "$lib/stores/userStore";
  import {
    SLOWMODE_PRESETS,
    buildSlowmodeOptions,
    normalizeSlowmodeValue,
  } from "$lib/features/channels/utils/slowmode";
  import {
    CHANNEL_PERMISSION_KEYS,
    type ChannelPermissionOverrides,
    type ChannelPermissionOverrideEntry,
    type KnownChannelPermissionKey,
  } from "$lib/features/chat/utils/permissions";

  type NavigationFn = (..._args: [string | URL]) => void; // eslint-disable-line no-unused-vars
  type ChannelSelectHandler = (..._args: [string, string]) => void; // eslint-disable-line no-unused-vars

  const gotoUnsafe: NavigationFn = goto as unknown as NavigationFn;

  type DropIndicator = {
    categoryId: string | null;
    type: "text" | "voice";
    beforeChannelId: string | null;
  };

  let {
    server,
    onSelectChannel,
    refreshServerData,
  }: {
    server: Server;
    onSelectChannel: ChannelSelectHandler;
    refreshServerData?: () => Promise<void>;
  } = $props();

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
  let showRenameCategoryModal = $state(false);
  let categoryBeingRenamed = $state<ChannelCategory | null>(null);
  let renameCategoryName = $state("");
  let showCategoryNotificationsModal = $state(false);
  let notificationsCategoryId = $state<string | null>(null);
  let notificationsCategoryName = $state("");
  let pendingNotificationLevel = $state<CategoryNotificationLevel>(
    DEFAULT_CATEGORY_NOTIFICATION_LEVEL,
  );
  const CATEGORY_NOTIFICATION_OPTIONS: Array<{
    value: CategoryNotificationLevel;
    label: string;
    description: string;
  }> = [
    {
      value: "all_messages",
      label: "All Messages",
      description: "Get notified for every message in this category.",
    },
    {
      value: "mentions_only",
      label: "Mentions Only",
      description: "Only notify when you are mentioned or replied to.",
    },
    {
      value: "nothing",
      label: "Nothing",
      description: "Silence notifications while keeping the category visible.",
    },
  ];
  let newChannelName = $state("");
  let newChannelType = $state<"text" | "voice">("text");
  let newChannelPrivate = $state(false);
  let newChannelTopic = $state("");
  let newChannelCategoryId = $state<string | null>(null);
  let newChannelSlowmode = $state(0);
  let editingChannelId = $state<string | null>(null);
  let selectedRoleIds = $state(new SvelteSet<string>());
  let selectedMemberIds = $state(new SvelteSet<string>());
  let privateAccessSearchTerm = $state("");
  let roleSearchTerm = $state("");
  let memberSearchTerm = $state("");
  let showPrivateChannelAccessDialog = $state(false);

  type PermissionOverrideChoice = "inherit" | "allow" | "deny";
  type PermissionMatrixRow = Record<
    KnownChannelPermissionKey,
    PermissionOverrideChoice
  >;

  type PermissionMatrixState = {
    roles: Record<string, PermissionMatrixRow>;
    users: Record<string, PermissionMatrixRow>;
  };

  const channelPermissionKeys = CHANNEL_PERMISSION_KEYS;
  const permissionKeyLabels: Record<KnownChannelPermissionKey, string> =
    Object.fromEntries(
      channelPermissionKeys.map((key) => [
        key,
        key
          .split("_")
          .map((segment) =>
            segment.length > 0
              ? segment[0].toUpperCase() + segment.slice(1)
              : segment,
          )
          .join(" "),
      ]),
    ) as Record<KnownChannelPermissionKey, string>;

  const overrideChoiceLabels: Record<
    PermissionOverrideChoice,
    { label: string; description: string }
  > = {
    inherit: {
      label: "Inherit",
      description: "Use default permissions.",
    },
    allow: {
      label: "Allow",
      description: "Explicitly allow this action.",
    },
    deny: {
      label: "Deny",
      description: "Explicitly deny this action.",
    },
  };

  const overrideChoices: PermissionOverrideChoice[] = [
    "inherit",
    "allow",
    "deny",
  ];

  function createEmptyPermissionMatrixRow(): PermissionMatrixRow {
    const row = {} as PermissionMatrixRow;
    for (const key of channelPermissionKeys) {
      row[key] = "inherit";
    }
    return row;
  }

  function createEmptyPermissionOverridesState(): PermissionMatrixState {
    return {
      roles: {},
      users: {},
    };
  }

  function rowHasOverrides(row: PermissionMatrixRow): boolean {
    for (const key of channelPermissionKeys) {
      if (row[key] !== "inherit") {
        return true;
      }
    }
    return false;
  }

  function createPermissionMatrixRowFromEntry(
    entry?: ChannelPermissionOverrideEntry | null,
  ): PermissionMatrixRow {
    const row = createEmptyPermissionMatrixRow();
    if (!entry) {
      return row;
    }

    const apply = (
      matrix: ChannelPermissionOverrideEntry["allow"],
      choice: PermissionOverrideChoice,
    ) => {
      if (!matrix) {
        return;
      }
      for (const key of channelPermissionKeys) {
        if (matrix[key]) {
          row[key] = choice;
        }
      }
    };

    apply(entry.deny ?? null, "deny");
    apply(entry.allow ?? null, "allow");

    return row;
  }

  let permissionOverrides = $state<PermissionMatrixState>(
    createEmptyPermissionOverridesState(),
  );
  let pendingRoleOverrideSelection = $state("");
  let pendingMemberOverrideSelection = $state("");

  function resetPermissionOverrides() {
    permissionOverrides = createEmptyPermissionOverridesState();
    pendingRoleOverrideSelection = "";
    pendingMemberOverrideSelection = "";
  }

  function addPermissionOverrideTarget(
    target: keyof PermissionMatrixState,
    id: string | null | undefined,
  ) {
    if (!id) return;
    const trimmed = id.trim();
    if (!trimmed || permissionOverrides[target][trimmed]) {
      return;
    }
    const row = createEmptyPermissionMatrixRow();
    permissionOverrides = {
      ...permissionOverrides,
      [target]: {
        ...permissionOverrides[target],
        [trimmed]: row,
      },
    };
  }

  function removeOverrideTarget(
    target: keyof PermissionMatrixState,
    id: string,
  ) {
    const trimmed = id.trim();
    if (!trimmed || !permissionOverrides[target][trimmed]) {
      return;
    }
    const nextTarget = { ...permissionOverrides[target] };
    delete nextTarget[trimmed];
    permissionOverrides = {
      ...permissionOverrides,
      [target]: nextTarget,
    };
  }

  function setOverrideChoice(
    target: keyof PermissionMatrixState,
    id: string,
    permission: KnownChannelPermissionKey,
    choice: PermissionOverrideChoice,
  ) {
    const trimmed = id.trim();
    if (!trimmed) {
      return;
    }

    const existing = permissionOverrides[target][trimmed];
    const updatedRow: PermissionMatrixRow = {
      ...(existing ?? createEmptyPermissionMatrixRow()),
      [permission]: choice,
    };

    if (!rowHasOverrides(updatedRow)) {
      removeOverrideTarget(target, trimmed);
      return;
    }

    permissionOverrides = {
      ...permissionOverrides,
      [target]: {
        ...permissionOverrides[target],
        [trimmed]: updatedRow,
      },
    };
  }

  function getOverrideChoice(
    target: keyof PermissionMatrixState,
    id: string,
    permission: KnownChannelPermissionKey,
  ): PermissionOverrideChoice {
    return (
      permissionOverrides[target][id]?.[permission] ?? ("inherit" as const)
    );
  }

  function loadPermissionOverridesFromChannel(
    overrides: ChannelPermissionOverrides | null | undefined,
  ) {
    const next = createEmptyPermissionOverridesState();
    const applyEntries = (
      target: keyof PermissionMatrixState,
      entries?: Record<string, ChannelPermissionOverrideEntry | null | undefined>,
    ) => {
      if (!entries) {
        return;
      }
      for (const [rawId, entry] of Object.entries(entries)) {
        const trimmed = rawId.trim();
        if (!trimmed) {
          continue;
        }
        const row = createPermissionMatrixRowFromEntry(entry);
        if (!rowHasOverrides(row)) {
          continue;
        }
        next[target][trimmed] = row;
      }
    };

    applyEntries("roles", overrides?.roles ?? undefined);
    applyEntries("users", overrides?.users ?? undefined);

    permissionOverrides = next;
    pendingRoleOverrideSelection = "";
    pendingMemberOverrideSelection = "";
  }

  function serializePermissionOverridesState(
    state: PermissionMatrixState,
  ): ChannelPermissionOverrides | undefined {
    const serialize = (
      entries: Record<string, PermissionMatrixRow>,
    ): Record<string, ChannelPermissionOverrideEntry> => {
      const result: Record<string, ChannelPermissionOverrideEntry> = {};
      for (const [id, row] of Object.entries(entries)) {
        if (!rowHasOverrides(row)) {
          continue;
        }
        const allow: Partial<Record<KnownChannelPermissionKey, boolean>> = {};
        const deny: Partial<Record<KnownChannelPermissionKey, boolean>> = {};
        for (const key of channelPermissionKeys) {
          if (row[key] === "allow") {
            allow[key] = true;
          } else if (row[key] === "deny") {
            deny[key] = true;
          }
        }
        const entry: ChannelPermissionOverrideEntry = {};
        if (Object.keys(allow).length > 0) {
          entry.allow = allow;
        }
        if (Object.keys(deny).length > 0) {
          entry.deny = deny;
        }
        if (entry.allow || entry.deny) {
          result[id] = entry;
        }
      }
      return result;
    };

    const roles = serialize(state.roles);
    const users = serialize(state.users);

    const hasRoles = Object.keys(roles).length > 0;
    const hasUsers = Object.keys(users).length > 0;
    if (!hasRoles && !hasUsers) {
      return undefined;
    }

    const overrides: ChannelPermissionOverrides = {};
    if (hasRoles) {
      overrides.roles = roles;
    }
    if (hasUsers) {
      overrides.users = users;
    }
    return overrides;
  }

  function clonePermissionOverrides(
    overrides: ChannelPermissionOverrides | null | undefined,
  ): ChannelPermissionOverrides | undefined {
    if (!overrides) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(overrides)) as ChannelPermissionOverrides;
  }

  const slowmodeOptions = $derived(() =>
    buildSlowmodeOptions([...SLOWMODE_PRESETS, newChannelSlowmode]),
  );

  let showCategoryContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let contextMenuCategoryId = $state("");

  let showChannelContextMenu = $state(false);
  let channelContextMenuX = $state(0);
  let channelContextMenuY = $state(0);
  let selectedChannelForContextMenu = $state<Channel | null>(null);
  let draggingChannelId = $state<string | null>(null);
  let dropIndicator = $state<DropIndicator | null>(null);
  let dragPreviewElement: HTMLElement | null = null;

  let textChannelsCollapsed = false;
  let voiceChannelsCollapsed = false;

  let collapsedCategoryIds = new SvelteSet<string>();
  let lastCollapsedServerId = $state<string | null>(null);
  let hideMutedChannels = $state(false);
  let mutedChannelIds = new SvelteSet<string>();
  let mutedCategoryIds = new SvelteSet<string>();
  let lastLoadedPreferencesKey = $state<string | null>(null);

  let isResizing = $state(false);
  let rafId: number | null = $state(null);
  let initialX = $state(0);
  let initialWidth = $state(0);
  const initialSidebarWidth = browser
    ? parseInt(localStorage.getItem("serverSidebarWidth") ?? "240", 10)
    : 240;
  let sidebarWidth = $state(initialSidebarWidth);

  const sortedRoles = $derived.by(() => {
    if (!server?.roles) return [];
    return [...server.roles].sort((a, b) => a.name.localeCompare(b.name));
  });

  const rolesById = $derived.by(() => {
    const map = new Map<string, Role>();
    for (const role of server?.roles ?? []) {
      if (role?.id) {
        map.set(role.id, role);
      }
    }
    return map;
  });

  const filteredRoles = $derived.by(() => {
    const term = privateAccessSearchTerm.trim().toLowerCase();
    if (!term) return sortedRoles;
    return sortedRoles.filter((role) => role.name.toLowerCase().includes(term));
  });

  const membersById = $derived.by(() => {
    const map = new Map<string, Server["members"][number]>();
    if (!server?.members) {
      return map;
    }
    for (const member of server.members) {
      if (member?.id) {
        map.set(member.id, member);
      }
    }
    return map;
  });

  const sortedMembers = $derived.by(() => {
    if (!server?.members) return [];
    return [...server.members].sort((a, b) => a.name.localeCompare(b.name));
  });

  const filteredMembers = $derived.by(() => {
    const term = privateAccessSearchTerm.trim().toLowerCase();
    if (!term) return sortedMembers;
    return sortedMembers.filter((member) =>
      member.name.toLowerCase().includes(term),
    );
  });

  const availableRoleOverrideOptions = $derived.by(() =>
    sortedRoles.filter((role) => !permissionOverrides.roles[role.id]),
  );

  const availableMemberOverrideOptions = $derived.by(() =>
    sortedMembers.filter((member) => !permissionOverrides.users[member.id]),
  );

  function clearAccessSelections() {
    selectedRoleIds = new SvelteSet<string>();
    selectedMemberIds = new SvelteSet<string>();
    privateAccessSearchTerm = "";
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

  function openPrivateChannelAccessDialog() {
    ensureDefaultPrivateMembers();
    privateAccessSearchTerm = "";
    showPrivateChannelAccessDialog = true;
  }

  function closePrivateChannelAccessDialog() {
    showPrivateChannelAccessDialog = false;
    privateAccessSearchTerm = "";
  }

  function commitPrivateSearchSelection() {
    const term = privateAccessSearchTerm.trim();
    if (!term) {
      return;
    }

    if (term.startsWith("@")) {
      const query = term.slice(1).trim().toLowerCase();
      if (!query) {
        return;
      }
      const match = sortedMembers.find((member) =>
        member.name.toLowerCase().includes(query),
      );
      if (match) {
        toggleMemberSelection(match.id);
        privateAccessSearchTerm = "";
      }
      return;
    }

    const normalized = term.toLowerCase();
    const roleMatch = sortedRoles.find((role) =>
      role.name.toLowerCase().includes(normalized),
    );
    if (roleMatch) {
      toggleRoleSelection(roleMatch.id);
      privateAccessSearchTerm = "";
    }
  }

  function handlePrivateAccessSearchKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    commitPrivateSearchSelection();
  }

  $effect(() => {
    if (!newChannelPrivate && showPrivateChannelAccessDialog) {
      closePrivateChannelAccessDialog();
    }
  });

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
  }

  function getCategoryKey(categoryId: string | null) {
    return categoryId ?? "";
  }

  function isCategoryMuted(categoryId: string | null) {
    if (!categoryId) {
      return false;
    }
    return mutedCategoryIds.has(categoryId);
  }

  function getCategoryDisplayName(categoryId: string) {
    const category = server?.categories?.find(
      (entry: ChannelCategory) => entry.id === categoryId,
    );
    return category?.name ?? "Category";
  }

  function closeRenameCategoryModal() {
    showRenameCategoryModal = false;
    categoryBeingRenamed = null;
    renameCategoryName = "";
  }

  function openRenameCategoryModal(category: ChannelCategory) {
    categoryBeingRenamed = category;
    renameCategoryName = category.name;
    showRenameCategoryModal = true;
  }

  async function submitRenameCategory() {
    if (!categoryBeingRenamed) {
      closeRenameCategoryModal();
      return;
    }
    const trimmed = renameCategoryName.trim();
    if (!trimmed) {
      toasts.addToast("Enter a category name.", "error");
      return;
    }
    const categories = server?.categories ?? [];
    const exists = categories.some(
      (entry: ChannelCategory) => entry.id === categoryBeingRenamed?.id,
    );
    if (!exists) {
      toasts.addToast("Category not found.", "error");
      closeRenameCategoryModal();
      return;
    }
    const updatedCategories = categories.map((entry: ChannelCategory) =>
      entry.id === categoryBeingRenamed?.id ? { ...entry, name: trimmed } : entry,
    );
    try {
      const result = await serverStore.updateServer(server.id, {
        categories: updatedCategories,
      });
      if (!result?.success) {
        toasts.addToast(
          result?.error ?? "Failed to rename category.",
          "error",
        );
        return;
      }
      toasts.addToast("Category renamed.", "success");
      closeRenameCategoryModal();
      triggerServerRefresh();
    } catch (error) {
      console.error("Failed to rename category:", error);
      toasts.addToast("Failed to rename category.", "error");
    }
  }

  function closeCategoryNotificationsModal() {
    showCategoryNotificationsModal = false;
    notificationsCategoryId = null;
    notificationsCategoryName = "";
    pendingNotificationLevel = DEFAULT_CATEGORY_NOTIFICATION_LEVEL;
  }

  function openCategoryNotificationsModal(categoryId: string, label: string) {
    notificationsCategoryId = categoryId;
    notificationsCategoryName = label;
    pendingNotificationLevel =
      categoryNotificationPreferencesStore.getPreference(categoryId);
    showCategoryNotificationsModal = true;
  }

  function saveCategoryNotificationSettings() {
    if (!notificationsCategoryId) {
      closeCategoryNotificationsModal();
      return;
    }
    categoryNotificationPreferencesStore.setPreference(
      notificationsCategoryId,
      pendingNotificationLevel,
    );
    toasts.addToast("Notification preferences updated.", "success");
    closeCategoryNotificationsModal();
  }

  function getSortedCategories() {
    return [...(server?.categories ?? [])].sort(
      (a: ChannelCategory, b: ChannelCategory) => {
        if (a.position !== b.position) return a.position - b.position;
        return a.name.localeCompare(b.name);
      },
    );
  }

  function normalizeCategoryId(categoryId?: string | null) {
    return categoryId ?? null;
  }

  function sortChannelsByPosition(channels: Channel[]) {
    return [...channels].sort((a, b) => {
      const positionA = Number.isFinite(a.position) ? a.position : 0;
      const positionB = Number.isFinite(b.position) ? b.position : 0;
      if (positionA !== positionB) {
        return positionA - positionB;
      }
      return a.name.localeCompare(b.name);
    });
  }

  function getChannelsForCategory(
    categoryId: string | null,
    type: "text" | "voice",
  ) {
    const normalizedCategoryId = normalizeCategoryId(categoryId);
    return (server?.channels ?? []).filter((channel: Channel) => {
      return (
        channel.channel_type === type &&
        normalizeCategoryId(channel.category_id) === normalizedCategoryId
      );
    });
  }

  function getVisibleChannels(
    categoryId: string | null,
    type: "text" | "voice",
  ) {
    const normalizedCategoryId = normalizeCategoryId(categoryId);
    const base = getChannelsForCategory(normalizedCategoryId, type);
    if (hideMutedChannels && isCategoryMuted(normalizedCategoryId)) {
      return [];
    }
    const filtered = base.filter((channel) => {
      const isVisible = !hideMutedChannels || !mutedChannelIds.has(channel.id);
      const hasAccess =
        !server?.id || !channel.private
          ? true
          : serverStore.canAccessChannel({
              serverId: server.id,
              channel,
            });
      return isVisible && hasAccess;
    });
    return sortChannelsByPosition(filtered);
  }

  function getNextChannelPosition(
    categoryId: string | null,
    type: "text" | "voice",
  ) {
    const channelsInGroup = getChannelsForCategory(categoryId, type);
    if (channelsInGroup.length === 0) {
      return 0;
    }
    return (
      Math.max(
        ...channelsInGroup.map((channel) =>
          Number.isFinite(channel.position) ? channel.position : 0,
        ),
      ) + 1
    );
  }

  function buildGroupList(
    channels: Channel[],
    categoryId: string | null,
    type: "text" | "voice",
    excludeId?: string | null,
  ) {
    const normalizedCategoryId = normalizeCategoryId(categoryId);
    return sortChannelsByPosition(
      channels.filter((channel) => {
        if (excludeId && channel.id === excludeId) {
          return false;
        }
        return (
          channel.channel_type === type &&
          normalizeCategoryId(channel.category_id) === normalizedCategoryId
        );
      }),
    );
  }

  function applyChannelMove({
    channelId,
    targetCategoryId,
    targetType,
    beforeChannelId,
  }: {
    channelId: string;
    targetCategoryId: string | null;
    targetType: "text" | "voice";
    beforeChannelId?: string | null;
  }): Channel[] | null {
    if (!server?.channels) {
      return null;
    }

    const normalizedTargetCategoryId = normalizeCategoryId(targetCategoryId);
    const channels = server.channels.map((channel) => ({ ...channel }));
    const channelIndex = channels.findIndex((channel) => channel.id === channelId);
    if (channelIndex === -1) {
      return null;
    }

    const channel = channels[channelIndex];
    if (channel.channel_type !== targetType) {
      return null;
    }

    const originalCategoryId = normalizeCategoryId(channel.category_id);
    const sameCategory = originalCategoryId === normalizedTargetCategoryId;
    const sanitizedBeforeId =
      beforeChannelId && beforeChannelId === channelId ? null : beforeChannelId;

    channels[channelIndex].category_id = normalizedTargetCategoryId;

    const targetGroup = buildGroupList(
      channels,
      normalizedTargetCategoryId,
      targetType,
      channelId,
    );

    let insertIndex = targetGroup.length;
    if (sanitizedBeforeId) {
      const beforeIndex = targetGroup.findIndex(
        (entry) => entry.id === sanitizedBeforeId,
      );
      if (beforeIndex !== -1) {
        insertIndex = beforeIndex;
      }
    }

    targetGroup.splice(insertIndex, 0, channels[channelIndex]);
    targetGroup.forEach((entry, index) => {
      entry.position = index;
    });

    if (!sameCategory) {
      const originalGroup = buildGroupList(
        channels,
        originalCategoryId,
        targetType,
        channelId,
      );
      originalGroup.forEach((entry, index) => {
        entry.position = index;
      });
    }

    const originalChannels = server.channels ?? [];
    const changed = channels.some((entry) => {
      const existing = originalChannels.find((c) => c.id === entry.id);
      if (!existing) {
        return true;
      }
      return (
        existing.category_id !== entry.category_id ||
        existing.position !== entry.position
      );
    });

    if (!changed) {
      return null;
    }

    return channels;
  }

  function handleChannelDragStart(event: DragEvent, channel: Channel) {
    if (!event.dataTransfer) {
      return;
    }
    draggingChannelId = channel.id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-channel-id", channel.id);
    event.dataTransfer.setData("text/plain", channel.id);

    const trigger = event.currentTarget as HTMLElement | null;
    if (trigger) {
      dragPreviewElement = createDragPreview(trigger);
      const rect = trigger.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      event.dataTransfer.setDragImage(
        dragPreviewElement,
        offsetX,
        offsetY,
      );
    }
    setDraggingCursor(true);
  }

  function handleChannelDragEnd() {
    draggingChannelId = null;
    dropIndicator = null;
    removeDragPreview();
    setDraggingCursor(false);
  }

  function handleChannelDragOver(
    event: DragEvent,
    targetCategoryId: string | null,
    targetType: "text" | "voice",
    beforeChannelId: string | null = null,
  ) {
    if (!draggingChannelId) {
      return;
    }
    const channel = getChannelById(draggingChannelId);
    if (!channel || channel.channel_type !== targetType) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    dropIndicator = {
      categoryId: targetCategoryId,
      type: targetType,
      beforeChannelId,
    };
  }

  async function handleChannelDrop(
    event: DragEvent,
    targetCategoryId: string | null,
    targetType: "text" | "voice",
    beforeChannelId: string | null = null,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const channelId =
      draggingChannelId ??
      event.dataTransfer?.getData("application/x-channel-id") ??
      event.dataTransfer?.getData("text/plain");
    draggingChannelId = null;
    dropIndicator = null;
    setDraggingCursor(false);
    if (!channelId) {
      return;
    }
    const updatedChannels = applyChannelMove({
      channelId,
      targetCategoryId,
      targetType,
      beforeChannelId,
    });
    if (!updatedChannels) {
      return;
    }
    const result = await serverStore.updateServer(server.id, {
      channels: updatedChannels,
    });
    if (!result?.success) {
      toasts.addToast("Failed to update channel order.", "error");
      return;
    }
    triggerServerRefresh();
    removeDragPreview();
    setDraggingCursor(false);
  }

  function shouldShowDropIndicator(
    categoryId: string | null,
    type: "text" | "voice",
    beforeChannelId: string | null,
  ) {
    return (
      dropIndicator?.categoryId === categoryId &&
      dropIndicator?.type === type &&
      dropIndicator?.beforeChannelId === beforeChannelId
    );
  }

  function removeDragPreview() {
    if (!dragPreviewElement) {
      return;
    }
    dragPreviewElement.remove();
    dragPreviewElement = null;
  }

  function createDragPreview(element: HTMLElement) {
    const preview = element.cloneNode(true) as HTMLElement;
    preview.style.position = "fixed";
    preview.style.top = "-9999px";
    preview.style.left = "-9999px";
    preview.style.opacity = "0.95";
    preview.style.pointerEvents = "none";
    preview.style.transform = "translateZ(0)";
    document.body.appendChild(preview);
    return preview;
  }

  function setDraggingCursor(active: boolean) {
    if (!browser) {
      return;
    }
    document.body.classList.toggle("dragging-channel", active);
  }

  function shouldShowDropIndicatorAtEnd(
    categoryId: string | null,
    type: "text" | "voice",
  ) {
    return (
      dropIndicator?.categoryId === categoryId &&
      dropIndicator?.type === type &&
      dropIndicator?.beforeChannelId === null
    );
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

  function generateUniqueId() {
    if (
      typeof globalThis.crypto !== "undefined" &&
      typeof globalThis.crypto.randomUUID === "function"
    ) {
      return globalThis.crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
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
      const hm = localStorage.getItem("serverSidebar.hideMuted");
      if (hm !== null) hideMutedChannels = hm === "true";
    } catch (e) {
      void e;
    }

    const unsubscribeMutedChannels = mutedChannelsStore.subscribe((ids) => {
      mutedChannelIds = new SvelteSet(ids);
    });

    const unsubscribeMutedCategories = mutedCategoriesStore.subscribe((ids) => {
      mutedCategoryIds = new SvelteSet(ids);
    });

    return () => {
      window.removeEventListener("keydown", handleGlobalKeydown);
      window.removeEventListener("scroll", handleGlobalScroll, true);
      unsubscribeMutedChannels();
      unsubscribeMutedCategories();
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
    if (newChannelType === "voice") {
      newChannelSlowmode = 0;
    }
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

  $effect(() => {
    const validIds = new SvelteSet<string>(
      (server?.categories ?? []).map((category: ChannelCategory) => category.id),
    );

    if (mutedCategoryIds.size === 0) {
      return;
    }

    let changed = false;
    const next = new SvelteSet<string>();
    for (const id of mutedCategoryIds) {
      if (validIds.has(id)) {
        next.add(id);
      } else {
        changed = true;
      }
    }

    if (changed) {
      mutedCategoryIds = new SvelteSet(next);
      mutedCategoriesStore.setMuted(next);
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

  function handleServerHeaderDropdownAction(
    event: CustomEvent<ServerHeaderDropdownAction>,
  ) {
    const action = event.detail;
    switch (action) {
      case "invite_to_server":
        void handleInviteToServerClick();
        break;
      case "server_settings":
        handleServerSettingsClick();
        break;
      case "create_channel":
        handleCreateChannelClick();
        break;
      case "create_category":
        handleCreateCategory();
        break;
      case "create_event":
        handleCreateEvent();
        break;
      case "notification_settings":
        handleNotificationSettings();
        break;
      case "privacy_settings":
        handlePrivacySettings();
        break;
      case "edit_profile":
        handleEditProfile();
        break;
      case "hide_muted_channels":
        handleHideMutedChannels();
        break;
      case "leave_server":
        handleLeaveServer();
        break;
      case "view_reviews":
        handleViewReviews();
        break;
    }
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

  function handleCreateChannelClick(
    type: "text" | "voice" = "text",
    categoryId: string | null = null,
  ) {
    editingChannelId = null;
    newChannelType = type;
    newChannelName = "";
    newChannelPrivate = false;
    newChannelTopic = "";
    newChannelCategoryId = normalizeCategoryId(categoryId);
    newChannelSlowmode = 0;
    clearAccessSelections();
    resetPermissionOverrides();
    showCreateChannelModal = true;
  }

  function handleEditChannel(channelId: string) {
    const channel = getChannelById(channelId);
    if (!channel) {
      return;
    }

    editingChannelId = channel.id;
    newChannelType = channel.channel_type;
    newChannelName = channel.name;
    newChannelPrivate = channel.private;
    newChannelTopic = channel.topic ?? "";
    newChannelCategoryId = normalizeCategoryId(channel.category_id ?? null);
    newChannelSlowmode =
      channel.channel_type === "text"
        ? normalizeSlowmodeValue(channel.rate_limit_per_user ?? 0)
        : 0;
    selectedRoleIds = new SvelteSet(channel.allowed_role_ids ?? []);
    selectedMemberIds = new SvelteSet(channel.allowed_user_ids ?? []);
    roleSearchTerm = "";
    memberSearchTerm = "";
    loadPermissionOverridesFromChannel(channel.permission_overrides ?? null);
    showCreateChannelModal = true;
  }

  function closeChannelModal() {
    showCreateChannelModal = false;
    newChannelName = "";
    newChannelType = "text";
    newChannelPrivate = false;
    newChannelTopic = "";
    newChannelCategoryId = null;
    newChannelSlowmode = 0;
    editingChannelId = null;
    clearAccessSelections();
    showPrivateChannelAccessDialog = false;
    resetPermissionOverrides();
  }

  function handleCreateCategory() {
    showCreateCategoryModal = true;
  }

  function handleCreateEvent() {
    showServerEventModal = true;
  }

  function triggerServerRefresh() {
    if (!refreshServerData) {
      return;
    }
    void refreshServerData().catch((error) => {
      console.error("Failed to refresh server data:", error);
    });
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

  async function submitChannelForm() {
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

    const normalizedCategoryId = normalizeCategoryId(newChannelCategoryId);
    const slowmodeSeconds =
      newChannelType === "text" ? normalizeSlowmodeValue(newChannelSlowmode) : 0;
    const permissionOverridesPayload =
      serializePermissionOverridesState(permissionOverrides);

    if (editingChannelId) {
      const existing = getChannelById(editingChannelId);
      if (!existing) {
        toasts.addToast("Channel not found.", "error");
        return;
      }

      const updatedChannel: Channel = {
        ...existing,
        name: slugifyChannelName(newChannelName),
        channel_type: newChannelType,
        private: newChannelPrivate,
        category_id: normalizedCategoryId,
        topic: topicValue,
        allowed_role_ids: newChannelPrivate ? allowedRoleIds : [],
        allowed_user_ids: newChannelPrivate ? allowedUserIds : [],
        rate_limit_per_user: newChannelType === "text" ? slowmodeSeconds : 0,
        permission_overrides: permissionOverridesPayload ?? undefined,
      };

      if (!permissionOverridesPayload) {
        delete (
          updatedChannel as unknown as Record<string, unknown>
        ).permission_overrides;
      }

      try {
        const updatedChannels = (server.channels || []).map((c: Channel) =>
          c.id === existing.id ? updatedChannel : c,
        );
        const result = await serverStore.updateServer(server.id, {
          channels: updatedChannels,
        });
        if (!result?.success) {
          toasts.addToast("Failed to update channel.", "error");
          return;
        }
        toasts.addToast("Channel updated.", "success");
        closeChannelModal();
        triggerServerRefresh();
      } catch (error) {
        console.error("Failed to update channel:", error);
        toasts.addToast("Failed to update channel.", "error");
      }
      return;
    }

    const newChannelPosition = getNextChannelPosition(
      normalizedCategoryId,
      newChannelType,
    );

    const newChannel: Channel = {
      id: generateUniqueId(),
      server_id: server.id,
      name: slugifyChannelName(newChannelName),
      channel_type: newChannelType,
      private: newChannelPrivate,
      position: newChannelPosition,
      category_id: normalizedCategoryId,
      topic: topicValue,
      allowed_role_ids: newChannelPrivate ? allowedRoleIds : [],
      allowed_user_ids: newChannelPrivate ? allowedUserIds : [],
      rate_limit_per_user: slowmodeSeconds,
      ...(permissionOverridesPayload
        ? { permission_overrides: permissionOverridesPayload }
        : {}),
    };

    try {
      await invoke("create_channel", { channel: newChannel });
      serverStore.addChannelToServer(server.id, newChannel);
      toasts.addToast("Channel created.", "success");
      if (newChannel.channel_type === "text") {
        onSelectChannel(server.id, newChannel.id);
      }
      closeChannelModal();
      triggerServerRefresh();
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
      triggerServerRefresh();
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
      triggerServerRefresh();
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
      case "create_channel":
        handleCreateChannelClick("text", categoryId);
        break;
      case "create_category":
        showCreateCategoryModal = true;
        break;
      case "collapse_category":
        setCategoryCollapsed(categoryId, true);
        break;
      case "collapse_all":
        collapseAllCategories();
        break;
      case "mute_category": {
        const key = getCategoryKey(categoryId);
        if (mutedCategoriesStore.isMuted(key)) {
          mutedCategoriesStore.unmute(key);
          toasts.addToast("Category unmuted.", "info");
        } else {
          mutedCategoriesStore.mute(key);
          toasts.addToast("Category muted.", "info");
        }
        break;
      }
      case "notification_settings": {
        const key = getCategoryKey(categoryId);
        const label = getCategoryDisplayName(categoryId);
        openCategoryNotificationsModal(key, label);
        break;
      }
      case "edit_category": {
        const category = server?.categories?.find(
          (entry: ChannelCategory) => entry.id === categoryId,
        );
        if (!category) {
          toasts.addToast("Select a custom category to edit.", "info");
          break;
        }
        openRenameCategoryModal(category);
        break;
      }
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
    return server.channels?.find((c: Channel) => c.id === id);
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
          const sourceChannel = getChannelById(channelId);
          handleCreateChannelClick(
            "text",
            sourceChannel?.category_id ?? null,
          );
          break;
        }
        case "create_voice_channel": {
          const sourceChannel = getChannelById(channelId);
          handleCreateChannelClick(
            "voice",
            sourceChannel?.category_id ?? null,
          );
          break;
        }
        case "edit_channel": {
          handleEditChannel(channelId);
          break;
        }
        case "duplicate_channel": {
          const orig = getChannelById(channelId);
          if (!orig) break;
          const duplicatePosition = getNextChannelPosition(
            orig.category_id ?? null,
            orig.channel_type,
          );
          const duplicateOverrides = clonePermissionOverrides(
            orig.permission_overrides ?? undefined,
          );
          const dup: Channel = {
            id: generateUniqueId(),
            server_id: server.id,
            name: `${orig.name}-copy`,
            channel_type: orig.channel_type,
            private: orig.private,
            position: duplicatePosition,
            category_id: orig.category_id ?? null,
            topic: orig.topic ?? null,
            allowed_role_ids: orig.allowed_role_ids
              ? [...orig.allowed_role_ids]
              : [],
            allowed_user_ids: orig.allowed_user_ids
              ? [...orig.allowed_user_ids]
              : [],
            rate_limit_per_user: orig.rate_limit_per_user ?? 0,
            ...(duplicateOverrides
              ? { permission_overrides: duplicateOverrides }
              : {}),
          };
          try {
            await invoke("create_channel", { channel: dup });
            serverStore.addChannelToServer(server.id, dup);
            toasts.addToast("Channel duplicated.", "success");
            triggerServerRefresh();
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
      serverId: server?.id ?? null,
    });
  }
</script>

<ServerBackgroundContextMenu onaction={handleServerBackgroundAction}>
<Sidebar
    side="left"
    variant="muted"
    class="relative flex h-full flex-col bg-background overflow-hidden border-border border-l"
    style={`width: ${sidebarWidth}px`}
    aria-label="Server sidebar"
  >
    {#if server}
      <SidebarHeader class="px-0 pl-2 shadow-sm">
        <ServerHeaderDropdown
          {server}
          on:action={handleServerHeaderDropdownAction}
        />
        <Button
          variant="ghost"
          size="icon"
          class="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
          aria-label="Invite People"
        >
          <Plus size={12} />
        </Button>
      </SidebarHeader>

      <SidebarContent class="flex flex-1 flex-col overflow-hidden">
        <ScrollArea class="h-full w-full overflow-hidden px-2">
          {@const uncategorizedTextChannels = getVisibleChannels(
            null,
            "text",
          )}
          {@const uncategorizedVoiceChannels = getVisibleChannels(
            null,
            "voice",
          )}
          <div class="mt-4 space-y-2">
            <div
              role="list"
              class="space-y-1"
              ondragover={(event) =>
                handleChannelDragOver(event, null, "text", null)}
              ondrop={(event) => handleChannelDrop(event, null, "text")}
            >
              {#each uncategorizedTextChannels as channel (channel.id)}
                {@const metadata = channelMetadataLookup.get(channel.id)}
                {@const unreadCount = metadata?.unreadCount ?? 0}
                {#if shouldShowDropIndicator(null, "text", channel.id)}
                  <div class="mx-2 h-[2px] w-[calc(100%-0.5rem)] rounded-full bg-primary/80"></div>
                {/if}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      draggable
                      class={`group w-full h-[34px] text-left py-2 px-2 flex items-center justify-between transition-colors cursor-pointer my-1 rounded-md ${
                        $activeServerChannelId === channel.id
                          ? "bg-primary/80 text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      } ${draggingChannelId === channel.id ? "opacity-50" : ""}`}
                      ondragstart={(event) =>
                        handleChannelDragStart(event, channel)}
                      ondragend={handleChannelDragEnd}
                      ondragover={(event) =>
                        handleChannelDragOver(event, null, "text", channel.id)}
                      ondrop={(event) =>
                        handleChannelDrop(event, null, "text", channel.id)}
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
                            class="ml-2 flex items-center gap-1 border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
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
          {#if shouldShowDropIndicatorAtEnd(null, "text")}
            <div class="mx-2 h-[2px] w-[calc(100%-0.5rem)] rounded-full bg-primary/80"></div>
          {/if}
        </div>
        <div
          role="list"
          class="space-y-1"
          ondragover={(event) =>
            handleChannelDragOver(event, null, "voice", null)}
          ondrop={(event) => handleChannelDrop(event, null, "voice")}
        >
              {#each uncategorizedVoiceChannels as channel (channel.id)}
                {@const metadata = channelMetadataLookup.get(channel.id)}
                {@const unreadCount = metadata?.unreadCount ?? 0}
                {@const activeCall = $callStore.activeCall}
                {@const isActiveVoiceChannel =
                  activeCall &&
                  activeCall.chatType === "channel" &&
                  activeCall.type === "voice" &&
                  activeCall.status !== "ended" &&
                  activeCall.status !== "error" &&
                  activeCall.chatId === channel.id}
                {#if shouldShowDropIndicator(null, "voice", channel.id)}
                  <div class="mx-2 h-[2px] w-[calc(100%-0.5rem)] rounded-full bg-primary/80"></div>
                {/if}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      draggable
                      class={`group w-full h-[34px] text-left py-2 px-2 flex items-center justify-between transition-colors cursor-pointer my-1 rounded-md ${
                        isActiveVoiceChannel
                          ? "bg-primary/80 text-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      } ${draggingChannelId === channel.id ? "opacity-50" : ""}`}
                      ondragstart={(event) =>
                        handleChannelDragStart(event, channel)}
                      ondragend={handleChannelDragEnd}
                      ondragover={(event) =>
                        handleChannelDragOver(
                          event,
                          null,
                          "voice",
                          channel.id,
                        )}
                      ondrop={(event) =>
                        handleChannelDrop(event, null, "voice", channel.id)}
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
                            class="ml-2 flex items-center gap-1 border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
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
              {#if shouldShowDropIndicatorAtEnd(null, "voice")}
                <div class="mx-2 h-[2px] w-[calc(100%-0.5rem)] rounded-full bg-primary/80"></div>
              {/if}
            </div>
          </div>
          {@const categories = getSortedCategories()}
          {#if categories.length > 0}
            {#each categories as category (category.id)}
              {@const categoryMuted = isCategoryMuted(category.id)}
              {@const collapsed =
                isCategoryCollapsed(category.id) ||
                (hideMutedChannels && categoryMuted)}
              <Collapsible
                open={!collapsed}
                onOpenChange={(value: boolean) =>
                  setCategoryCollapsed(category.id, !value)}
              >
                <div
                  class="flex justify-between items-center py-1 mt-4"
                  class:opacity-60={categoryMuted}
                >
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
                    onclick={() => handleCreateChannelClick("text", category.id)}
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
                  <div
                    role="list"
                    class="space-y-1"
                    ondragover={(event) =>
                      handleChannelDragOver(event, category.id, "text", null)}
                    ondrop={(event) =>
                      handleChannelDrop(event, category.id, "text")}
                  >
                    {#each textChannels as channel (channel.id)}
                      {@const metadata = channelMetadataLookup.get(channel.id)}
                      {@const unreadCount = metadata?.unreadCount ?? 0}
                      {#if shouldShowDropIndicator(category.id, "text", channel.id)}
                        <div class="mx-2 h-[2px] w-[calc(100%-0.5rem)] rounded-full bg-primary/80"></div>
                      {/if}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger
                            draggable
                          class={`group w-full h-[34px] text-left py-2 px-2 flex items-center justify-between transition-colors cursor-pointer my-1 rounded-md ${
                              $activeServerChannelId === channel.id
                                ? "bg-primary/80 text-foreground"
                                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            } ${draggingChannelId === channel.id ? "opacity-50" : ""}`}
                            ondragstart={(event) =>
                              handleChannelDragStart(event, channel)}
                            ondragend={handleChannelDragEnd}
                            ondragover={(event) =>
                              handleChannelDragOver(
                                event,
                                category.id,
                                "text",
                                channel.id,
                              )}
                            ondrop={(event) =>
                              handleChannelDrop(
                                event,
                                category.id,
                                "text",
                                channel.id,
                              )}
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
                                  class="ml-2 flex items-center gap-1 border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
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

                  </div>
                  <div
                   
                    role="list"
                    class="space-y-1 mt-2"
                    ondragover={(event) =>
                      handleChannelDragOver(event, category.id, "voice", null)}
                    ondrop={(event) =>
                      handleChannelDrop(event, category.id, "voice")}
                  >
                    {#each voiceChannels as channel (channel.id)}
                      {@const activeCall = $callStore.activeCall}
                      {@const isActiveVoiceChannel =
                        activeCall &&
                        activeCall.chatType === "channel" &&
                        activeCall.type === "voice" &&
                        activeCall.status !== "ended" &&
                        activeCall.status !== "error" &&
                        activeCall.chatId === channel.id}
                      {#if shouldShowDropIndicator(category.id, "voice", channel.id)}
                        <div class="mx-2 h-[2px] w-[calc(100%-0.5rem)] rounded-full bg-primary/80"></div>
                      {/if}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger
                            draggable
                          class={`group w-full h-[34px] text-left py-2 px-2 flex items-center justify-between transition-colors cursor-pointer my-1 rounded-md ${
                              isActiveVoiceChannel
                                ? "bg-primary/80 text-foreground shadow-sm"
                                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            } ${draggingChannelId === channel.id ? "opacity-50" : ""}`}
                            ondragstart={(event) =>
                              handleChannelDragStart(event, channel)}
                            ondragend={handleChannelDragEnd}
                            ondragover={(event) =>
                              handleChannelDragOver(
                                event,
                                category.id,
                                "voice",
                                channel.id,
                              )}
                            ondrop={(event) =>
                              handleChannelDrop(
                                event,
                                category.id,
                                "voice",
                                channel.id,
                              )}
                            data-active={
                              isActiveVoiceChannel ? "true" : undefined
                            }
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
                                  class="ml-2 flex items-center gap-1 border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
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
                    {@const presenceEntry = $voiceChannelPresence.get(channel.id)}
                    {#if presenceEntry}
                      {@const participantEntries = Array.from(
                        presenceEntry.participants.values(),
                      ).sort(
                        (a, b) =>
                          (a.joinedAt ?? a.lastSeenAt) -
                          (b.joinedAt ?? b.lastSeenAt),
                      )}
                      <div class="ml-8 mt-1 space-y-1 pb-1">
                        <div class="text-[11px] font-medium text-muted-foreground">
                          {participantEntries.length} connected
                        </div>
                        {#if participantEntries.length > 0}
                          <div class="flex flex-wrap gap-1.5">
                            {#each participantEntries as presence (presence.userId)}
                              {@const member = membersById.get(presence.userId)}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <div class="flex items-center gap-1 rounded-md bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">
                                      <Avatar class="h-5 w-5 border border-border">
                                        <AvatarImage
                                          src={member?.avatar}
                                          alt={member?.name ?? presence.userId}
                                        />
                                        <AvatarFallback class="text-[10px] font-semibold uppercase">
                                          {member?.name?.[0] ?? presence.userId.slice(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                      <span class="max-w-24 truncate">
                                        {member?.name ?? presence.userId}
                                      </span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" align="start" class="text-xs">
                                    {member?.name ?? presence.userId}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                    {/each}
                    {#if shouldShowDropIndicatorAtEnd(category.id, "text")}
                      <div class="mx-2 h-[2px] w-[calc(100%-0.5rem)] rounded-full bg-primary/80"></div>
                    {/if}
                  </div>
                        {:else}
                          <p class="text-[11px] text-muted-foreground">
                            No one connected.
                          </p>
                        {/if}
                      </div>
                    {/if}
                  {/each}
                  {#if shouldShowDropIndicatorAtEnd(category.id, "voice")}
                    <div class="mx-2 h-[2px] w-[calc(100%-0.5rem)] rounded-full bg-primary/80"></div>
                  {/if}
                </div>
                </CollapsibleContent>
              </Collapsible>
            {/each}
          {/if}
        </ScrollArea>
      </SidebarContent>
    {:else}
      <SidebarContent class="flex flex-1 flex-col overflow-hidden">
        <ScrollArea class="h-full w-full overflow-hidden px-2">
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
  onOpenChange={(value: boolean) => {
    showCreateChannelModal = value;
    if (!value) {
      newChannelCategoryId = null;
    }
  }}
>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>
        {editingChannelId ? "Edit Channel" : "Create Channel"}
      </DialogTitle>
      <DialogDescription>
        {editingChannelId
          ? "Update channel settings, permissions, and slowmode."
          : "Create a text or voice channel with a name, optional topic, and privacy."}
      </DialogDescription>
    </DialogHeader>

    <div class="space-y-6">
      <div>
        <Label
          class="text-xs font-semibold uppercase text-muted-foreground mb-2"
        >
          Channel Type
        </Label>
        <div class="flex flex-col gap-3 w-full">
          <Button
            type="button"
            variant={newChannelType === "text" ? "secondary" : "outline"}
            class="w-full flex items-center gap-3 justify-start text-left py-4! h-auto!"
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
            class="w-full flex items-center gap-3 justify-start text-left py-4! h-auto!"
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
          {:else if newChannelType === "voice"}
            <Mic size={12} class="text-muted-foreground mr-2" />
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
              if (e.key === "Enter") submitChannelForm();
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
    </div>

    <DialogFooter>
      <Button variant="ghost" onclick={closeChannelModal}>Cancel</Button>
      {#if editingChannelId}
        <Button onclick={submitChannelForm} disabled={!newChannelName.trim()}>
          <Check size={14} class="mr-2" /> Save Changes
        </Button>
      {:else if newChannelPrivate}
        <Button
          onclick={openPrivateChannelAccessDialog}
          disabled={!newChannelName.trim()}
        >
          Next
        </Button>
      {:else}
        <Button onclick={submitChannelForm} disabled={!newChannelName.trim()}>
          <Plus size={14} class="mr-2" /> Create Channel
        </Button>
      {/if}
    </DialogFooter>
  </DialogContent>
</Dialog>

{#if showPrivateChannelAccessDialog}
  <Dialog
    open={showPrivateChannelAccessDialog}
    onOpenChange={(value: boolean) => {
      if (!value) {
        closePrivateChannelAccessDialog();
      }
    }}
  >
    <DialogContent data-testid="private-channel-access-dialog">
      <DialogHeader>
        <DialogTitle>Add members or roles</DialogTitle>
        <DialogDescription>
          Search for members by typing @ followed by their name, or type a role to add it to the
          list below.
        </DialogDescription>
      </DialogHeader>
      <div class="space-y-4">
        <Input
          placeholder="Type @member or role name"
          bind:value={privateAccessSearchTerm}
          onkeydown={handlePrivateAccessSearchKeydown}
          class="w-full"
        />
        {#if selectedRoleIds.size > 0 || selectedMemberIds.size > 0}
          <div class="flex flex-wrap gap-2">
            {#each Array.from(selectedRoleIds) as roleId}
              {@const role = rolesById.get(roleId)}
              {#if role}
                <Badge variant="secondary">{role.name}</Badge>
              {/if}
            {/each}
            {#each Array.from(selectedMemberIds) as memberId}
              {@const member = membersById.get(memberId)}
              {#if member}
                <Badge variant="secondary">{member.name}</Badge>
              {/if}
            {/each}
          </div>
        {/if}
        <div class="space-y-4">
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold uppercase text-muted-foreground">
                Roles
              </span>
              <span class="text-xs text-muted-foreground">{filteredRoles.length} available</span>
            </div>
            <div class="grid gap-2 max-h-56 overflow-y-auto pb-1">
              {#if filteredRoles.length === 0}
                <p class="text-xs text-muted-foreground">No roles found.</p>
              {:else}
                {#each filteredRoles as role (role.id)}
                  <button
                    type="button"
                    class={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition ${
                      selectedRoleIds.has(role.id)
                        ? "border-primary/80 bg-primary/10 text-primary"
                        : "border-border bg-background text-foreground hover:border-primary/60 hover:bg-muted/40"
                    }`}
                    onclick={() => toggleRoleSelection(role.id)}
                  >
                    <span class="truncate">{role.name}</span>
                    {#if selectedRoleIds.has(role.id)}
                      <Check size={14} />
                    {/if}
                  </button>
                {/each}
              {/if}
            </div>
          </div>
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold uppercase text-muted-foreground">
                Members
              </span>
              <span class="text-xs text-muted-foreground">{filteredMembers.length} available</span>
            </div>
            <div class="grid gap-2 max-h-56 overflow-y-auto pb-1">
              {#if filteredMembers.length === 0}
                <p class="text-xs text-muted-foreground">No members found.</p>
              {:else}
                {#each filteredMembers as member (member.id)}
                  <button
                    type="button"
                    class={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition ${
                      selectedMemberIds.has(member.id)
                        ? "border-primary/80 bg-primary/10 text-primary"
                        : "border-border bg-background text-foreground hover:border-primary/60 hover:bg-muted/40"
                    }`}
                    onclick={() => toggleMemberSelection(member.id)}
                  >
                    <span class="truncate">{member.name}</span>
                    {#if selectedMemberIds.has(member.id)}
                      <Check size={14} />
                    {/if}
                  </button>
                {/each}
              {/if}
            </div>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onclick={closePrivateChannelAccessDialog}>
          Back
        </Button>
        <Button
          onclick={submitChannelForm}
          disabled={!newChannelName.trim()}
        >
          {selectedRoleIds.size + selectedMemberIds.size > 0 ? "Create Channel" : "Skip"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
{/if}

{#if showRenameCategoryModal && categoryBeingRenamed}
  <Dialog
    open={showRenameCategoryModal}
    onOpenChange={(value: boolean) => {
      if (!value) {
        closeRenameCategoryModal();
      }
    }}
  >
    <DialogContent data-testid="rename-category-modal">
      <DialogHeader>
        <DialogTitle>Rename Category</DialogTitle>
        <DialogDescription>
          Update the name for {categoryBeingRenamed.name}.
        </DialogDescription>
      </DialogHeader>
      <div class="space-y-4">
        <div class="space-y-2">
          <Label
            for="rename-category-name"
            class="text-xs font-semibold uppercase text-muted-foreground"
          >
            Category Name
          </Label>
          <Input
            id="rename-category-name"
            placeholder="Operations"
            bind:value={renameCategoryName}
            onkeydown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitRenameCategory();
              }
            }}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onclick={closeRenameCategoryModal}>
          Cancel
        </Button>
        <Button
          onclick={() => {
            void submitRenameCategory();
          }}
          disabled={!renameCategoryName.trim()}
        >
          <Check size={14} class="mr-2" /> Save Changes
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
{/if}

{#if showCategoryNotificationsModal && notificationsCategoryId}
  <Dialog
    open={showCategoryNotificationsModal}
    onOpenChange={(value: boolean) => {
      if (!value) {
        closeCategoryNotificationsModal();
      }
    }}
  >
    <DialogContent data-testid="category-notifications-modal">
      <DialogHeader>
        <DialogTitle>Category Notifications</DialogTitle>
        <DialogDescription>
          Choose how you’d like to be notified about {notificationsCategoryName}.
        </DialogDescription>
      </DialogHeader>
      <div class="space-y-4">
        <div class="space-y-2">
          <Label class="text-xs font-semibold uppercase text-muted-foreground">
            Delivery Preference
          </Label>
          <div class="space-y-2">
            {#each CATEGORY_NOTIFICATION_OPTIONS as option (option.value)}
              <Button
                type="button"
                variant={
                  pendingNotificationLevel === option.value
                    ? "secondary"
                    : "outline"
                }
                class="flex w-full flex-col items-start gap-1 text-left"
                data-testid={`category-notification-option-${option.value}`}
                onclick={() => {
                  pendingNotificationLevel = option.value;
                }}
              >
                <span class="text-sm font-medium">{option.label}</span>
                <span class="text-xs text-muted-foreground">
                  {option.description}
                </span>
              </Button>
            {/each}
          </div>
        </div>
        <div class="rounded-md border border-border/60 bg-muted/10 p-3 text-xs text-muted-foreground">
          Muting notifications won’t hide the category, but it will silence
          pings and sounds from its channels.
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onclick={closeCategoryNotificationsModal}>
          Cancel
        </Button>
        <Button onclick={saveCategoryNotificationSettings}>
          <Check size={14} class="mr-2" /> Save Preference
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
{/if}

{#if showCreateCategoryModal}
  <CreateCategoryModal
    {server}
    onclose={() => {
      showCreateCategoryModal = false;
    }}
    on:categorycreated={triggerServerRefresh}
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

<style>
  :global(body.dragging-channel) {
    cursor: grabbing !important;
  }
</style>
