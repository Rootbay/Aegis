<svelte:options runes={true} />

<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from "$lib/components/ui/avatar";
  import { cn } from "$lib/utils";
  import { Hash, MapPin, Users } from "@lucide/svelte";
  import type { Chat } from "$lib/features/chat/models/Chat";
  import type { User } from "$lib/features/auth/models/User";
  import { resolvePresenceStatusLabel } from "$lib/features/presence/statusPresets";

  let { chat, typingStatus, onAvatarClick, onNameClick, onNameDoubleClick } =
    $props<{
      chat: Chat;
      typingStatus: string;
      onAvatarClick: (event: MouseEvent, user: User) => void;
      onNameClick: (event: MouseEvent, user: User) => void;
      onNameDoubleClick: (user: User) => void;
    }>();

  const fallbackAvatar = (id: string) =>
    `https://api.dicebear.com/8.x/bottts-neutral/svg?seed=${id}`;

  const resolveFriendName = $derived(() => {
    if (chat.type !== "dm") {
      return "";
    }
    const nameValue = chat.friend.name ?? "";
    const trimmed = typeof nameValue === "string" ? nameValue.trim() : "";
    return trimmed.length > 0
      ? trimmed
      : `User-${chat.friend.id.slice(0, 4) || "anon"}`;
  });

  const resolveFriendAvatar = $derived(() => {
    if (chat.type !== "dm") {
      return "";
    }
    const avatarValue = chat.friend.avatar ?? "";
    const trimmed = typeof avatarValue === "string" ? avatarValue.trim() : "";
    return trimmed.length > 0 ? trimmed : fallbackAvatar(chat.friend.id);
  });

  const resolveFriendOnline = $derived(() =>
    chat.type === "dm" ? Boolean(chat.friend.online) : false,
  );

  const resolveFriendStatus = $derived(() => {
    if (chat.type !== "dm") {
      return null;
    }
    return resolvePresenceStatusLabel(chat.friend.statusMessage);
  });
</script>

<div class="flex items-center gap-3 min-w-0">
  {#if chat.type === "dm"}
    <Button
      variant="ghost"
      size="icon"
      class="relative rounded-full w-10 h-10 shrink-0"
      onclick={(event) => onAvatarClick(event, chat.friend)}
      aria-label="View profile picture"
    >
      <Avatar class="w-10 h-10">
        <AvatarImage src={resolveFriendAvatar()} alt={resolveFriendName()} />
        <AvatarFallback>{resolveFriendName()?.[0] ?? "?"}</AvatarFallback>
      </Avatar>
      <span
        class={cn(
          "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background",
          resolveFriendOnline() ? "bg-green-500" : "bg-red-500",
        )}
      ></span>
    </Button>
    <div class="leading-tight min-w-0">
      <button
        class="p-0 font-semibold text-left hover:underline cursor-pointer text-base truncate"
        onclick={(event) => onNameClick(event, chat.friend)}
        ondblclick={() => onNameDoubleClick(chat.friend)}
      >
        {resolveFriendName()}
      </button>
      <p class="text-xs text-muted-foreground whitespace-nowrap">
        {resolveFriendOnline() ? "Online" : "Offline"}
      </p>
      {#if resolveFriendStatus()}
        <p
          class="text-xs text-muted-foreground truncate"
          title={resolveFriendStatus() ?? undefined}
        >
          {resolveFriendStatus()}
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
      {#if typingStatus}
        <p class="text-xs text-cyan-400 whitespace-nowrap">{typingStatus}</p>
      {/if}
    </div>
  {:else if chat.type === "group"}
    <div class="flex items-center gap-2 min-w-0">
      <Users class="w-4 h-4 text-muted-foreground shrink-0" />
      <h2 class="font-semibold text-lg truncate">{chat.name}</h2>
    </div>
    {#if typingStatus}
      <p class="text-xs text-cyan-400 truncate">{typingStatus}</p>
    {/if}
  {:else}
    <div class="flex items-center gap-2 min-w-0">
      <Hash class="w-4 h-4 text-muted-foreground shrink-0" />
      <h2 class="font-semibold text-lg truncate">{chat.name}</h2>
    </div>
    {#if typingStatus}
      <p class="text-xs text-cyan-400 truncate">{typingStatus}</p>
    {/if}
  {/if}
</div>
