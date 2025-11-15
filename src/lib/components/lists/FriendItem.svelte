<svelte:options runes={true} />

<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { chatStore } from "$lib/features/chat/stores/chatStore";
  import { friendStore } from "$lib/features/friends/stores/friendStore";
  import { toasts } from "$lib/stores/ToastStore";
  import { userStore } from "$lib/stores/userStore";
  import {
    CircleCheck,
    MessageCircle,
    Ban,
    UserMinus,
    LockOpen,
    X,
    MapPin,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import type { Friend } from "$lib/features/friends/models/Friend";
  import { resolvePresenceStatusLabel } from "$lib/features/presence/statusPresets";

  type FriendStatus =
    | "pending"
    | "accepted"
    | "blocked"
    | "blocked_by_a"
    | "blocked_by_b"
    | "online"
    | "offline"
    | "";

  type FriendWithMeta = Friend & {
    status?: FriendStatus | string;
    relationshipStatus?: FriendStatus | string;
    friendshipId?: string;
    userId?: string;
    pfp?: string;
    pfpUrl?: string;
    avatarUrl?: string;
  };

  type FriendshipRecord = {
    id: string;
    user_a_id: string;
    user_b_id: string;
    status: string;
  };

  let { friend } = $props<{ friend: FriendWithMeta }>();

  type FriendActionState =
    | "message"
    | "accept"
    | "decline"
    | "remove"
    | "block"
    | "unblock";

  let actionInProgress = $state<FriendActionState | null>(null);
  let cachedFriendship = $state<FriendshipRecord | null>(null);
  let loadingFriendship = $state(false);
  const friendStatusLabel = $derived(resolvePresenceStatusLabel(friend.statusMessage));

  function getTargetUserId(): string | null {
    return friend.userId ?? friend.id ?? null;
  }

  const relationshipStatus = $derived(
    (friend.relationshipStatus ?? friend.status ?? "").toLowerCase(),
  );
  const isPending = $derived(relationshipStatus === "pending");
  const isBlocked = $derived(
    relationshipStatus === "blocked" ||
      relationshipStatus === "blocked_by_a" ||
      relationshipStatus === "blocked_by_b",
  );
  const displayStatus = $derived(
    (() => {
      if (isPending) return "Pending";
      if (isBlocked) return "Blocked";
      return friend.online ? "Online" : "Offline";
    })(),
  );
  const statusClass = $derived(
    (() => {
      switch (displayStatus) {
        case "Online":
          return "text-green-400";
        case "Offline":
          return "text-muted-foreground";
        case "Blocked":
          return "text-red-400";
        case "Pending":
          return "text-amber-300";
        default:
          return "text-muted-foreground";
      }
    })(),
  );
  const avatarSrc = $derived(
    friend.avatar ??
      friend.pfpUrl ??
      friend.pfp ??
      friend.avatarUrl ??
      (getTargetUserId()
        ? `https://api.dicebear.com/8.x/bottts-neutral/svg?seed=${getTargetUserId()}`
        : ""),
  );
  const displayName = $derived(
    friend.name ?? (friend as any).username ?? "Unknown Friend",
  );
  const friendTag = $derived(friend.tag);
  const currentUserId = $derived($userStore.me?.id ?? "");
  const canUnblock = $derived(
    (() => {
      if (!isBlocked || !currentUserId || !cachedFriendship) return false;
      if (relationshipStatus === "blocked") {
        return true;
      }
      if (relationshipStatus === "blocked_by_a") {
        return cachedFriendship.user_a_id === currentUserId;
      }
      if (relationshipStatus === "blocked_by_b") {
        return cachedFriendship.user_b_id === currentUserId;
      }
      return false;
    })(),
  );
  const blockedByOther = $derived(isBlocked && !canUnblock);
  $effect(() => {
    if ((isPending || isBlocked) && !cachedFriendship && !loadingFriendship) {
      loadFriendshipIfNeeded();
    }
  });

  onMount(() => {
    if ((isPending || isBlocked) && !cachedFriendship && !loadingFriendship) {
      loadFriendshipIfNeeded();
    }
  });

  async function loadFriendshipIfNeeded() {
    if (loadingFriendship || cachedFriendship) return;
    loadingFriendship = true;
    try {
      await ensureFriendship();
    } finally {
      loadingFriendship = false;
    }
  }

  async function ensureFriendship(): Promise<FriendshipRecord | null> {
    if (cachedFriendship?.id) {
      return cachedFriendship;
    }
    const meId = $userStore.me?.id;
    const targetId = getTargetUserId();
    if (!meId || !targetId) {
      toasts.addToast("Unable to resolve friendship details.", "error");
      return null;
    }
    try {
      const friendships: FriendshipRecord[] = await invoke("get_friendships", {
        current_user_id: meId,
      });
      const match =
        friendships.find((f) => f.id === friend.friendshipId) ||
        friendships.find(
          (f) =>
            (f.user_a_id === meId && f.user_b_id === targetId) ||
            (f.user_b_id === meId && f.user_a_id === targetId),
        );
      if (match) {
        cachedFriendship = match;
        return match;
      }
      toasts.addToast("Friendship not found.", "error");
      return null;
    } catch (error) {
      console.error("Failed to load friendship:", error);
      toasts.addToast("Failed to load friendship information.", "error");
      return null;
    }
  }

  async function refreshFriends() {
    try {
      await friendStore.initialize();
    } catch (error) {
      console.error("Failed to refresh friends:", error);
    } finally {
      cachedFriendship = null;
    }
  }

  type ToastTone = Parameters<typeof toasts.addToast>[1];

  type FriendActionOptions = {
    successMessage?: string;
    successTone?: ToastTone;
    errorMessage?: string;
    errorTone?: ToastTone;
    logPrefix?: string;
    refresh?: boolean;
  };

  async function performFriendAction(
    name: FriendActionState,
    executor: () => Promise<void | false>,
    options: FriendActionOptions = {},
  ) {
    if (actionInProgress) {
      return;
    }
    actionInProgress = name;
    try {
      const result = await executor();
      if (result === false) {
        return;
      }
      if (options.successMessage) {
        toasts.addToast(
          options.successMessage,
          options.successTone ?? "success",
        );
      }
      if (options.refresh) {
        await refreshFriends();
      }
    } catch (error) {
      console.error(
        options.logPrefix ?? `Failed to ${name} friend action:`,
        error,
      );
      toasts.addToast(
        options.errorMessage ?? `Failed to ${name} friend action.`,
        options.errorTone ?? "error",
      );
    } finally {
      actionInProgress = null;
    }
  }

  async function handleMessage() {
    await performFriendAction(
      "message",
      async () => {
        const targetId = getTargetUserId();
        if (!targetId) {
          toasts.addToast("Unable to open chat for this friend.", "error");
          return false;
        }
        await chatStore.setActiveChat(targetId, "dm");
      },
      {
        logPrefix: "Failed to open direct messages:",
        errorMessage: "Failed to open direct messages.",
      },
    );
  }

  async function handleAccept() {
    await performFriendAction(
      "accept",
      async () => {
        const friendship = await ensureFriendship();
        if (!friendship) {
          return false;
        }
        await invoke("accept_friend_request", { friendship_id: friendship.id });
      },
      {
        successMessage: "Friend request accepted.",
        refresh: true,
        errorMessage: "Failed to accept friend request.",
      },
    );
  }

  async function handleDecline() {
    await performFriendAction(
      "decline",
      async () => {
        const friendship = await ensureFriendship();
        if (!friendship) {
          return false;
        }
        await invoke("remove_friendship", { friendship_id: friendship.id });
      },
      {
        successMessage: "Friend request declined.",
        successTone: "info",
        refresh: true,
        errorMessage: "Failed to decline friend request.",
      },
    );
  }

  async function handleRemove() {
    await performFriendAction(
      "remove",
      async () => {
        const friendship = await ensureFriendship();
        if (!friendship) {
          return false;
        }
        await invoke("remove_friendship", { friendship_id: friendship.id });
      },
      {
        successMessage: "Friend removed.",
        successTone: "info",
        refresh: true,
        errorMessage: "Failed to remove friend.",
      },
    );
  }

  async function handleBlock() {
    await performFriendAction(
      "block",
      async () => {
        const meId = $userStore.me?.id;
        const targetId = getTargetUserId();
        if (!meId || !targetId) {
          toasts.addToast("Unable to block this user.", "error");
          return false;
        }
        await invoke("block_user", {
          current_user_id: meId,
          target_user_id: targetId,
        });
      },
      {
        successMessage: "User blocked.",
        refresh: true,
        errorMessage: "Failed to block user.",
      },
    );
  }

  async function handleUnblock() {
    await performFriendAction(
      "unblock",
      async () => {
        const friendship = await ensureFriendship();
        if (!friendship) {
          return false;
        }
        const meId = $userStore.me?.id;
        const status = friendship.status?.toLowerCase?.() ?? "";
        const isBlocker =
          status === "blocked" ||
          (status === "blocked_by_a" && friendship.user_a_id === meId) ||
          (status === "blocked_by_b" && friendship.user_b_id === meId);
        if (!isBlocker) {
          toasts.addToast("This user has blocked you.", "error");
          return false;
        }
        await invoke("unblock_user", {
          current_user_id: meId,
          friendship_id: friendship.id,
        });
      },
      {
        successMessage: "User unblocked.",
        refresh: true,
        errorMessage: "Failed to unblock user.",
      },
    );
  }
</script>

<div
  class="flex items-center gap-3 py-2 px-3 border-b border-zinc-800 last:border-b-0 w-full"
>
  <div class="relative">
    {#if avatarSrc}
      <img
        src={avatarSrc}
        alt={displayName}
        class="w-10 h-10 rounded-full object-cover"
      />
    {:else}
      <div class="w-10 h-10 rounded-full bg-zinc-700"></div>
    {/if}
    {#if friend.online}
      <span
        class="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-zinc-900 bg-green-500"
      ></span>
    {/if}
  </div>
  <div class="flex flex-col grow overflow-hidden">
    <div class="flex items-center gap-2">
      <p class="font-semibold truncate">{displayName}</p>
      {#if friendTag}
        <span class="text-xs text-muted-foreground">{friendTag}</span>
      {/if}
    </div>
    <p class={`text-xs ${statusClass}`}>{displayStatus}</p>
    {#if friendStatusLabel}
      <p
        class="text-xs text-muted-foreground truncate"
        title={friendStatusLabel}
      >
        {friendStatusLabel}
      </p>
    {/if}
    {#if friend.location}
      <p
        class="text-xs text-muted-foreground flex items-center gap-1"
        title={friend.location}
      >
        <MapPin class="w-3 h-3" />
        <span class="truncate">{friend.location}</span>
      </p>
    {/if}
  </div>
  <div class="flex items-center gap-2">
    {#if isPending}
      <Button
        size="sm"
        onclick={handleAccept}
        disabled={actionInProgress === "accept"}
        aria-busy={actionInProgress === "accept"}
      >
        <CircleCheck class="size-4" /> Accept
      </Button>
      <Button
        size="sm"
        variant="outline"
        onclick={handleDecline}
        disabled={actionInProgress === "decline"}
        aria-busy={actionInProgress === "decline"}
      >
        <X class="size-4" /> Decline
      </Button>
    {:else if isBlocked}
      {#if canUnblock}
        <Button
          size="sm"
          variant="secondary"
          onclick={handleUnblock}
          disabled={actionInProgress === "unblock"}
          aria-busy={actionInProgress === "unblock"}
        >
          <LockOpen class="size-4" /> Unblock
        </Button>
      {/if}
      <Button
        size="sm"
        variant="outline"
        onclick={handleRemove}
        disabled={actionInProgress === "remove"}
        aria-busy={actionInProgress === "remove"}
      >
        <UserMinus class="size-4" /> Remove
      </Button>
      {#if blockedByOther}
        <span class="text-xs text-muted-foreground">Blocked by this user</span>
      {/if}
    {:else}
      <Button
        size="sm"
        onclick={handleMessage}
        disabled={actionInProgress === "message"}
        aria-busy={actionInProgress === "message"}
      >
        <MessageCircle class="size-4" /> Message
      </Button>
      <Button
        size="sm"
        variant="outline"
        onclick={handleRemove}
        disabled={actionInProgress === "remove"}
        aria-busy={actionInProgress === "remove"}
      >
        <UserMinus class="size-4" /> Remove
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onclick={handleBlock}
        disabled={actionInProgress === "block"}
        aria-busy={actionInProgress === "block"}
      >
        <Ban class="size-4" /> Block
      </Button>
    {/if}
  </div>
</div>
