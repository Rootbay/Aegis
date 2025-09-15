<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { toasts } from '$lib/data/stores/ToastStore';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { mdiAccountPlus, mdiQrcodeScan } from '@mdi/js';
  import QRCodeScanner from '$lib/components/modals/QRCodeScanner.svelte';

  let friendIdToAdd = '';
  let isSending = false;
  let showQrScanner = false;

  async function handleAddFriend() {
    if (!friendIdToAdd.trim()) {
      toasts.addToast('Please enter a user ID.', 'error');
      return;
    }

    isSending = true;
    try {
      await invoke('send_friend_request', { friendId: friendIdToAdd.trim() });
      toasts.addToast('Friend request sent!', 'success');
      friendIdToAdd = '';
    } catch (error) {
      console.error('Failed to send friend request:', error);
      toasts.addToast(error.message || 'Failed to send friend request.', 'error');
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
  <form on:submit|preventDefault={handleAddFriend} class="flex items-center bg-base-100 p-2 rounded-lg border border-border">
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
        <Icon data={mdiAccountPlus} size="5" clazz="mr-2" />
        Send Friend Request
      {/if}
    </button>
    <button
      type="button"
      class="bg-muted hover:bg-base-400 text-foreground font-bold py-2 px-4 rounded-md flex items-center ml-2 cursor-pointer"
      on:click={handleScanQrCode}
    >
      <Icon data={mdiQrcodeScan} size="5" clazz="mr-2" />
      Scan
    </button>
  </form>
  {#if showQrScanner}
    <QRCodeScanner
      on:close={() => (showQrScanner = false)}
      on:scanSuccess={(e) => {
        const scanned = (e as CustomEvent<string>).detail?.trim?.() ?? '';
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
