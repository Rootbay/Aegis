<script lang="ts">
  import { ArrowDown, ArrowUp, Search as SearchIcon, X } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import {
    Sidebar,
    SidebarHeader,
    SidebarContent,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
  } from "$lib/components/ui/sidebar";
  import { chatSearchStore } from "$lib/features/chat/stores/chatSearchStore";
  import { activeChannelId, messagesByChatId } from "$lib/features/chat/stores/chatStore";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { userStore } from "$lib/stores/userStore";
  import type { Message } from "$lib/features/chat/models/Message";
  import type { User } from "$lib/features/auth/models/User";
  import {
    highlightText,
    type HighlightPart,
  } from "$lib/features/chat/utils/highlightText";

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

  const memberLookup = $derived(() => {
    const map = new Map<string, User>();
    const activeServerId = $serverStore.activeServerId;
    if (activeServerId) {
      const server = $serverStore.servers.find((s) => s.id === activeServerId);
      server?.members?.forEach((member) => {
        map.set(member.id, member);
      });
    }
    const me = $userStore.me;
    if (me) {
      map.set(me.id, me);
    }
    return map;
  });

  const channelMessages = $derived(() => {
    const channelId = $activeChannelId;
    if (!channelId) return [] as Message[];
    return ($messagesByChatId.get(channelId) ?? []) as Message[];
  });

  const matchPreviews = $derived(() => {
    const matches = $chatSearchStore.matches;
    if (!matches.length) return [] as MatchPreview[];
    const query = $chatSearchStore.query;
    const messages = channelMessages;
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
</script>

<Sidebar class="hidden lg:flex" aria-label="Search results">
  <SidebarHeader class="px-4 py-3">
    <div class="flex items-center justify-between">
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
  <SidebarContent class="flex">
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
                {$chatSearchStore.activeMatchIndex + 1} / {$chatSearchStore
                  .matches.length}
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
            <SidebarGroupLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Results
            </SidebarGroupLabel>
            <SidebarGroupContent class="space-y-2">
              {#if matchPreviews.length}
                <div class="space-y-2">
                  {#each matchPreviews as match (match.id)}
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
                      <div class="flex items-center justify-between text-xs text-muted-foreground">
                        <span class="font-semibold text-foreground">
                          {match.author}
                        </span>
                        {#if match.timestampLabel}
                          <time datetime={match.timestampIso ?? undefined}>
                            {match.timestampLabel}
                          </time>
                        {/if}
                      </div>
                      <p class="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                        {#each match.parts as part, index (index)}
                          {#if part.match}
                            <mark class="rounded-sm bg-yellow-500/70 px-0.5 text-foreground">
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
</Sidebar>
