<svelte:options runes={true} />

<script lang="ts">
  import { get } from "svelte/store";
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from "$lib/components/ui/alert-dialog";
  import { friendStore } from "$lib/features/friends/stores/friendStore";
  import { fileTransferStore } from "$lib/features/chat/stores/fileTransferStore";
  import { settings } from "$lib/features/settings/stores/settings";

  const pendingStore = fileTransferStore.pending;

  let pendingTransfers = $derived($pendingStore);
  let activeRequest = $derived(pendingTransfers[0] ?? null);
  let dialogOpen = $state(false);
  let actionInFlight = $state<"approve" | "reject" | null>(null);
  let autoDownloadMediaEnabled = $state(get(settings).autoDownloadMedia);
  let friendLookup = $derived(
    new Map(($friendStore.friends ?? []).map((friend) => [friend.id, friend])),
  );

  let shouldDisplayDialog = $derived(() => {
    if (!activeRequest) {
      return false;
    }
    if (!autoDownloadMediaEnabled) {
      return true;
    }
    return activeRequest.autoApprovalFailed;
  });

  $effect(() => {
    const unsubscribe = settings.subscribe((value) => {
      autoDownloadMediaEnabled = value.autoDownloadMedia;
    });

    return () => unsubscribe();
  });

  $effect(() => {
    dialogOpen = shouldDisplayDialog();
  });

  function formatBytes(bytes?: number) {
    if (!bytes || Number.isNaN(bytes)) {
      return "Unknown";
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(1)} ${units[unitIndex]}`;
  }

  function resolveDisplayName(senderId: string) {
    const friend = friendLookup.get(senderId);
    return friend?.name ?? senderId;
  }

  function formatSenderId(senderId: string) {
    if (senderId.length <= 12) {
      return senderId;
    }
    return `${senderId.slice(0, 6)}…${senderId.slice(-4)}`;
  }

  async function handleApprove(event: Event) {
    event.preventDefault();
    if (!activeRequest || actionInFlight) {
      return;
    }
    actionInFlight = "approve";
    try {
      await fileTransferStore.approveTransfer(
        activeRequest.senderId,
        activeRequest.filename,
      );
    } finally {
      actionInFlight = null;
    }
  }

  async function handleReject(event: Event) {
    event.preventDefault();
    if (!activeRequest || actionInFlight) {
      return;
    }
    actionInFlight = "reject";
    try {
      await fileTransferStore.rejectTransfer(
        activeRequest.senderId,
        activeRequest.filename,
      );
    } finally {
      actionInFlight = null;
    }
  }
</script>

{#if shouldDisplayDialog() && activeRequest}
  <AlertDialog bind:open={dialogOpen}>
    <AlertDialogContent class="max-w-md">
      <AlertDialogHeader>
        <AlertDialogTitle>Incoming file transfer</AlertDialogTitle>
        <AlertDialogDescription>
          {resolveDisplayName(activeRequest.senderId)} is attempting to send a file.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div class="space-y-2 text-sm text-muted-foreground">
        <p class="font-medium text-foreground">{activeRequest.safeFilename}</p>
        <p>
          <span class="font-medium text-foreground">Sender:</span>
          {resolveDisplayName(activeRequest.senderId)}
          <span class="text-muted-foreground/80">
            ({formatSenderId(activeRequest.senderId)})</span
          >
        </p>
        <p>
          <span class="font-medium text-foreground">Size:</span>
          {formatBytes(activeRequest.size)}
        </p>
        <p class="text-xs text-muted-foreground/90">
          Approving will download and decrypt the file into your application
          data directory.
        </p>
      </div>
      <AlertDialogFooter class="gap-2 sm:gap-0">
        <AlertDialogCancel
          onclick={handleReject}
          disabled={actionInFlight === "approve"}
        >
          Deny
        </AlertDialogCancel>
        <AlertDialogAction
          class="min-w-[6rem]"
          onclick={handleApprove}
          disabled={actionInFlight === "reject"}
        >
          {actionInFlight === "approve" ? "Approving…" : "Approve"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
{/if}
