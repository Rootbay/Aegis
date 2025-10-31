<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import type { Friend } from "$lib/features/friends/models/Friend";
  import { friendStore } from "$lib/features/friends/stores/friendStore";
  import { mutedFriendsStore } from "$lib/features/friends/stores/mutedFriendsStore";
  import { userStore } from "$lib/stores/userStore";
  import { Plus, Users } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import { formatTimestamp } from "$lib/utils/time";
  import { toasts } from "$lib/stores/ToastStore";
  import {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
  } from "$lib/components/ui/context-menu";
  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
  } from "$lib/components/ui/dialog";
  import {
    Avatar,
    AvatarImage,
    AvatarFallback,
  } from "$lib/components/ui/avatar";
  import { Badge } from "$lib/components/ui/badge";
  import type { DirectMessageListEntry } from "$lib/features/chat/stores/directMessageRoster";
  import {
    computeSearchResults,
    type SearchResults,
  } from "./directMessageSearch";

  type SelectChatHandler = (
    chatId: string | null,
    type?: "dm" | "group",
  ) => void;

  let {
    entries = [],
    activeChatId = null,
    onSelect,
    onCreateGroupClick,
  }: {
    entries?: DirectMessageListEntry[];
    activeChatId?: string | null;
    onSelect: SelectChatHandler;
    onCreateGroupClick: () => void;
  } = $props();

  let showSearch = $state(false);
  let searchTerm = $state("");
  const timestampToNumber = (value: string | null | undefined) => {
    if (!value) {
      return Number.NEGATIVE_INFINITY;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
  };

  let sortedEntries = $derived(() => {
    const list = [...entries];
    list.sort((a, b) => {
      const diff =
        timestampToNumber(b.lastActivityAt) -
        timestampToNumber(a.lastActivityAt);
      if (diff !== 0) {
        return diff;
      }
      return a.name.localeCompare(b.name);
    });
    return list;
  });

  let dmEntries = $derived(
    sortedEntries.filter((entry) => entry.type === "dm" && entry.friend),
  );

  let searchResults = $derived<SearchResults>(() =>
    computeSearchResults(sortedEntries, searchTerm),
  );

  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      showSearch = true;
    } else if (e.key === "Escape") {
      showSearch = false;
      searchTerm = "";
    }
  }

  function handleContextItem(
    action: "open" | "mute" | "remove",
    entryId: string,
  ) {
    const item = dmEntries.find((entry) => entry.id === entryId)?.friend;
    if (!item) return;
    if (action === "open") onSelect(entryId, "dm");
    if (action === "mute") {
      toggleMute(item);
    }
    if (action === "remove") removeFriend(item);
  }

  async function toggleMute(friend: Friend) {
    const meId = $userStore.me?.id;
    if (!meId) {
      toasts.addToast("You must be signed in to mute conversations.", "error");
      return;
    }

    const currentlyMuted = mutedFriendsStore.isMuted(friend.id);
    try {
      await invoke("mute_user", {
        current_user_id: meId,
        target_user_id: friend.id,
        muted: !currentlyMuted,
        spam_score: null,
      });

      if (currentlyMuted) {
        mutedFriendsStore.unmute(friend.id);
        toasts.addToast("Conversation unmuted.", "success");
      } else {
        mutedFriendsStore.mute(friend.id);
        toasts.addToast("Conversation muted.", "success");
      }
    } catch (error: any) {
      console.error("Failed to toggle mute:", error);
      toasts.addToast(
        error?.message ?? "Failed to update mute status.",
        "error",
      );
    }
  }

  async function removeFriend(friend: Friend) {
    const meId = $userStore.me?.id;
    if (!meId) {
      toasts.addToast("You must be signed in to remove friends.", "error");
      return;
    }
    const usesFallbackId = friend.friendshipId == null;
    const friendshipId = usesFallbackId ? friend.id : friend.friendshipId;
    if (!friendshipId) {
      toasts.addToast("Unable to determine friendship identifier.", "error");
      return;
    }
    try {
      await invoke("remove_friendship", { friendship_id: friendshipId });
      friendStore.removeFriend(friend.id);
      mutedFriendsStore.unmute(friend.id);
      toasts.addToast("Friend removed.", "success");
      await friendStore.initialize();
    } catch (error) {
      console.error("Failed to remove friend:", error);
      toasts.addToast(
        (error as any)?.message ?? "Failed to remove friend.",
        "error",
      );
    }
  }

  onMount(() => {
    if (browser) {
      window.addEventListener("keydown", handleKeydown);
    }
  });

  onDestroy(() => {
    if (browser) {
      window.removeEventListener("keydown", handleKeydown);
    }
  });
