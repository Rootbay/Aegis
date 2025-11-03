<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { userStore } from "$lib/stores/userStore";
  import { toasts } from "$lib/stores/ToastStore";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "$lib/components/ui/alert/index.js";
  import { X } from "@lucide/svelte";

  type Props = {
    onRequestSent: () => void;
    onClose: () => void;
  };

  let { onRequestSent, onClose }: Props = $props();

  let targetUserId = $state("");
  let errorMessage = $state("");
  let successMessage = $state("");
  let open = $state(true);

  async function sendRequest() {
    errorMessage = "";
    successMessage = "";
    const currentUser = $userStore.me;

    if (!currentUser || !currentUser.id) {
      errorMessage = "Current user not found.";
      return;
    }

    if (!targetUserId) {
      errorMessage = "Please enter a target user ID.";
      return;
    }

    try {
      await invoke("send_friend_request", {
        current_user_id: currentUser.id,
        target_user_id: targetUserId,
      });
      successMessage = "Friend request sent successfully!";
      targetUserId = "";
      onRequestSent();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      toasts.showErrorToast(`Error sending friend request: ${error}`);
    }
  }

  $effect(() => {
    if (!open) closeModal();
  });

  function closeModal() {
    onClose();
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-50 bg-black/50" />
    <Dialog.Content
      class="fixed z-51 w-96 max-w-[92vw] rounded-xl border bg-popover p-6 text-popover-foreground shadow-lg focus:outline-none"
      style="left:50%; top:50%; transform:translate(-50%,-50%);"
    >
      <Dialog.Title class="text-xl font-bold mb-4"
        >Send Friend Request</Dialog.Title
      >

      <div class="mb-4">
        <Label for="targetUserId" class="mb-1 block text-sm"
          >Target User ID:</Label
        >
        <Input
          id="targetUserId"
          type="text"
          placeholder="Enter user ID"
          bind:value={targetUserId}
        />
      </div>

      {#if errorMessage}
        <Alert variant="destructive" class="mb-4">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      {/if}

      {#if successMessage}
        <Alert class="mb-4">
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      {/if}

      <div class="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onclick={() => (open = false)}
          >Cancel</Button
        >
        <Button onclick={sendRequest}>Send Request</Button>
      </div>

      <Dialog.Close
        class="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus:outline-none"
      >
        <span class="sr-only">Close</span>
        <X class="h-4 w-4" />
      </Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
