<svelte:options runes={true} />

<script lang="ts">
  import { tick, getContext, onMount } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import {
    Avatar,
    AvatarImage,
    AvatarFallback,
  } from "$lib/components/ui/avatar";
  import { Badge } from "$lib/components/ui/badge";
  import { Separator } from "$lib/components/ui/separator";
  import { cn } from "$lib/utils";
  import { chatSearchStore } from "$lib/features/chat/stores/chatSearchStore";
  import { userStore } from "$lib/stores/userStore";
  import {
    buildChannelLookup,
    buildUserLookup,
    DEFAULT_AUTHOR_TYPES,
    DEFAULT_HAS_TOKENS,
    parseSearchQuery,
    type ParsedSearchToken,
    type SearchFilterError,
  } from "$lib/features/chat/utils/chatSearch";
  import {
    chatStore,
    messagesByChatId,
    hasMoreByChatId,
    activeChatTypingUsers,
  } from "$lib/features/chat/stores/chatStore";
  import { channelDisplayPreferencesStore } from "$lib/features/channels/stores/channelDisplayPreferencesStore";
  import { CREATE_GROUP_CONTEXT_KEY } from "$lib/contextKeys";
  import type { CreateGroupContext } from "$lib/contextTypes";
  import type { Chat } from "$lib/features/chat/models/Chat";
  import type { User } from "$lib/features/auth/models/User";
  import {
    Hash,
    Phone,
    UserRoundPlus,
    Video,
    X,
    Pin,
    Users,
    Bell,
    Search,
    BadgeQuestionMark,
    Trash2,
    MapPin,
    PanelRight,
    EllipsisVertical,
    LogOut,
    Pencil,
  } from "@lucide/svelte";
  import {
    Popover,
    PopoverTrigger,
    PopoverContent,
  } from "$lib/components/ui/popover";
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "$lib/components/ui/dialog";
  import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
  } from "$lib/components/ui/dropdown-menu";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import CallModal from "$lib/features/calls/components/CallModal.svelte";
  import { callStore } from "$lib/features/calls/stores/callStore";
  import { memberSidebarVisibilityStore } from "$lib/features/chat/stores/memberSidebarVisibilityStore";
  import { toasts } from "$lib/stores/ToastStore";

  type NavigationFn = (..._args: [string | URL]) => void; // eslint-disable-line no-unused-vars

  type OpenProfileHandler = (user: User) => void; // eslint-disable-line no-unused-vars

  const friendsTabs = ["All", "Online", "Blocked", "Pending"] as const;

  const filterDefinitions = [
    { key: "from", label: "from", hint: "user", valueType: "user" },
    { key: "mentions", label: "mentions", hint: "user", valueType: "user" },
    {
      key: "has",
      label: "has",
      hint: "link, embed or file",
      valueType: "messageType",
    },
    {
      key: "before",
      label: "before",
      hint: "specific date",
      valueType: "date",
    },
    {
      key: "during",
      label: "during",
      hint: "specific date",
      valueType: "date",
    },
    { key: "after", label: "after", hint: "specific date", valueType: "date" },
    { key: "in", label: "in", hint: "channel", valueType: "channel" },
    {
      key: "pinned",
      label: "pinned",
      hint: "true or false",
      valueType: "boolean",
    },
    {
      key: "authorType",
      label: "authorType",
      hint: "user, bot or webhook",
      valueType: "authorType",
    },
  ] as const;

  type FilterKey = (typeof filterDefinitions)[number]["key"];
  type FilterValueType = (typeof filterDefinitions)[number]["valueType"];

  interface FilterDefinition {
    key: FilterKey;
    label: string;
    hint: string;
    valueType: FilterValueType;
  }

  interface SearchToken {
    key: FilterKey;
    value: string;
  }

  const filterConfig = filterDefinitions.reduce<
    Record<FilterKey, FilterDefinition>
  >(
    (acc, def) => {
      acc[def.key] = def;
      return acc;
    },
    {} as Record<FilterKey, FilterDefinition>,
  );

  const filterKeySet = new Set<FilterKey>(
    filterDefinitions.map((def) => def.key),
  );

  const searchOptionTemplates = filterDefinitions.map(
    ({ key, label, hint }) => ({
      key,
      label,
      hint,
    }),
  );

  const messageTypeOptions = [
    { value: "link", label: "Link" },
    { value: "image", label: "Image" },
    { value: "video", label: "Video" },
    { value: "file", label: "File" },
    { value: "sound", label: "Sound" },
    { value: "embed", label: "Embed" },
  ] as const;

  let {
    chat,
    onOpenDetailedProfile,
    isFriendsOrRootPage = false,
    friendsActiveTab = "All",
    onFriendsTabSelect = () => {},
    onFriendsAddClick = () => {},
  } = $props<{
    chat: Chat | null;
    onOpenDetailedProfile: OpenProfileHandler;
    isFriendsOrRootPage?: boolean;
    friendsActiveTab?: string;
    onFriendsTabSelect?: (tab: string) => void; // eslint-disable-line no-unused-vars
    onFriendsAddClick?: () => void;
  }>();

  const gotoUnsafe: NavigationFn = goto as unknown as NavigationFn;

  const context = getContext<CreateGroupContext | undefined>(
    CREATE_GROUP_CONTEXT_KEY,
  );
  const openUserCardModal = context?.openUserCardModal;

  let searchInputRef = $state<HTMLInputElement | null>(null);
  let dropdownCloseTimeout: ReturnType<typeof setTimeout> | null = null;
  let tokens = $state<SearchToken[]>([]);
  let freeText = $state("");
  let activeTokenIndex = $state<number | null>(null);
  let suppressStoreSync = false;
  let leaveGroupPending = $state(false);
  let showRenameGroupModal = $state(false);
  let renameGroupPending = $state(false);
  let renameGroupName = $state("");
  let renameGroupError = $state<string | null>(null);
  let renameGroupInputRef = $state<HTMLInputElement | null>(null);

  const hideMemberNamesActive = $derived.by(() => {
    if (!chat?.id) return false;
    return (
      $channelDisplayPreferencesStore.get(chat.id)?.hideMemberNames ?? false
    );
  });

  const memberSidebarVisible = $derived.by(() => {
    if (!chat?.id) return false;
    const state = $memberSidebarVisibilityStore;
    const entry = state.get(chat.id);
    return entry !== false;
  });

  const activeToken = $derived(() =>
    activeTokenIndex !== null ? (tokens[activeTokenIndex] ?? null) : null,
  );
  const inputValue = $derived(() =>
    activeTokenIndex !== null
      ? (tokens[activeTokenIndex]?.value ?? "")
      : freeText,
  );

  const availableUsers = $derived(() => {
    if (!chat) return [] as User[];
    const seen = new SvelteMap<string, User>();
    const pushUser = (user: User | null | undefined) => {
      if (!user) return;
      if (seen.has(user.id)) return;
      seen.set(user.id, user);
    };
    if (chat.type === "dm") {
      pushUser(chat.friend);
    } else {
      chat.members.forEach((member: User) => pushUser(member));
    }
    pushUser($userStore.me ?? undefined);
    return Array.from(seen.values());
  });

  const userLookup = $derived(() =>
    buildUserLookup(
      availableUsers().map((user) => ({
        id: user.id,
        name: user.name ?? user.id,
        tag: user.tag ?? null,
      })),
    ),
  );

  const channelLookup = $derived(() => {
    if (!chat) {
      return buildChannelLookup([]);
    }
    if (chat.type === "channel") {
      return buildChannelLookup([{ id: chat.id, name: chat.name }]);
    }
    if (chat.type === "group") {
      return buildChannelLookup([{ id: chat.id, name: chat.name }]);
    }
    return buildChannelLookup([
      { id: chat.id, name: chat.friend?.name ?? chat.id },
    ]);
  });

  const searchParseOptions = $derived(() => ({
    lookups: {
      users: userLookup(),
      channels: channelLookup(),
    },
    allowedHas: DEFAULT_HAS_TOKENS,
    allowedAuthorTypes: DEFAULT_AUTHOR_TYPES,
  }));

  const parsedSearchAnalysis = $derived(
    parseSearchQuery($chatSearchStore.query, searchParseOptions()),
  );
  const parsedSearchTokens = $derived<ParsedSearchToken[]>(
    parsedSearchAnalysis.tokens,
  );
  const searchValidationErrors = $derived<SearchFilterError[]>(
    parsedSearchAnalysis.errors ?? [],
  );

  const filteredUserOptions = $derived(() => {
    const token = activeToken();
    const users = availableUsers();
    if (!token || (token.key !== "from" && token.key !== "mentions")) {
      return users;
    }
    const search = token.value.trim().replace(/^@/, "").toLowerCase();
    if (!search) return users;
    return users.filter((user: User) =>
      user.name.toLowerCase().includes(search),
    );
  });

  const searchPlaceholder = $derived(() => {
    const token = activeToken();
    if (!token) return "Search";
    const definition = filterConfig[token.key];
    switch (definition.valueType) {
      case "user":
        return "Search users...";
      case "messageType":
        return "Select message type...";
      case "date":
        return "YYYY-MM-DD";
      case "channel":
        return "Channel name...";
      case "boolean":
        return "true or false";
      case "authorType":
        return "user, bot or webhook";
      default:
        return "Value...";
    }
  });

  const typingStatusLabel = $derived(() => {
    const ids = $activeChatTypingUsers;
    if (!chat || ids.length === 0) {
      return "";
    }

    const lookup = new SvelteMap<string, string>();
    if (chat.type === "dm" && chat.friend) {
      lookup.set(chat.friend.id, chat.friend.name ?? chat.friend.id);
    }
    if ((chat.type === "group" || chat.type === "channel") && chat.members) {
      chat.members.forEach((member: User) => {
        lookup.set(member.id, member.name ?? member.id);
      });
    }
    const currentUser = $userStore.me;
    if (currentUser) {
      lookup.set(currentUser.id, currentUser.name ?? currentUser.id);
    }

    const names = ids
      .map((id) => lookup.get(id) ?? "Someone")
      .filter((name, index, array) => array.indexOf(name) === index);

    if (names.length === 0) {
      return "";
    }
    if (names.length === 1) {
      return `${names[0]} is typing...`;
    }
    if (names.length === 2) {
      return `${names[0]} and ${names[1]} are typing...`;
    }
    return `${names[0]}, ${names[1]}, and ${names.length - 2} others are typing...`;
  });

  $effect(() => {
    const query = $chatSearchStore.query;
    if (suppressStoreSync) {
      suppressStoreSync = false;
      return;
    }
    const parsed = parseQuery(query);
    tokens = parsed.tokens;
    freeText = parsed.freeText;
    const pendingIndex = parsed.tokens.findIndex(
      (token) => !token.value.trim(),
    );
    activeTokenIndex = pendingIndex !== -1 ? pendingIndex : null;
  });

  async function focusSearchInput() {
    await tick();
    const input = searchInputRef;
    input?.focus();
    input?.select();
  }

  function parseQuery(query: string): {
    tokens: SearchToken[];
    freeText: string;
  } {
    if (!query.trim()) {
      return { tokens: [], freeText: "" };
    }
    const words = query.split(/\s+/).filter(Boolean);
    const parsedTokens: SearchToken[] = [];
    const remainder: string[] = [];
    let currentToken: SearchToken | null = null;

    const pushCurrent = () => {
      if (currentToken) {
        parsedTokens.push(currentToken);
        currentToken = null;
      }
    };

    for (const word of words) {
      const colonIndex = word.indexOf(":");
      if (colonIndex !== -1) {
        const keyCandidate = word
          .slice(0, colonIndex)
          .toLowerCase() as FilterKey;
        if (filterKeySet.has(keyCandidate)) {
          pushCurrent();
          const valuePart = word.slice(colonIndex + 1);
          currentToken = { key: keyCandidate, value: valuePart };
          continue;
        }
      }
      if (currentToken) {
        const nextValue: string = currentToken.value
          ? `${currentToken.value} ${word}`
          : word;
        currentToken = { ...currentToken, value: nextValue };
      } else {
        remainder.push(word);
      }
    }

    pushCurrent();
    return { tokens: parsedTokens, freeText: remainder.join(" ") };
  }

  function buildQuery(nextTokens: SearchToken[], nextFreeText: string) {
    const parts: string[] = [];
    nextTokens.forEach((token) => {
      const trimmedValue = token.value.trim();
      parts.push(
        trimmedValue ? `${token.key}:${trimmedValue}` : `${token.key}:`,
      );
    });
    const trimmedFreeText = nextFreeText.trim();
    if (trimmedFreeText) {
      parts.push(trimmedFreeText);
    }
    return parts.join(" ");
  }

  function pushQueryUpdate(nextTokens: SearchToken[], nextFreeText: string) {
    suppressStoreSync = true;
    chatSearchStore.setQuery(buildQuery(nextTokens, nextFreeText));
  }

  function cancelDropdownClose() {
    if (dropdownCloseTimeout) {
      clearTimeout(dropdownCloseTimeout);
      dropdownCloseTimeout = null;
    }
  }

  function scheduleDropdownClose() {
    cancelDropdownClose();
    dropdownCloseTimeout = setTimeout(() => {
      chatSearchStore.setDropdownOpen(false);
    }, 150);
  }

  function maintainDropdown() {
    cancelDropdownClose();
    chatSearchStore.open();
    chatSearchStore.setDropdownOpen(true);
  }

  function addToken(key: FilterKey) {
    const nextTokens = [...tokens, { key, value: "" }];
    tokens = nextTokens;
    activeTokenIndex = nextTokens.length - 1;
    freeText = "";
    pushQueryUpdate(nextTokens, "");
    chatSearchStore.open();
    maintainDropdown();
    focusSearchInput();
  }

  function activateToken(index: number) {
    activeTokenIndex = index;
    focusSearchInput();
    maintainDropdown();
  }

  function updateTokenValue(index: number, value: string) {
    const nextTokens = tokens.map((token, idx) =>
      idx === index ? { ...token, value } : token,
    );
    tokens = nextTokens;
    pushQueryUpdate(nextTokens, freeText);
    maintainDropdown();
  }

  function selectActiveTokenValue(value: string) {
    if (activeTokenIndex === null) return;
    const nextTokens = tokens.map((token, idx) =>
      idx === activeTokenIndex ? { ...token, value } : token,
    );
    tokens = nextTokens;
    activeTokenIndex = null;
    freeText = "";
    pushQueryUpdate(nextTokens, "");
    maintainDropdown();
    focusSearchInput();
  }

  function removeToken(index: number) {
    const nextTokens = tokens.slice();
    nextTokens.splice(index, 1);
    tokens = nextTokens;
    if (activeTokenIndex !== null) {
      if (activeTokenIndex === index) {
        activeTokenIndex = null;
      } else if (activeTokenIndex > index) {
        activeTokenIndex -= 1;
      }
    }
    pushQueryUpdate(nextTokens, freeText);
    focusSearchInput();
    maintainDropdown();
  }

  function resetLocalState() {
    tokens = [];
    freeText = "";
    activeTokenIndex = null;
  }

  function handleSearchInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    const value = target.value;
    if (activeTokenIndex !== null) {
      updateTokenValue(activeTokenIndex, value);
      return;
    }
    const trimmedLower = value.trim().toLowerCase();
    if (trimmedLower.endsWith(":")) {
      const keyCandidate = trimmedLower.slice(0, -1) as FilterKey;
      if (filterKeySet.has(keyCandidate)) {
        addToken(keyCandidate);
        return;
      }
    }
    freeText = value;
    pushQueryUpdate(tokens, value);
    maintainDropdown();
  }

  function handleAvatarClick(event: MouseEvent, user: User) {
    openUserCardModal?.(user, event.clientX, event.clientY, false);
  }

  function handleNameClick(event: MouseEvent, user: User) {
    openUserCardModal?.(user, event.clientX, event.clientY, false);
  }

  function handleNameDoubleClick(user: User) {
    onOpenDetailedProfile?.(user);
  }

  function handleSearchFocus() {
    cancelDropdownClose();
    chatSearchStore.open();
    maintainDropdown();
  }

  function handleSearchBlur() {
    scheduleDropdownClose();
  }

  function handlePopoverPointerLeave() {
    scheduleDropdownClose();
  }

  function handlePopoverOpenChange(open: boolean) {
    if (!open && document.activeElement === searchInputRef) {
      return;
    }
    if (open) {
      cancelDropdownClose();
    } else {
      activeTokenIndex = null;
    }
    chatSearchStore.setDropdownOpen(open);
  }

  function insertTokenFromOption(key: FilterKey) {
    addToken(key);
  }

  async function handleHistorySelect(entry: string) {
    chatSearchStore.setQuery(entry);
    chatSearchStore.executeSearch();
    chatSearchStore.setDropdownOpen(false);
    await tick();
    focusSearchInput();
  }

  function clearSearchInput() {
    resetLocalState();
    chatSearchStore.clearSearch();
    chatSearchStore.setDropdownOpen(false);
  }

  function clearSearchHistory() {
    chatSearchStore.clearHistory();
    maintainDropdown();
  }

  function openNotificationSettings() {
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    gotoUnsafe("/settings/notifications");
  }

  function openPinnedMessages() {
    if (!chat?.id) return;
    const existingMessages = $messagesByChatId.get(chat.id) ?? [];
    const pinnedLoaded = existingMessages.some((message) => message.pinned);
    const hasMore = $hasMoreByChatId.get(chat.id) ?? false;
    if (!pinnedLoaded && hasMore) {
      void chatStore.loadMoreMessages(chat.id).catch((error) => {
        console.error("Failed to load pinned messages", error);
      });
    }
    const pinnedToken: SearchToken = { key: "pinned", value: "true" };
    tokens = [pinnedToken];
    freeText = "";
    activeTokenIndex = null;
    pushQueryUpdate(tokens, freeText);
    chatSearchStore.open();
    chatSearchStore.executeSearch();
    chatSearchStore.setDropdownOpen(false);
  }

  async function toggleHideMemberList() {
    if (!chat?.id) return;
    try {
      await channelDisplayPreferencesStore.toggleHideMemberNames(chat.id);
    } catch (error) {
      console.error("Failed to toggle hide member names:", error);
    }
  }

  async function handleLeaveGroup() {
    if (!chat || chat.type !== "group" || leaveGroupPending) {
      return;
    }

    const groupId = chat.id;
    const displayName = chat.name?.trim?.() ? chat.name : "this group";
    const confirmed = confirm(`Leave the group "${displayName}"?`);
    if (!confirmed) {
      return;
    }

    leaveGroupPending = true;
    try {
      await chatStore.leaveGroupChat(groupId);
      toasts.addToast(`You left ${displayName}.`, "info");
    } catch (error: any) {
      console.error("Failed to leave group:", error);
      const message =
        error?.message ?? "Failed to leave group. Please try again.";
      toasts.addToast(message, "error");
    } finally {
      leaveGroupPending = false;
    }
  }

  async function openRenameGroupModal() {
    if (!chat || chat.type !== "group") {
      return;
    }
    renameGroupError = null;
    renameGroupName = chat.name ?? "";
    showRenameGroupModal = true;
    await tick();
    renameGroupInputRef?.focus?.();
    renameGroupInputRef?.select?.();
  }

  function closeRenameGroupModal() {
    if (renameGroupPending) {
      return;
    }
    showRenameGroupModal = false;
    renameGroupError = null;
  }

  async function handleRenameGroupSubmit(event?: SubmitEvent) {
    event?.preventDefault?.();
    if (!chat || chat.type !== "group" || renameGroupPending) {
      return;
    }

    const trimmed = renameGroupName.trim();
    if (!trimmed) {
      renameGroupError = "Please enter a group name.";
      return;
    }

    renameGroupPending = true;
    try {
      const summary = await chatStore.renameGroupChat(chat.id, trimmed);
      toasts.addToast(`Group renamed to ${summary.name}.`, "success");
      showRenameGroupModal = false;
      renameGroupError = null;
    } catch (error: any) {
      console.error("Failed to rename group:", error);
      const message =
        error?.message ?? "Failed to rename group. Please try again.";
      renameGroupError = message;
      toasts.addToast(message, "error");
    } finally {
      renameGroupPending = false;
    }
  }

  function toggleMemberSidebarVisibility() {
    if (!chat?.id) return;
    memberSidebarVisibilityStore.toggleVisibility(chat.id);
  }

  function createUserTokenValue(user: User) {
    const suffix = user.tag ? ` ${user.tag}` : "";
    return `@${user.name}${suffix}`.trim();
  }

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      if (activeTokenIndex !== null) {
        event.preventDefault();
        const token = tokens[activeTokenIndex];
        if (!token.value.trim()) {
          return;
        }
        activeTokenIndex = null;
        freeText = "";
        pushQueryUpdate(tokens, "");
        maintainDropdown();
        return;
      }
      event.preventDefault();
      chatSearchStore.executeSearch();
      chatSearchStore.setDropdownOpen(false);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      clearSearchInput();
      searchInputRef?.blur();
      return;
    }
    if (event.key === "Backspace") {
      const input = event.currentTarget as HTMLInputElement;
      if (
        input.selectionStart !== input.selectionEnd ||
        input.selectionStart === null
      ) {
        return;
      }
      if (
        activeTokenIndex !== null &&
        input.selectionStart === 0 &&
        !input.value
      ) {
        event.preventDefault();
        removeToken(activeTokenIndex);
        return;
      }
      if (
        activeTokenIndex === null &&
        input.selectionStart === 0 &&
        !input.value &&
        tokens.length
      ) {
        event.preventDefault();
        const nextTokens = tokens.slice(0, -1);
        tokens = nextTokens;
        activeTokenIndex = nextTokens.length ? nextTokens.length - 1 : null;
        freeText = "";
        pushQueryUpdate(nextTokens, "");
        maintainDropdown();
        focusSearchInput();
      }
    }
  }

  onMount(() => {
    callStore.initialize();
  });

  let activeCallForChat = $derived.by(() => {
    if (!chat?.id) return null;
    const active = $callStore.activeCall;
    return active && active.chatId === chat.id && active.chatType === chat.type
      ? active
      : null;
  });

  const isCallEligible = $derived.by(() => {
    if (!chat) {
      return false;
    }
    return (
      chat.type === "dm" || chat.type === "group" || chat.type === "channel"
    );
  });

  let voiceButtonDisabled = $derived.by(() => {
    if (!chat?.id || !isCallEligible) return true;
    const state = $callStore;
    const active = state.activeCall;
    if (
      active &&
      (active.chatId !== chat.id || active.chatType !== chat.type) &&
      active.status !== "ended" &&
      active.status !== "error"
    ) {
      return true;
    }
    if (!state.deviceAvailability.audioInput) {
      return true;
    }
    if (state.permissions.audio === "denied") {
      return true;
    }
    if (state.permissions.checking) {
      return true;
    }
    return false;
  });

  let videoButtonDisabled = $derived.by(() => {
    if (!chat?.id || !isCallEligible) return true;
    const state = $callStore;
    const active = state.activeCall;
    if (
      active &&
      (active.chatId !== chat.id || active.chatType !== chat.type) &&
      active.status !== "ended" &&
      active.status !== "error"
    ) {
      return true;
    }
    if (
      !state.deviceAvailability.audioInput ||
      !state.deviceAvailability.videoInput
    ) {
      return true;
    }
    if (
      state.permissions.audio === "denied" ||
      state.permissions.video === "denied"
    ) {
      return true;
    }
    if (state.permissions.checking) {
      return true;
    }
    return false;
  });

  const voiceCallActive = $derived(
    Boolean(
      activeCallForChat &&
        activeCallForChat.type === "voice" &&
        activeCallForChat.status !== "ended" &&
        activeCallForChat.status !== "error",
    ),
  );

  const videoCallActive = $derived(
    Boolean(
      activeCallForChat &&
        activeCallForChat.type === "video" &&
        activeCallForChat.status !== "ended" &&
        activeCallForChat.status !== "error",
    ),
  );

  function getCallMembers() {
    if (!chat) return [] as { id: string; name?: string }[];
    if (chat.type === "dm") {
      return [
        {
          id: chat.friend.id,
          name: chat.friend.name,
        },
      ];
    }
    if (chat.type === "group" || chat.type === "channel") {
      return chat.members.map((member: { id: string; name: string }) => ({
        id: member.id,
        name: member.name,
      }));
    }
    return [];
  }

  function getChatDisplayName() {
    if (!chat) return "";
    if (chat.type === "dm") {
      return chat.friend.name;
    }
    return chat.name;
  }

  async function startVoiceCall() {
    if (!chat || !isCallEligible) return;
    const active = $callStore.activeCall;
    if (
      active &&
      active.chatId === chat.id &&
      active.chatType === chat.type &&
      active.status !== "ended" &&
      active.status !== "error"
    ) {
      callStore.setCallModalOpen(true);
      return;
    }
    await callStore.startCall({
      chatId: chat.id,
      chatName: getChatDisplayName(),
      chatType: chat.type,
      type: "voice",
      serverId: chat.type === "channel" ? chat.serverId : undefined,
      members: getCallMembers(),
    });
  }

  async function startVideoCall() {
    if (!chat || !isCallEligible) return;
    const active = $callStore.activeCall;
    if (
      active &&
      active.chatId === chat.id &&
      active.chatType === chat.type &&
      active.status !== "ended" &&
      active.status !== "error"
    ) {
      callStore.setCallModalOpen(true);
      return;
    }
    await callStore.startCall({
      chatId: chat.id,
      chatName: getChatDisplayName(),
      chatType: chat.type,
      type: "video",
      serverId: chat.type === "channel" ? chat.serverId : undefined,
      members: getCallMembers(),
    });
  }

  $effect(() => {
    if (!chat) {
      resetLocalState();
      chatSearchStore.reset();
    }
  });
