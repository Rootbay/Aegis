<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { toasts } from '$lib/data/stores/ToastStore';
  import { userStore } from '$lib/data/stores/userStore';
  import { Plus, Scan } from '@lucide/svelte';
  import QRCodeScanner from '$lib/components/modals/QRCodeScanner.svelte';

  let friendIdToAdd = $state('');
  let isSending = $state(false);
  let showQrScanner = $state(false);

  async function handleAddFriend(event?: SubmitEvent) {
    event?.preventDefault();
    if (!friendIdToAdd.trim()) {
      toasts.addToast('Please enter a user ID.', 'error');
      return;
    }

    const currentUser = $userStore.me;
    if (!currentUser?.id) {
      toasts.addToast('You must be signed in to send requests.', 'error');
      return;
    }

    isSending = true;
    try {
      await invoke('send_friend_request', {
        current_user_id: currentUser.id,
        target_user_id: friendIdToAdd.trim(),
      });
      toasts.addToast('Friend request sent!', 'success');
      friendIdToAdd = '';
    } catch (error) {
      console.error('Failed to send friend request:', error);
      const message = error instanceof Error ? error.message : 'Failed to send friend request.';
      toasts.addToast(message, 'error');
    } finally {
      isSending = false;
    }
  }

  function handleScanQrCode() {
    showQrScanner = true;
  }
</script>

<div class="p-4">
  <p class="text-muted-foreground mb-4">
    You can add a friend with their Aegis ID. It's case-sensitive!
  </p>
  <form onsubmit={handleAddFriend} class="flex items-center bg-base-100 p-2 rounded-lg border border-border">
    <input
      type="search"
      bind:value={friendIdToAdd}
      placeholder="Enter a User ID"
      minlength="3"
      maxlength="20"
      class="flex-grow bg-transparent text-foreground placeholder-text-tertiary focus:outline-none px-2 py-1"
    />
    <button
      type="submit"
      class="bg-primary hover:bg-accent text-foreground font-bold py-2 px-4 rounded-md flex items-center cursor-pointer disabled:cursor-not-allowed"
      disabled={!friendIdToAdd.trim() || isSending}
    >
      {#if isSending}
        Sending...
      {:else}
        <Plus size={10} class="mr-2" />
        Send Friend Request
      {/if}
    </button>
    <button
      type="button"
      class="bg-muted hover:bg-base-400 text-foreground font-bold py-2 px-4 rounded-md flex items-center ml-2 cursor-pointer"
      onclick={handleScanQrCode}
    >
      <Scan size={10} class="mr-2" />
      Scan
    </button>
  </form>
  {#if showQrScanner}
    <QRCodeScanner
      onclose={() => (showQrScanner = false)}
      onscanSuccess={(value) => {
        const scanned = value?.trim?.() ?? '';
        if (scanned) {
          friendIdToAdd = scanned;
          toasts.addToast('Scanned ID added. Ready to send.', 'success');
        } else {
          toasts.addToast('Invalid QR code.', 'error');
        }
        showQrScanner = false;
      }}
    />
  {/if}
</div>
