<svelte:options runes={true} />

<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { chatStore } from '$lib/stores/chatStore';
  import { friendStore } from '$lib/stores/friendStore';
  import { toasts } from '$lib/stores/ToastStore';
  import { userStore } from '$lib/stores/userStore';
  import { CircleCheck, MessageCircle, Ban, UserMinus, Unlock, X } from '@lucide/svelte';
  import type { Friend } from '$lib/models/Friend';

  type FriendStatus =
    | 'pending'
    | 'accepted'
    | 'blocked'
    | 'blocked_by_a'
    | 'blocked_by_b'
    | 'online'
    | 'offline'
    | '';

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

  let actionInProgress = $state<'message' | 'accept' | 'decline' | 'remove' | 'block' | 'unblock' | null>(null);
  let cachedFriendship = $state<FriendshipRecord | null>(null);
  let loadingFriendship = $state(false);

  function getTargetUserId(): string | null {
    return friend.userId ?? friend.id ?? null;
  }

  const relationshipStatus = $derived((friend.relationshipStatus ?? friend.status ?? '').toLowerCase());
  const isPending = $derived(relationshipStatus === 'pending');
  const isBlocked = $derived(
    relationshipStatus === 'blocked' ||
    relationshipStatus === 'blocked_by_a' ||
    relationshipStatus === 'blocked_by_b'
  );
  const displayStatus = $derived((() => {
    if (isPending) return 'Pending';
    if (isBlocked) return 'Blocked';
    return friend.online ? 'Online' : 'Offline';
  })());
  const statusClass = $derived((() => {
    switch (displayStatus) {
      case 'Online':
        return 'text-green-400';
      case 'Offline':
        return 'text-muted-foreground';
      case 'Blocked':
        return 'text-red-400';
      case 'Pending':
        return 'text-amber-300';
      default:
        return 'text-muted-foreground';
    }
  })());
  const avatarSrc = $derived(
    friend.avatar ??
    friend.pfpUrl ??
    friend.pfp ??
    friend.avatarUrl ??
    (getTargetUserId() ? `https://api.dicebear.com/8.x/bottts-neutral/svg?seed=${getTargetUserId()}` : '')
  );
  const displayName = $derived(friend.name ?? (friend as any).username ?? 'Unknown Friend');
  const friendTag = $derived(friend.tag);
  const currentUserId = $derived($userStore.me?.id ?? '');
  const canUnblock = $derived((() => {
    if (!isBlocked || !currentUserId || !cachedFriendship) return false;
    if (relationshipStatus === 'blocked') {
      return true;
    }
    if (relationshipStatus === 'blocked_by_a') {
      return cachedFriendship.user_a_id === currentUserId;
    }
    if (relationshipStatus === 'blocked_by_b') {
      return cachedFriendship.user_b_id === currentUserId;
    }
    return false;
  })());
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
      toasts.addToast('Unable to resolve friendship details.', 'error');
      return null;
    }
    try {
      const friendships: FriendshipRecord[] = await invoke('get_friendships', { current_user_id: meId });
      const match = friendships.find(f => f.id === friend.friendshipId) || friendships.find(
        f =>
          (f.user_a_id === meId && f.user_b_id === targetId) ||
          (f.user_b_id === meId && f.user_a_id === targetId)
      );
      if (match) {
        cachedFriendship = match;
        return match;
      }
      toasts.addToast('Friendship not found.', 'error');
      return null;
    } catch (error) {
      console.error('Failed to load friendship:', error);
      toasts.addToast('Failed to load friendship information.', 'error');
      return null;
    }
  }

  async function refreshFriends() {
    try {
      await friendStore.initialize();
    } catch (error) {
      console.error('Failed to refresh friends:', error);
    } finally {
      cachedFriendship = null;
    }
  }

  async function handleMessage() {
    if (actionInProgress) return;
    const targetId = getTargetUserId();
    if (!targetId) {
      toasts.addToast('Unable to open chat for this friend.', 'error');
      return;
    }
    actionInProgress = 'message';
    try {
      await chatStore.setActiveChat(targetId, 'dm');
    } catch (error) {
      console.error('Failed to open direct messages:', error);
      toasts.addToast('Failed to open direct messages.', 'error');
    } finally {
      actionInProgress = null;
    }
  }

  async function handleAccept() {
    if (actionInProgress) return;
    actionInProgress = 'accept';
    try {
      const friendship = await ensureFriendship();
      if (!friendship) return;
      await invoke('accept_friend_request', { friendship_id: friendship.id });
      toasts.addToast('Friend request accepted.', 'success');
      await refreshFriends();
    } catch (error) {
      console.error('Failed to accept friend request:', error);
      toasts.addToast('Failed to accept friend request.', 'error');
    } finally {
      actionInProgress = null;
    }
  }

  async function handleDecline() {
    if (actionInProgress) return;
    actionInProgress = 'decline';
    try {
      const friendship = await ensureFriendship();
      if (!friendship) return;
      await invoke('remove_friendship', { friendship_id: friendship.id });
      toasts.addToast('Friend request declined.', 'info');
      await refreshFriends();
    } catch (error) {
      console.error('Failed to decline friend request:', error);
      toasts.addToast('Failed to decline friend request.', 'error');
    } finally {
      actionInProgress = null;
    }
  }

  async function handleRemove() {
    if (actionInProgress) return;
    actionInProgress = 'remove';
    try {
      const friendship = await ensureFriendship();
      if (!friendship) return;
      await invoke('remove_friendship', { friendship_id: friendship.id });
      toasts.addToast('Friend removed.', 'info');
      await refreshFriends();
    } catch (error) {
      console.error('Failed to remove friend:', error);
      toasts.addToast('Failed to remove friend.', 'error');
    } finally {
      actionInProgress = null;
    }
  }

  async function handleBlock() {
    if (actionInProgress) return;
    const meId = $userStore.me?.id;
    const targetId = getTargetUserId();
    if (!meId || !targetId) {
      toasts.addToast('Unable to block this user.', 'error');
      return;
    }
    actionInProgress = 'block';
    try {
      await invoke('block_user', { current_user_id: meId, target_user_id: targetId });
      toasts.addToast('User blocked.', 'success');
      await refreshFriends();
    } catch (error) {
      console.error('Failed to block user:', error);
      toasts.addToast('Failed to block user.', 'error');
    } finally {
      actionInProgress = null;
    }
  }

  async function handleUnblock() {
    if (actionInProgress) return;
    actionInProgress = 'unblock';
    try {
      const friendship = await ensureFriendship();
      if (!friendship) return;
      const meId = $userStore.me?.id;
      const status = friendship.status?.toLowerCase?.() ?? '';
      const isBlocker =
        status === 'blocked' ||
        (status === 'blocked_by_a' && friendship.user_a_id === meId) ||
        (status === 'blocked_by_b' && friendship.user_b_id === meId);
      if (!isBlocker) {
        toasts.addToast('This user has blocked you.', 'error');
        return;
      }
      await invoke('unblock_user', { friendship_id: friendship.id });
      toasts.addToast('User unblocked.', 'success');
      await refreshFriends();
    } catch (error) {
      console.error('Failed to unblock user:', error);
      toasts.addToast('Failed to unblock user.', 'error');
    } finally {
      actionInProgress = null;
    }
  }
