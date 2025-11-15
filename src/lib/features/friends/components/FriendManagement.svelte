<script lang="ts">
  import { get } from "svelte/store";
  import { invoke } from "@tauri-apps/api/core";
  import { userStore } from "$lib/stores/userStore";
  import { toasts } from "$lib/stores/ToastStore";
  import { friendStore } from "$lib/features/friends/stores/friendStore";
  import { mutedFriendsStore } from "$lib/features/friends/stores/mutedFriendsStore";
  import type { Friend } from "$lib/features/friends/models/Friend";
  import FriendRequestModal from "$lib/components/modals/FriendRequestModal.svelte";
  import { Button } from "$lib/components/ui/button/index.js";

  let friendships = $state<any[]>([]);
  let showFriendRequestModal = $state(false);

  let currentUser = $derived($userStore.me);
  let friendState = $derived($friendStore);
  let flaggedFriends = $derived(
    friendState.friends.filter((friend) => friend.isSpamFlagged),
  );

  function findFriendByFriendship(friendshipId: string) {
    if (!friendshipId) return null;
    return (
      friendState.friends.find(
        (friend) => friend.friendshipId === friendshipId,
      ) ?? null
    );
  }

  async function allowFlaggedFriend(friend: Friend) {
    if (!friend) return;
    friendStore.markFriendAsTrusted(friend.id);
    mutedFriendsStore.unmute(friend.id);

    const meId = $userStore.me?.id;
    if (meId) {
      try {
        await invoke("mute_user", {
          current_user_id: meId,
          target_user_id: friend.id,
          muted: false,
          spam_score: friend.spamScore ?? null,
        });
      } catch (error) {
        console.debug("mute_user logging failed", error);
      }
    }

    toasts.addToast(`Allowing messages from ${friend.name}.`, "success");
  }

  async function keepFriendMuted(friend: Friend) {
    if (!friend) return;
    mutedFriendsStore.mute(friend.id);
    friendStore.markFriendAsSpam(friend.id, {
      score: friend.spamScore,
      reasons: friend.spamReasons,
    });

    const meId = $userStore.me?.id;
    if (meId) {
      try {
        await invoke("mute_user", {
          current_user_id: meId,
          target_user_id: friend.id,
          muted: true,
          spam_score: friend.spamScore ?? null,
        });
      } catch (error) {
        console.debug("mute_user logging failed", error);
      }
    }

    toasts.addToast(`${friend.name} will remain muted.`, "info");
  }

  async function loadFriendships() {
    if (currentUser && currentUser.id) {
      try {
        friendships = await invoke("get_friendships", {
          current_user_id: currentUser.id,
          currentUserId: currentUser.id,
        });
      } catch (error) {
        console.error("Error loading friendships:", error);
        toasts.showErrorToast(`Error loading friendships: ${error}`);
      }
    }
  }

  async function acceptFriendRequest(friendshipId: string) {
    try {
      await invoke("accept_friend_request", { friendship_id: friendshipId });
      loadFriendships();
    } catch (error) {
      toasts.showErrorToast(`Error accepting friend request: ${error}`);
    }
  }

  async function removeFriendship(friendshipId: string) {
    try {
      await invoke("remove_friendship", { friendship_id: friendshipId });
      loadFriendships();
    } catch (error) {
      toasts.showErrorToast(`Error removing friendship: ${error}`);
    }
  }

  async function blockUser(targetUserId: string) {
    if (currentUser && currentUser.id) {
      try {
        await invoke("block_user", {
          current_user_id: currentUser.id,
          target_user_id: targetUserId,
        });
        loadFriendships();
      } catch (error) {
        toasts.showErrorToast(`Error blocking user: ${error}`);
      }
    }
  }

  $effect(() => {
    void friendStore.initialize();
    loadFriendships();
  });
</script>

