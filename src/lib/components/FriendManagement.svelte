<script lang="ts">
    import { onMount } from 'svelte';
    import { invoke } from '@tauri-apps/api/core';
    import { get } from 'svelte/store';
    import { userStore } from '$lib/data/stores/userStore';
    import { toasts } from '$lib/data/stores/ToastStore';
    import FriendRequestModal from './modals/FriendRequestModal.svelte';

    let friendships: any[] = [];
    let showFriendRequestModal = false;
    $: currentUser = $userStore.me;

    async function loadFriendships() {
        const currentUser = get(userStore).me;
        if (currentUser && currentUser.id) {
            try {
                friendships = await invoke('get_friendships', { currentUserId: currentUser.id });
            } catch (error) {
                console.error('Error loading friendships:', error);
                toasts.showErrorToast(`Error loading friendships: ${error}`);
            }
        }
    }

    async function acceptFriendRequest(friendshipId: string) {
        try {
            await invoke('accept_friend_request', { friendshipId: friendshipId });
            loadFriendships();
        } catch (error) {
            toasts.showErrorToast(`Error accepting friend request: ${error}`);
        }
    }

    async function removeFriendship(friendshipId: string) {
        try {
            await invoke('remove_friendship', { friendshipId: friendshipId });
            loadFriendships();
        } catch (error) {
            toasts.showErrorToast(`Error removing friendship: ${error}`);
        }
    }

    async function blockUser(targetUserId: string) {
        const currentUser = get(userStore).me;
        if (currentUser && currentUser.id) {
            try {
                await invoke('block_user', { currentUserId: currentUser.id, targetUserId: targetUserId });
                loadFriendships();
            } catch (error) {
                toasts.showErrorToast(`Error blocking user: ${error}`);
            }
        }
    }

    onMount(() => {
        loadFriendships();
    });
</script>

<div class="p-4">
    <h2 class="text-xl font-bold mb-4">Friend Management</h2>

    <button
        class="bg-primary hover:bg-accent text-foreground font-bold py-2 px-4 rounded mb-4"
        onclick={() => (showFriendRequestModal = true)}
    >
        Send Friend Request
    </button>

    {#if friendships.length > 0}
        <h3 class="text-lg font-semibold mb-2">Your Friendships</h3>
        <ul>
            {#each friendships as friendship (friendship.id)}
                <li class="bg-muted p-3 rounded-lg mb-2 flex justify-between items-center">
                    <span>
                        {friendship.user_a_id === currentUser?.id ? 'You' : friendship.user_a_id} and
                        {friendship.user_b_id === currentUser?.id ? 'You' : friendship.user_b_id} -
                        Status: {friendship.status}
                    </span>
                    <div>
                                                {#if friendship.status === 'pending' && friendship.user_b_id === currentUser?.id}
                            <button
                                class="bg-success hover:bg-green-700 text-foreground font-bold py-1 px-2 rounded mr-2"
                                onclick={() => acceptFriendRequest(friendship.id)}
                            >
                                Accept
                            </button>
                        {/if}
                        <button
                            class="bg-destructive hover:bg-red-700 text-foreground font-bold py-1 px-2 rounded mr-2"
                            onclick={() => removeFriendship(friendship.id)}
                        >
                            Remove
                        </button>
                        {#if friendship.status !== 'blocked_by_a' && friendship.status !== 'blocked_by_b'}
                            <button
                                class="bg-status-warning hover:bg-yellow-700 text-foreground font-bold py-1 px-2 rounded"
                                onclick={() =>
                                    blockUser(
                                        friendship.user_a_id === get(userStore)?.me?.id
                                            ? friendship.user_b_id
                                            : friendship.user_a_id
                                    )}
                            >
                                Block
                            </button>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {:else}
        <p>No friendships found.</p>
    {/if}

    {#if showFriendRequestModal}
        <FriendRequestModal on:close={() => (showFriendRequestModal = false)} on:requestSent={loadFriendships} />
    {/if}
</div>

<style>
    /* Add any specific styles here if needed */
</style>
