<svelte:options runes={true} />

<script lang="ts">
  import {
    ArrowDown,
    ArrowUp,
    LoaderCircle,
    Search as SearchIcon,
    X,
  } from "@lucide/svelte";
  import { SvelteMap } from "svelte/reactivity";
  import { Button } from "$lib/components/ui/button";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import {
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
  } from "$lib/components/ui/sidebar";
  import { chatSearchStore } from "$lib/features/chat/stores/chatSearchStore";
  import { messagesByChatId } from "$lib/features/chat/stores/chatStore";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { userStore } from "$lib/stores/userStore";
  import type { Message } from "$lib/features/chat/models/Message";
  import type { User } from "$lib/features/auth/models/User";
  import {
    highlightText,
    type HighlightPart,
  } from "$lib/features/chat/utils/highlightText";
  import type { Chat } from "$lib/features/chat/models/Chat";
  import { cn } from "$lib/utils";

  type Variant = "sidebar" | "dialog";

  let {
    chat,
    variant = "sidebar" as Variant,
    class: className,
  } = $props<{ chat: Chat | null; variant?: Variant; class?: string }>();

  type MatchPreview = {
    id: string;
    matchIndex: number;
    messageIndex: number;
    author: string;
    timestampLabel: string;
    timestampIso: string | null;
    parts: HighlightPart[];
  };

  const matchButtonBaseClasses =
    "w-full rounded-lg border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
  const activeMatchClasses =
    "border-primary/60 bg-primary/15 text-foreground shadow-sm";
  const inactiveMatchClasses =
    "border-transparent bg-muted/30 text-foreground hover:bg-muted/40";

  function formatTimestamp(timestamp: string | undefined): {
    label: string;
    iso: string | null;
  } {
    if (!timestamp) {
      return { label: "", iso: null };
    }
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return { label: "", iso: null };
    }
    return {
      label: date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      iso: date.toISOString(),
    };
  }

  const chatParticipants = $derived.by((): User[] => {
    if (!chat) return [] as User[];
    if (chat.type === "dm") {
      const participants: User[] = [chat.friend];
      const me = $userStore.me;
      if (me) {
        participants.push(me);
      }
      return participants;
    }
    return chat.members ?? [];
  });

  const memberLookup = $derived.by(() => {
    const map = new SvelteMap<string, User>();
    chatParticipants.forEach((member: User) => {
      map.set(member.id, member);
    });
    const activeServerId = $serverStore.activeServerId;
    if (activeServerId) {
      const server = $serverStore.servers.find((s) => s.id === activeServerId);
      server?.members?.forEach((member) => {
        if (!map.has(member.id)) {
          map.set(member.id, member);
        }
      });
    }
    const me = $userStore.me;
    if (me && !map.has(me.id)) {
      map.set(me.id, me);
    }
    return map;
  });

  const chatMessages = $derived.by((): Message[] => {
    const chatId = chat?.id;
    if (!chatId) return [] as Message[];
    return ($messagesByChatId.get(chatId) ?? []) as Message[];
  });

  const matchPreviews = $derived.by((): MatchPreview[] => {
    const matches = $chatSearchStore.matches;
    if (!matches.length) return [] as MatchPreview[];
    const query = $chatSearchStore.query;
    const messages = chatMessages;
    const previews: MatchPreview[] = [];
    matches.forEach((messageIndex, matchIndex) => {
      const message = messages[messageIndex];
      if (!message) return;
      const member = memberLookup.get(message.senderId);
      const authorName = member?.name ?? `User-${message.senderId.slice(0, 4)}`;
      const { label, iso } = formatTimestamp(message.timestamp);
      const content = message.content ?? "";
      const parts = highlightText(content, query);
      previews.push({
        id: message.id,
        matchIndex,
        messageIndex,
        author: authorName,
        timestampLabel: label,
        timestampIso: iso,
        parts,
      });
    });
    return previews;
  });

  function handlePrev() {
    chatSearchStore.jumpToMatch(false);
  }

  function handleNext() {
    chatSearchStore.jumpToMatch(true);
  }

  function clearSearch() {
    chatSearchStore.clearSearch();
  }

  function handleMatchSelect(matchIndex: number) {
    chatSearchStore.focusMatch(matchIndex);
  }

  function loadMoreResults() {
    chatSearchStore.requestNextPage();
  }

  const containerClasses = $derived(() =>
    cn(
      "flex h-full min-h-0 flex-col",
      variant === "dialog"
        ? "bg-card text-muted-foreground"
        : "text-muted-foreground",
      className,
    ),
  );

  const headerClasses = $derived(() =>
    cn(
      "px-4 py-3",
      variant === "dialog" ? "border-b border-border" : undefined,
    ),
  );

  const contentClasses = $derived(() =>
    cn(variant === "dialog" ? "max-h-[min(75vh,540px)]" : undefined),
  );
</script>

