<svelte:options runes={true} />

<script lang="ts">
  import { tick } from "svelte";
  import { get } from "svelte/store";
  import { SvelteMap } from "svelte/reactivity";
  import { Button } from "$lib/components/ui/button";
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from "$lib/components/ui/avatar";
  import { Badge } from "$lib/components/ui/badge";
  import { Separator } from "$lib/components/ui/separator";
  import { Input } from "$lib/components/ui/input";
  import { cn } from "$lib/utils";
  import {
    Popover,
    PopoverContent,
    PopoverTrigger,
  } from "$lib/components/ui/popover";
  import { chatSearchStore } from "$lib/features/chat/stores/chatSearchStore";
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
    filterDefinitions,
    filterKeySet,
    messageTypeOptions,
    parseQuery,
    buildQuery,
    createUserTokenValue,
    getSearchPlaceholder,
    type FilterKey,
    type SearchToken,
  } from "$lib/features/chat/utils/chatSearchConfig";
  import type { Chat } from "$lib/features/chat/models/Chat";
  import type { User } from "$lib/features/auth/models/User";
  import { userStore } from "$lib/stores/userStore";
  import { Search, Trash2, X, BadgeQuestionMark } from "@lucide/svelte";

  let { chat } = $props<{ chat: Chat | null }>();

  const searchOptionTemplates = filterDefinitions.map(
    ({ key, label, hint }) => ({
      key,
      label,
      hint,
    }),
  );

  let searchInputRef = $state<HTMLInputElement | null>(null);
  let dropdownCloseTimeout: ReturnType<typeof setTimeout> | null = null;
  let tokens = $state<SearchToken[]>([]);
  let freeText = $state("");
  let activeTokenIndex = $state<number | null>(null);
  let suppressStoreSync = false;

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

  const searchPlaceholder = $derived(() => getSearchPlaceholder(activeToken()));

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

  function maintainDropdown() {
    cancelDropdownClose();
    chatSearchStore.setDropdownOpen(true);
  }

  function scheduleDropdownClose() {
    cancelDropdownClose();
    dropdownCloseTimeout = setTimeout(() => {
      chatSearchStore.setDropdownOpen(false);
      activeTokenIndex = null;
    }, 150);
  }

  function cancelDropdownClose() {
    if (dropdownCloseTimeout) {
      clearTimeout(dropdownCloseTimeout);
      dropdownCloseTimeout = null;
    }
  }

  async function focusSearchInput() {
    await tick();
    const input = searchInputRef;
    input?.focus();
    input?.select();
  }

  function pushQueryUpdate(nextTokens: SearchToken[], nextFreeText: string) {
    suppressStoreSync = true;
    const nextQuery = buildQuery(nextTokens, nextFreeText);
    chatSearchStore.setQuery(nextQuery);
  }

  function resetLocalState() {
    tokens = [];
    freeText = "";
    activeTokenIndex = null;
  }

  function addToken(key: FilterKey) {
    const nextTokens = [...tokens, { key, value: "" }];
    tokens = nextTokens;
    freeText = "";
    activeTokenIndex = nextTokens.length - 1;
    pushQueryUpdate(nextTokens, "");
    maintainDropdown();
  }

  function activateToken(index: number) {
    activeTokenIndex = index;
    maintainDropdown();
  }

  function updateTokenValue(index: number, value: string) {
    const nextTokens = tokens.map((token, currentIndex) =>
      currentIndex === index ? { ...token, value } : token,
    );
    tokens = nextTokens;
    pushQueryUpdate(nextTokens, freeText);
  }

  function removeToken(index: number) {
    const nextTokens = tokens.filter(
      (_, currentIndex) => currentIndex !== index,
    );
    if (activeTokenIndex !== null) {
      if (activeTokenIndex === index) {
        activeTokenIndex = null;
      } else if (activeTokenIndex > index) {
        activeTokenIndex -= 1;
      }
    }
    tokens = nextTokens;
    pushQueryUpdate(nextTokens, freeText);
    maintainDropdown();
  }

  function selectActiveTokenValue(value: string) {
    if (activeTokenIndex === null) return;
    const index = activeTokenIndex;
    updateTokenValue(index, value);
    activeTokenIndex = null;
    freeText = "";
    pushQueryUpdate(tokens, "");
    maintainDropdown();
    void focusSearchInput();
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
      const { searching } = get(chatSearchStore);
      chatSearchStore.setMobileResultsOpen(searching);
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
      if (input.selectionStart === 0) {
        const lastTokenIndex = tokens.length - 1;
        if (lastTokenIndex >= 0) {
          event.preventDefault();
          activateToken(lastTokenIndex);
        }
      }
    }
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
    const { searching } = get(chatSearchStore);
    chatSearchStore.setMobileResultsOpen(searching);
    await tick();
    void focusSearchInput();
  }

  function clearSearchInput() {
    resetLocalState();
    chatSearchStore.clearSearch();
    chatSearchStore.setDropdownOpen(false);
    chatSearchStore.setMobileResultsOpen(false);
  }

  function clearSearchHistory() {
    chatSearchStore.clearHistory();
    maintainDropdown();
  }

  export async function applyPinnedFilter() {
    tokens = [{ key: "pinned", value: "true" }];
    freeText = "";
    activeTokenIndex = null;
    pushQueryUpdate(tokens, freeText);
    chatSearchStore.open();
    chatSearchStore.executeSearch();
    chatSearchStore.setDropdownOpen(false);
    const { searching } = get(chatSearchStore);
    chatSearchStore.setMobileResultsOpen(searching);
    await tick();
    void focusSearchInput();
  }

  $effect(() => {
    if (!chat) {
      resetLocalState();
      chatSearchStore.reset();
    }
  });
</script>

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
            <span class="text-muted-foreground text-xs">{option.hint}</span>
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