<div class="p-4">
  <h2 class="text-xl font-bold mb-4">Friend Management</h2>

  <Button class="mb-4 font-bold" onclick={() => (showFriendRequestModal = true)}>
    Send Friend Request
  </Button>

  {#if flaggedFriends.length > 0}
    <section
      class="mb-6 rounded-lg border border-status-warning/40 bg-status-warning/10 p-4"
    >
      <h3 class="text-lg font-semibold text-status-warning-foreground mb-1">
        Flagged Friend Requests
      </h3>
      <p class="text-sm text-muted-foreground mb-3">
        These requests were muted automatically based on local spam heuristics.
        Review them to allow or keep them hidden.
      </p>
      <ul class="space-y-3">
        {#each flaggedFriends as friend (friend.id)}
          <li
            class="rounded-lg border border-status-warning/30 bg-background/60 p-3"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p class="text-sm font-semibold text-foreground">
                  {friend.name}
                </p>
                <p class="text-xs text-muted-foreground">
                  Score: {(friend.spamScore ?? 0).toFixed(2)}
                </p>
              </div>
              <span
                class="rounded-full border border-status-warning/60 bg-status-warning/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-status-warning-foreground"
              >
                Suspicious
              </span>
            </div>
            {#if friend.spamReasons?.length}
              <ul
                class="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground"
              >
                {#each friend.spamReasons as reason, idx (idx)}
                  <li>{reason}</li>
                {/each}
              </ul>
            {/if}
            <div class="mt-3 flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                class="bg-success px-3 py-1 text-sm font-semibold text-foreground hover:bg-success/80"
                onclick={() => allowFlaggedFriend(friend)}
              >
                Allow
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="bg-status-warning px-3 py-1 text-sm font-semibold text-foreground hover:bg-status-warning/80"
                onclick={() => keepFriendMuted(friend)}
              >
                Keep Muted
              </Button>
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if friendships.length > 0}
    <h3 class="text-lg font-semibold mb-2">Your Friendships</h3>
    <ul>
      {#each friendships as friendship (friendship.id)}
        {@const friendRecord = findFriendByFriendship(friendship.id)}
        <li
          class="bg-muted p-3 rounded-lg mb-2 flex justify-between items-center"
        >
          <span>
            {friendship.user_a_id === currentUser?.id
              ? "You"
              : friendship.user_a_id} and
            {friendship.user_b_id === currentUser?.id
              ? "You"
              : friendship.user_b_id} - Status: {friendship.status}
            {#if friendRecord?.isSpamFlagged}
              <span
                class="ml-2 inline-flex items-center rounded-full border border-status-warning/50 bg-status-warning/20 px-2 py-0.5 text-xs font-semibold text-status-warning-foreground"
              >
                Flagged {(friendRecord.spamScore ?? 0).toFixed(2)}
              </span>
            {/if}
          </span>
          <div class="flex flex-wrap gap-2">
            {#if friendship.status === "pending" && friendship.user_b_id === currentUser?.id}
              <Button
                variant="ghost"
                size="sm"
                class="bg-success px-3 py-1 text-sm font-semibold text-foreground hover:bg-success/80"
                onclick={() => acceptFriendRequest(friendship.id)}
              >
                Accept
              </Button>
            {/if}
            <Button
              variant="destructive"
              size="sm"
              class="px-3 py-1 text-sm font-semibold text-foreground"
              onclick={() => removeFriendship(friendship.id)}
            >
              Remove
            </Button>
            {#if friendship.status !== "blocked_by_a" && friendship.status !== "blocked_by_b"}
              <Button
                variant="ghost"
                size="sm"
                class="bg-status-warning px-3 py-1 text-sm font-semibold text-foreground hover:bg-status-warning/80"
                onclick={() =>
                  blockUser(
                    friendship.user_a_id === get(userStore)?.me?.id
                      ? friendship.user_b_id
                      : friendship.user_a_id,
                  )}
              >
                Block
              </Button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p>No friendships found.</p>
  {/if}

  {#if showFriendRequestModal}
    <FriendRequestModal
      onClose={() => (showFriendRequestModal = false)}
      onRequestSent={loadFriendships}
    />
  {/if}
</div>