</script>

{#if isFriendsOrRootPage}
  <header
    class="h-[55px] border-b border-border px-4 pt-4 pb-2 flex items-center justify-start sticky top-0 z-10 bg-card"
  >
    <div class="flex flex-wrap items-center gap-2">
      {#each friendsTabs as tab (tab)}
        <button
          type="button"
          class="px-3 py-1 rounded-md text-sm font-medium cursor-pointer h-8"
          class:bg-muted={friendsActiveTab === tab}
          class:hover:bg-muted={friendsActiveTab !== tab}
          onclick={() => onFriendsTabSelect(tab)}
        >
          {tab}
        </button>
      {/each}
      <Button type="button" onclick={onFriendsAddClick} class="cursor-pointer">
        <UserRoundPlus size={10} class="mr-2" />
        Add Friend
      </Button>
    </div>
  </header>
{:else if chat}
  <header
    class="h-[55px] border-b border-border px-4 flex items-center justify-between bg-card"
  >
    <div class="flex items-center gap-3 min-w-0">
      {#if chat.type === "dm"}
        <Button
          variant="ghost"
          size="icon"
          class="relative rounded-full w-10 h-10 shrink-0"
          onclick={(event) => handleAvatarClick(event, chat.friend)}
          aria-label="View profile picture"
        >
          <Avatar class="w-10 h-10">
            <AvatarImage src={chat.friend.avatar} alt={chat.friend.name} />
            <AvatarFallback>{chat.friend.name?.[0] ?? "?"}</AvatarFallback>
          </Avatar>
          <span
            class={cn(
              "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background",
              chat.friend.online ? "bg-green-500" : "bg-red-500",
            )}
          ></span>
        </Button>
        <div class="leading-tight min-w-0">
          <button
            class="p-0 font-semibold text-left hover:underline cursor-pointer text-base truncate"
            onclick={(event) => handleNameClick(event, chat.friend)}
            ondblclick={() => handleNameDoubleClick(chat.friend)}
          >
            {chat.friend.name}
          </button>
          <p class="text-xs text-muted-foreground whitespace-nowrap">
            {chat.friend.online ? "Online" : "Offline"}
          </p>
          {#if chat.friend.statusMessage}
            <p
              class="text-xs text-muted-foreground truncate"
              title={chat.friend.statusMessage}
            >
              {chat.friend.statusMessage}
            </p>
          {/if}
          {#if chat.friend.location}
            <p
              class="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap"
              title={chat.friend.location}
            >
              <MapPin class="w-3 h-3" />
              <span class="truncate">{chat.friend.location}</span>
            </p>
          {/if}
          {#if typingStatusLabel}
            <p class="text-xs text-cyan-400 whitespace-nowrap">
              {typingStatusLabel}
            </p>
          {/if}
        </div>
      {:else if chat.type === "group"}
        <div class="flex items-center gap-2 min-w-0">
          <Users class="w-4 h-4 text-muted-foreground shrink-0" />
          <h2 class="font-semibold text-lg truncate">{chat.name}</h2>
        </div>
        {#if typingStatusLabel}
          <p class="text-xs text-cyan-400 truncate">{typingStatusLabel}</p>
        {/if}
      {:else}
        <div class="flex items-center gap-2 min-w-0">
          <Hash class="w-4 h-4 text-muted-foreground shrink-0" />
          <h2 class="font-semibold text-lg truncate">{chat.name}</h2>
        </div>
        {#if typingStatusLabel}
          <p class="text-xs text-cyan-400 truncate">{typingStatusLabel}</p>
        {/if}
      {/if}
    </div>

    <div class="flex items-center gap-2">
      {#if isCallEligible}
        <Button
          variant="ghost"
          class={cn("cursor-pointer", voiceCallActive ? "text-cyan-400" : "")}
          size="icon"
          aria-label="Start voice call"
          onclick={startVoiceCall}
          disabled={voiceButtonDisabled}
          aria-pressed={voiceCallActive}
        >
          <Phone class="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          class={cn("cursor-pointer", videoCallActive ? "text-cyan-400" : "")}
          size="icon"
          aria-label="Start video call"
          onclick={startVideoCall}
          disabled={videoButtonDisabled}
          aria-pressed={videoCallActive}
        >
          <Video class="w-4 h-4" />
        </Button>
      {/if}
      {#if chat.type !== "dm"}
        <Button
          variant="ghost"
          class="cursor-pointer"
          size="icon"
          aria-label="Notification Settings"
          onclick={openNotificationSettings}
        >
          <Bell class="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          class="cursor-pointer"
          size="icon"
          aria-label="Pinned Messages"
          onclick={openPinnedMessages}
        >
          <Pin class="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          class={cn(
            "cursor-pointer",
            memberSidebarVisible ? "text-cyan-400" : "",
          )}
          size="icon"
          aria-label={memberSidebarVisible
            ? "Hide Member Sidebar"
            : "Show Member Sidebar"}
          onclick={toggleMemberSidebarVisibility}
          aria-pressed={memberSidebarVisible ? "true" : "false"}
        >
          <PanelRight class="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          class={cn(
            "cursor-pointer",
            hideMemberNamesActive ? "text-cyan-400" : "",
          )}
          size="icon"
          aria-label="Hide Member List"
          aria-pressed={hideMemberNamesActive ? "true" : "false"}
          onclick={toggleHideMemberList}
        >
          <Users class="w-4 h-4" />
        </Button>
        {#if chat.type === "group"}
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button
                variant="ghost"
                class="cursor-pointer"
                size="icon"
                aria-label="Group options"
                disabled={leaveGroupPending || renameGroupPending}
              >
                <EllipsisVertical class="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-44 text-sm">
              <DropdownMenuItem
                class="cursor-pointer"
                disabled={renameGroupPending}
                onselect={() => {
                  if (!renameGroupPending) {
                    void openRenameGroupModal();
                  }
                }}
              >
                <Pencil class="mr-2 h-3.5 w-3.5" /> Rename group
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                class="cursor-pointer text-destructive"
                onselect={() => {
                  if (!leaveGroupPending) {
                    void handleLeaveGroup();
                  }
                }}
              >
                <LogOut class="mr-2 h-3.5 w-3.5" /> Leave group
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog
            open={showRenameGroupModal}
            onOpenChange={(value) => {
              if (!value) {
                closeRenameGroupModal();
              }
            }}
          >
            <DialogContent class="sm:max-w-sm">
              <form class="space-y-4" onsubmit={handleRenameGroupSubmit}>
                <DialogHeader class="space-y-1">
                  <DialogTitle>Rename group</DialogTitle>
                  <DialogDescription>
                    Enter a new name for this group chat.
                  </DialogDescription>
                </DialogHeader>
                <div class="space-y-2">
                  <Label for="rename-group-input">Group name</Label>
                  <Input
                    id="rename-group-input"
                    bind:this={renameGroupInputRef}
                    bind:value={renameGroupName}
                    placeholder="Enter group name"
                    disabled={renameGroupPending}
                    required
                    aria-invalid={renameGroupError ? "true" : "false"}
                  />
                  {#if renameGroupError}
                    <p class="text-sm text-destructive">{renameGroupError}</p>
                  {/if}
                </div>
                <DialogFooter class="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onclick={closeRenameGroupModal}
                    disabled={renameGroupPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={renameGroupPending ||
                      renameGroupName.trim().length === 0}
                  >
                    Save
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        {/if}
      {/if}

      <div class="w-[260px]">
        <Popover
          open={$chatSearchStore.dropdownOpen}
          onOpenChange={handlePopoverOpenChange}
        >
          <PopoverTrigger>
            <div class="relative w-full">
              <Search
                class="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
              />
              <div
                class="flex min-h-8 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-background py-1 pl-8 pr-7 text-sm transition-[color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40"
              >
                {#each tokens as token, index (token.key + ":" + token.value + ":" + index)}
                  {@const tokenMeta = parsedSearchTokens[index] ?? null}
                  <Badge
                    variant="secondary"
                    class={cn(
                      "flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition",
                      tokenMeta && !tokenMeta.valid
                        ? "ring-1 ring-destructive text-destructive"
                        : activeTokenIndex === index
                          ? "ring-1 ring-ring"
                          : "ring-0",
                    )}
                    onclick={() => activateToken(index)}
                  >
                    <span>{token.key}:</span>
                    {#if token.value.trim()}
                      <span class="text-muted-foreground">{token.value}</span>
                    {:else if activeTokenIndex === index}
                      <span class="text-muted-foreground">Select...</span>
                    {/if}
                    <button
                      type="button"
                      class="ml-1 inline-flex items-center justify-center rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                      onclick={(event) => {
                        event.stopPropagation();
                        removeToken(index);
                      }}
                      aria-label={`Remove ${token.key} filter`}
                    >
                      <X class="h-3 w-3" />
                    </button>
                  </Badge>
                {/each}
                <input
                  bind:this={searchInputRef}
                  class="chat-search-input flex-1 min-w-[60px] bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  value={inputValue()}
                  placeholder={searchPlaceholder()}
                  onfocus={handleSearchFocus}
                  onblur={handleSearchBlur}
                  oninput={handleSearchInput}
                  onkeydown={handleSearchKeydown}
                />
              </div>
              {#if $chatSearchStore.query}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6"
                  onclick={clearSearchInput}
                  aria-label="Clear search"
                >
                  <X class="h-3.5 w-3.5" />
                </Button>
              {/if}
              {#if searchValidationErrors.length}
                <div class="mt-1 space-y-0.5 text-xs text-destructive">
                  {#each searchValidationErrors as error (error.key + error.value)}
                    <p>{error.message}</p>
                  {/each}
                </div>
              {/if}
            </div>
          </PopoverTrigger>

          <PopoverContent
            class="w-[260px] p-0"
            onpointerenter={maintainDropdown}
            onpointerleave={handlePopoverPointerLeave}
          >
            {@const currentToken = activeToken()}
            {@const userOptions = filteredUserOptions()}
            {#if currentToken && (currentToken.key === "from" || currentToken.key === "mentions")}
              <div
                class="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                <span
                  >{currentToken.key === "from"
                    ? "Filter by sender"
                    : "Filter by mention"}</span
                >
              </div>
              {#if userOptions.length}
                <div class="max-h-60 overflow-y-auto pb-2">
                  {#each userOptions as user (user.id)}
                    <Button
                      type="button"
                      variant="ghost"
                      class="flex w-full items-center justify-start gap-2 rounded-none px-3 py-2 text-sm"
                      onclick={() =>
                        selectActiveTokenValue(createUserTokenValue(user))}
                    >
                      <Avatar class="h-7 w-7">
                        <AvatarImage src={user.avatar} alt={user.name} />
                        <AvatarFallback>{user.name?.[0] ?? "?"}</AvatarFallback>
                      </Avatar>
                      <div class="flex flex-col items-start leading-tight">
                        <span class="font-medium">{user.name}</span>
                        <span class="text-xs text-muted-foreground"
                          >{user.online ? "Online" : "Offline"}</span
                        >
                      </div>
                    </Button>
                  {/each}
                </div>
              {:else}
                <p class="px-3 pb-3 text-xs text-muted-foreground">
                  No matching users.
                </p>
              {/if}
              <Separator class="opacity-60" />
            {:else if currentToken?.key === "has"}
              <div
                class="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                <span>Message Types</span>
              </div>
              <div class="space-y-1 px-2 pb-2">
                {#each messageTypeOptions as option (option.value)}
                  <Button
                    type="button"
                    variant="ghost"
                    class={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1 text-sm",
                      currentToken?.value?.toLowerCase() === option.value
                        ? "bg-muted"
                        : "",
                    )}
                    onclick={() => selectActiveTokenValue(option.value)}
                  >
                    <span class="font-medium capitalize">{option.label}</span>
                  </Button>
                {/each}
              </div>
              <Separator class="opacity-60" />
            {/if}

            <div
              class="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <span>Search Options</span>
              <BadgeQuestionMark class="h-3.5 w-3.5" />
            </div>

            <div class="space-y-1 px-2 pb-2">
              {#each searchOptionTemplates as option (option.key)}
                <Button
                  type="button"
                  variant="ghost"
                  class="flex w-full items-center justify-between rounded-md px-2 py-1 text-sm text-foreground cursor-pointer"
                  onclick={() => insertTokenFromOption(option.key)}
                >
                  <span class="font-medium">{option.label}:</span>
                  <span class="text-muted-foreground text-xs"
                    >{option.hint}</span
                  >
                </Button>
              {/each}
            </div>

            <Separator class="opacity-60" />

            <div
              class="flex items-center justify-between px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <span>History</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onclick={clearSearchHistory}
                aria-label="Clear search history"
                class="cursor-pointer"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </Button>
            </div>

            {#if $chatSearchStore.history.length > 0}
              <div class="space-y-1 px-2 pb-2">
                {#each $chatSearchStore.history as entry (entry)}
                  <Button
                    type="button"
                    variant="ghost"
                    class="flex w-full items-center justify-between rounded-md px-2 py-1 text-sm text-foreground"
                    onclick={() => handleHistorySelect(entry)}
                  >
                    <span class="truncate">{entry}</span>
                  </Button>
                {/each}
              </div>
            {:else}
              <p class="px-3 pb-3 text-xs text-muted-foreground">
                No recent searches.
              </p>
            {/if}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  </header>
{:else}
  <header
    class="h-[55px] border-b border-border px-4 flex items-center bg-card text-sm text-muted-foreground"
  >
    Select a chat to get started.
  </header>
{/if}

<CallModal />