<div class={containerClasses()}>
  <SidebarHeader class={headerClasses()}>
    <div class="flex items-center justify-between w-full">
      <div class="flex items-center gap-2">
        <SearchIcon class="h-4 w-4 text-muted-foreground" />
        <h2 class="text-sm font-semibold text-foreground">Search</h2>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="h-7 w-7 text-muted-foreground hover:text-foreground"
        onclick={clearSearch}
        aria-label="Clear search"
      >
        <X class="h-4 w-4" />
      </Button>
    </div>
  </SidebarHeader>
  <SidebarContent class={cn("flex", contentClasses())}>
    <ScrollArea class="h-full w-full">
      {#if !$chatSearchStore.query}
        <div
          class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground"
        >
          <SearchIcon class="h-10 w-10 text-muted-foreground/60" />
          <div>
            <p class="font-medium text-foreground">Start typing to search</p>
            <p>Use the filters to narrow results quickly.</p>
          </div>
        </div>
      {:else if ($chatSearchStore.loading && $chatSearchStore.pagesLoaded === 0)}
        <div
          class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground"
        >
          <LoaderCircle class="h-10 w-10 animate-spin text-muted-foreground/60" />
          <div>
            <p class="font-medium text-foreground">Searching conversation…</p>
            <p>We&rsquo;ll show results as soon as they are ready.</p>
          </div>
        </div>
      {:else if !$chatSearchStore.searching}
        <div
          class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground"
        >
          <SearchIcon class="h-10 w-10 text-muted-foreground/60" />
          <div>
            <p class="font-medium text-foreground">Ready to search</p>
            <p>Press Enter to search the conversation with your filters.</p>
          </div>
        </div>
      {:else if !$chatSearchStore.matches.length}
        <div
          class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground"
        >
          <SearchIcon class="h-10 w-10 text-muted-foreground/60" />
          <div>
            <p class="font-medium text-foreground">No results found</p>
            <p>Try adjusting your filters for "{$chatSearchStore.query}".</p>
          </div>
        </div>
      {:else}
        <div class="flex flex-col gap-4 p-4">
          <SidebarGroup class="space-y-3">
            <SidebarGroupLabel class="flex items-center justify-between">
              <span
                class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >Matches</span
              >
              <span class="text-xs font-semibold text-foreground">
                {$chatSearchStore.activeMatchIndex + 1} / {$chatSearchStore.matches.length}
              </span>
            </SidebarGroupLabel>
            <SidebarGroupContent class="space-y-3">
              <div class="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="h-8"
                  onclick={handlePrev}
                >
                  <ArrowUp class="mr-1 h-3.5 w-3.5" /> Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="h-8"
                  onclick={handleNext}
                >
                  Next <ArrowDown class="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
              <p class="text-xs text-muted-foreground">
                Use these controls to jump between matches in the conversation.
              </p>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup class="space-y-3">
            <SidebarGroupLabel
              class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Results
            </SidebarGroupLabel>
            <SidebarGroupContent class="space-y-2">
              {@const previews = matchPreviews}
              {#if previews.length}
                <div class="space-y-2">
                  {#each previews as match (match.id)}
                    {@const isActive =
                      match.matchIndex === $chatSearchStore.activeMatchIndex}
                    <button
                      type="button"
                      class={`${matchButtonBaseClasses} ${
                        isActive ? activeMatchClasses : inactiveMatchClasses
                      }`}
                      data-active={isActive ? "true" : undefined}
                      aria-current={isActive ? "true" : undefined}
                      onclick={() => handleMatchSelect(match.matchIndex)}
                    >
                      <div
                        class="flex items-center justify-between text-xs text-muted-foreground"
                      >
                        <span class="font-semibold text-foreground">
                          {match.author}
                        </span>
                        {#if match.timestampLabel}
                          <time datetime={match.timestampIso ?? undefined}>
                            {match.timestampLabel}
                          </time>
                        {/if}
                      </div>
                      <p
                        class="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground"
                      >
                        {#each match.parts as part, index (index)}
                          {#if part.match}
                            <mark
                              class="rounded-sm bg-yellow-500/70 px-0.5 text-foreground"
                            >
                              {part.text}
                            </mark>
                          {:else}
                            {part.text}
                          {/if}
                        {/each}
                      </p>
                    </button>
                  {/each}
                </div>
                {#if $chatSearchStore.hasMore}
                  <div class="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      class="w-full"
                      onclick={loadMoreResults}
                      disabled={$chatSearchStore.loading}
                    >
                      {#if $chatSearchStore.loading && $chatSearchStore.pagesLoaded > 0}
                        <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
                        Loading more…
                      {:else}
                        Load more results
                      {/if}
                    </Button>
                  </div>
                {/if}
              {:else}
                <p class="text-xs text-muted-foreground">
                  Messages are still loading. Try again in a moment.
                </p>
              {/if}
            </SidebarGroupContent>
          </SidebarGroup>
        </div>
      {/if}
    </ScrollArea>
  </SidebarContent>
</div>
