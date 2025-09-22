<svelte:options runes={true} />

<script lang="ts">
  import { tick, getContext } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Avatar, AvatarImage, AvatarFallback } from "$lib/components/ui/avatar";
  import { cn } from "$lib/utils";
  import { chatSearchStore } from "$lib/features/chat/stores/chatSearchStore";
  import { CREATE_GROUP_CONTEXT_KEY } from "$lib/contextKeys";
  import type { CreateGroupContext } from "$lib/contextTypes";
  import type { Chat } from "$lib/features/chat/models/Chat";
  import type { User } from "$lib/features/auth/models/User";
  import {
    ChevronDown,
    ChevronUp,
    EllipsisVertical,
    Hash,
    Phone,
    Search,
    Video,
    X,
  } from "@lucide/svelte";

  type OpenProfileHandler = (user: User) => void; // eslint-disable-line no-unused-vars

  let { chat, onOpenDetailedProfile } = $props<{
    chat: Chat | null;
    onOpenDetailedProfile: OpenProfileHandler;
  }>();

  const context = getContext<CreateGroupContext | undefined>(CREATE_GROUP_CONTEXT_KEY);
  const openUserCardModal = context?.openUserCardModal;

  async function focusSearchInput() {
    await tick();
    const input = document.querySelector(".chat-search-input") as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }

  function handleOpenSearch() {
    chatSearchStore.open();
    focusSearchInput();
  }

  function handleSearchInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    chatSearchStore.setQuery(target.value);
  }

  function handleCloseSearch() {
    chatSearchStore.clearSearch();
    chatSearchStore.close();
  }

  function handleJump(next: boolean) {
    chatSearchStore.jumpToMatch(next);
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

  $effect(() => {
    if (!chat) {
      chatSearchStore.reset();
    }
  });
</script>

{#if chat}
  <header class="h-[55px] border-b border-border px-4 flex items-center justify-between bg-card">
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
              chat.friend.online ? "bg-green-500" : "bg-red-500"
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
        </div>
      {:else}
        <div class="flex items-center gap-2 min-w-0">
          <Hash class="w-4 h-4 text-muted-foreground shrink-0" />
          <h2 class="font-semibold text-lg truncate">{chat.name}</h2>
        </div>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      {#if chat.type === "dm"}
        <Button variant="ghost" size="icon" aria-label="Start voice call">
          <Phone class="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Start video call">
          <Video class="w-4 h-4" />
        </Button>
      {/if}
      {#if $chatSearchStore.open}
        <div class="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
          <Input
            class="h-6 text-sm border-none bg-transparent focus-visible:ring-0 w-40 chat-search-input"
            placeholder="Search in chat"
            value={$chatSearchStore.query}
            oninput={handleSearchInput}
          />
          <span class="text-xs text-muted-foreground">
            {$chatSearchStore.matches.length
              ? `${$chatSearchStore.activeMatchIndex + 1}/${$chatSearchStore.matches.length}`
              : "0/0"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6"
            onclick={() => handleJump(false)}
            aria-label="Previous match"
            disabled={!$chatSearchStore.matches.length}
          >
            <ChevronUp class="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6"
            onclick={() => handleJump(true)}
            aria-label="Next match"
            disabled={!$chatSearchStore.matches.length}
          >
            <ChevronDown class="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6"
            onclick={handleCloseSearch}
            aria-label="Close search"
          >
            <X class="w-4 h-4" />
          </Button>
        </div>
      {:else}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open search"
          onclick={handleOpenSearch}
        >
          <Search class="w-4 h-4" />
        </Button>
      {/if}
      <Button variant="ghost" size="icon" aria-label="More options">
        <EllipsisVertical class="w-4 h-4" />
      </Button>

        <div class="w-[240px]">
        <Input
            class="h-8 text-sm w-full chat-search-input"
            placeholder="Search in chat"
            value={$chatSearchStore.query}
            oninput={handleSearchInput}
        />
        </div>
    </div>
  </header>
{:else}
  <header class="h-[55px] border-b border-border px-4 flex items-center bg-card text-sm text-muted-foreground">
    Select a chat to get started.
  </header>
{/if}