</script>

<div class="flex items-center gap-3 py-2 px-3 border-b border-zinc-800 last:border-b-0 w-full">
  <div class="relative">
    {#if avatarSrc}
      <img src={avatarSrc} alt={displayName} class="w-10 h-10 rounded-full object-cover" />
    {:else}
      <div class="w-10 h-10 rounded-full bg-zinc-700"></div>
    {/if}
    {#if friend.online}
      <span class="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-zinc-900 bg-green-500"></span>
    {/if}
  </div>
  <div class="flex flex-col flex-grow overflow-hidden">
    <div class="flex items-center gap-2">
      <p class="font-semibold truncate">{displayName}</p>
      {#if friendTag}
        <span class="text-xs text-muted-foreground">{friendTag}</span>
      {/if}
    </div>
    <p class={`text-xs ${statusClass}`}>{displayStatus}</p>
  </div>
  <div class="flex items-center gap-2">
    {#if isPending}
      <button
        class="px-2 py-1 text-xs rounded-md bg-green-600 hover:bg-green-500 flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
        onclick={handleAccept}
        disabled={actionInProgress === 'accept'}
      >
        <CircleCheck size={14} /> Accept
      </button>
      <button
        class="px-2 py-1 text-xs rounded-md bg-zinc-700 hover:bg-zinc-600 flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
        onclick={handleDecline}
        disabled={actionInProgress === 'decline'}
      >
        <X size={14} /> Decline
      </button>
    {:else if isBlocked}
      {#if canUnblock}
        <button
          class="px-2 py-1 text-xs rounded-md bg-amber-600 hover:bg-amber-500 flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
          onclick={handleUnblock}
          disabled={actionInProgress === 'unblock'}
        >
          <Unlock size={14} /> Unblock
        </button>
      {/if}
      <button
        class="px-2 py-1 text-xs rounded-md bg-zinc-700 hover:bg-zinc-600 flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
        onclick={handleRemove}
        disabled={actionInProgress === 'remove'}
      >
        <UserMinus size={14} /> Remove
      </button>
      {#if blockedByOther}
        <span class="text-xs text-muted-foreground">Blocked by this user</span>
      {/if}
    {:else}
      <button
        class="px-2 py-1 text-xs rounded-md bg-cyan-600 hover:bg-cyan-500 flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
        onclick={handleMessage}
        disabled={actionInProgress === 'message'}
      >
        <MessageCircle size={14} /> Message
      </button>
      <button
        class="px-2 py-1 text-xs rounded-md bg-zinc-700 hover:bg-zinc-600 flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
        onclick={handleRemove}
        disabled={actionInProgress === 'remove'}
      >
        <UserMinus size={14} /> Remove
      </button>
      <button
        class="px-2 py-1 text-xs rounded-md bg-red-600 hover:bg-red-500 flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
        onclick={handleBlock}
        disabled={actionInProgress === 'block'}
      >
        <Ban size={14} /> Block
      </button>
    {/if}
  </div>
</div>