</script>

<div class="w-80 bg-card/50 flex flex-col border-r border-border">
  <header class="h-[55px] px-4 flex items-center border-b border-border">
    <Button
      variant="ghost"
      class="text-xl font-bold px-0 justify-start w-full"
      onclick={() => onSelect(null)}
    >
      Friends
    </Button>
  </header>

  <div class="p-4 pt-3">
    <Button
      variant="secondary"
      class="w-full justify-start bg-card text-muted-foreground cursor-pointer"
      onclick={() => (showSearch = true)}
    >
      Search (Ctrl+K)
    </Button>

    <div class="flex items-center justify-between mt-4 mb-2">
      <h2 class="text-sm font-semibold text-muted-foreground">
        Direct Messages
      </h2>
      <Button
        size="icon"
        variant="ghost"
        class="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
        onclick={onCreateGroupClick}
        aria-label="Create group"
      >
        <Plus size={12} />
      </Button>
    </div>
    <Separator />
  </div>

  <ScrollArea class="flex-1 px-2">
    {#if sortedEntries.length === 0}
      <div class="text-center p-6 text-muted-foreground">
        <p>No conversations yet.</p>
        <p class="text-sm">
          Click the ‘+’ icon to create a group or start a new conversation.
        </p>
      </div>
    {:else}
      <div class="space-y-1 pb-4">
        {#each sortedEntries as entry (entry.id)}
          {#if entry.type === "dm" && entry.friend}
            {@const timestampLabel = formatTimestamp(entry.lastActivityAt, {
              fallback: null,
            })}
            <ContextMenu>
              <ContextMenuTrigger>
                <Button
                  variant="ghost"
                  class="w-full justify-start gap-3 py-2 pl-2 pr-4 rounded-md hover:bg-muted/50 data-[active=true]:bg-muted"
                  data-active={activeChatId === entry.id}
                  onclick={() => onSelect(entry.id, "dm")}
                >
                  <div class="relative">
                    <Avatar class="h-10 w-10">
                      <AvatarImage src={entry.avatar} alt={entry.name} />
                      <AvatarFallback class="uppercase"
                        >{entry.name?.[0]}</AvatarFallback
                      >
                    </Avatar>
                    {#if entry.friend.online}
                      <span
                        class="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-background"
                      ></span>
                    {/if}
                  </div>

                  <div class="min-w-0 flex-1">
                    <div class="flex items-baseline justify-between gap-2">
                      <p class="font-semibold truncate">{entry.name}</p>
                      {#if timestampLabel}
                        <p class="shrink-0 text-xs text-muted-foreground">
                          {timestampLabel}
                        </p>
                      {/if}
                    </div>
                    <div class="mt-1 flex items-center gap-2">
                      <p class="text-xs text-muted-foreground truncate flex-1">
                        {entry.lastMessageText ?? "No messages yet"}
                      </p>
                      {#if entry.unreadCount > 0}
                        <Badge
                          class="ml-auto shrink-0 bg-primary/10 text-primary border border-primary/20 px-2 py-0 text-[11px]"
                        >
                          {entry.unreadCount > 99 ? "99+" : entry.unreadCount}
                        </Badge>
                      {/if}
                    </div>
                  </div>
                </Button>
              </ContextMenuTrigger>

              <ContextMenuContent class="w-48">
                <ContextMenuItem
                  onselect={() => handleContextItem("open", entry.id)}
                  >Open Chat</ContextMenuItem
                >
                <ContextMenuSeparator />
                <ContextMenuItem
                  onselect={() => handleContextItem("mute", entry.id)}
                  >Mute</ContextMenuItem
                >
                <ContextMenuItem
                  onselect={() => handleContextItem("remove", entry.id)}
                  class="text-destructive"
                >
                  Remove
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          {:else if entry.type === "group"}
            {@const timestampLabel = formatTimestamp(entry.lastActivityAt, {
              fallback: null,
            })}
            {@const memberCount =
              entry.memberCount ?? entry.memberIds?.length ?? 0}
            <Button
              variant="ghost"
              class="w-full justify-start gap-3 py-2 pl-2 pr-4 rounded-md hover:bg-muted/50 data-[active=true]:bg-muted"
              data-active={activeChatId === entry.id}
              onclick={() => onSelect(entry.id, "group")}
            >
              <div
                class="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <Users size={16} />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline justify-between gap-2">
                  <p class="font-semibold truncate">{entry.name}</p>
                  {#if timestampLabel}
                    <p class="shrink-0 text-xs text-muted-foreground">
                      {timestampLabel}
                    </p>
                  {/if}
                </div>
                <div class="mt-1 flex items-center gap-2">
                  <p class="text-xs text-muted-foreground truncate flex-1">
                    {entry.lastMessageText ??
                      `${memberCount} member${memberCount === 1 ? "" : "s"}`}
                  </p>
                  {#if entry.unreadCount > 0}
                    <Badge
                      class="ml-auto shrink-0 bg-primary/10 text-primary border border-primary/20 px-2 py-0 text-[11px]"
                    >
                      {entry.unreadCount > 99 ? "99+" : entry.unreadCount}
                    </Badge>
                  {/if}
                </div>
              </div>
            </Button>
          {/if}
        {/each}
      </div>
    {/if}
  </ScrollArea>

  <Dialog bind:open={showSearch}>
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Search</DialogTitle>
      </DialogHeader>

      <div class="space-y-3">
        <Input bind:value={searchTerm} placeholder="Search conversations..." />

        <ScrollArea class="max-h-60">
          {@const results: SearchResults =
            searchResults ?? { dms: [], groups: [] }}
          {@const totalResults =
            (results.dms?.length ?? 0) + (results.groups?.length ?? 0)}
          {#if totalResults > 0}
            <div class="space-y-4">
              {#if (results.dms?.length ?? 0) > 0}
                <div class="space-y-2">
                  <p class="px-2 text-xs font-semibold text-muted-foreground">
                    Direct Messages
                  </p>
                  {#each results.dms ?? [] as item (item.id)}
                    {@const friend = item.friend}
                    {#if friend}
                      <Button
                        variant="ghost"
                        class="w-full justify-start gap-3 p-2 rounded-md hover:bg-muted/50"
                        onclick={() => {
                          onSelect(item.id, "dm");
                          showSearch = false;
                          searchTerm = "";
                        }}
                      >
                        <div class="relative">
                          <Avatar class="h-10 w-10">
                            <AvatarImage
                              src={friend.avatar}
                              alt={friend.name}
                            />
                            <AvatarFallback class="uppercase"
                              >{friend.name?.[0]}</AvatarFallback
                            >
                          </Avatar>
                          {#if friend.online}
                            <span
                              class="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background"
                            ></span>
                          {/if}
                        </div>
                        <div class="min-w-0 flex-1">
                          <p class="font-semibold truncate">{friend.name}</p>
                          <p class="text-xs text-muted-foreground">
                            Direct Message
                          </p>
                        </div>
                      </Button>
                    {/if}
                  {/each}
                </div>
              {/if}

              {#if (results.groups?.length ?? 0) > 0}
                <div class="space-y-2">
                  <p class="px-2 text-xs font-semibold text-muted-foreground">
                    Group Chats
                  </p>
                  {#each results.groups ?? [] as item (item.id)}
                    {@const memberCount =
                      item.memberCount ?? item.memberIds?.length ?? 0}
                    <Button
                      variant="ghost"
                      class="w-full justify-start gap-3 p-2 rounded-md hover:bg-muted/50"
                      onclick={() => {
                        onSelect(item.id, "group");
                        showSearch = false;
                        searchTerm = "";
                      }}
                    >
                      <div
                        class="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
                      >
                        <Users size={16} />
                      </div>
                      <div class="min-w-0 flex-1">
                        <p class="font-semibold truncate">{item.name}</p>
                        <p class="text-xs text-muted-foreground">
                          {memberCount > 0
                            ? `${memberCount} member${memberCount === 1 ? "" : "s"}`
                            : "Group Chat"}
                        </p>
                      </div>
                    </Button>
                  {/each}
                </div>
              {/if}
            </div>
          {:else if searchTerm.length > 0}
            <p class="text-center text-muted-foreground">
              No results found for “{searchTerm}”.
            </p>
          {:else}
            <p class="text-center text-muted-foreground">
              Start typing to search for conversations.
            </p>
          {/if}
        </ScrollArea>
      </div>
    </DialogContent>
  </Dialog>
</div>
