<svelte:options runes={true} />

<script lang="ts">
  import { Check, Clock, XCircle } from "@lucide/svelte";
  import { Badge, type BadgeVariant } from "$lib/components/ui/badge";
  import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button/index.js";
  import { friendStore } from "$lib/features/friends/stores/friendStore";
  import {
    fileTransferStore,
    type FileTransferRecord,
    type FileTransferStatus,
  } from "$lib/features/chat/stores/fileTransferStore";

  const historyStore = fileTransferStore.history;

  let entries = $derived($historyStore);
  let friendLookup = $derived(
    new Map(($friendStore.friends ?? []).map((friend) => [friend.id, friend])),
  );

  function resolveDisplayName(senderId: string) {
    const friend = friendLookup.get(senderId);
    return friend?.name ?? senderId;
  }

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

  function formatTimestamp(timestamp: number) {
    const date = new Date(timestamp);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  }

  function statusLabel(status: FileTransferStatus) {
    switch (status) {
      case "accepted":
        return "Pending";
      case "denied":
        return "Denied";
      case "received":
        return "Received";
      default:
        return status;
    }
  }

  function statusVariant(status: FileTransferStatus): BadgeVariant {
    switch (status) {
      case "accepted":
        return "secondary";
      case "denied":
        return "destructive";
      case "received":
        return "default";
      default:
        return "outline";
    }
  }

  function statusIcon(status: FileTransferStatus) {
    switch (status) {
      case "accepted":
        return Clock;
      case "denied":
        return XCircle;
      case "received":
        return Check;
      default:
        return Clock;
    }
  }

  function statusMessage(entry: FileTransferRecord) {
    switch (entry.status) {
      case "accepted":
        return "Awaiting file completion…";
      case "denied":
        return "Transfer was denied.";
      case "received":
        return entry.path
          ? `Saved to ${entry.path}`
          : "File received successfully.";
      default:
        return "";
    }
  }

  function dismissEntry(id: string) {
    fileTransferStore.dismiss(id);
  }
</script>

{#if entries.length > 0}
  <div
    class="fixed bottom-4 left-4 z-40 w-80 max-w-[calc(100vw-2rem)] space-y-3 max-h-[60vh] overflow-y-auto"
  >
    {#each entries as entry (entry.id)}
      {@const Icon = statusIcon(entry.status)}
      <Card class="bg-card/95 backdrop-blur border-border/80 shadow-lg">
        <CardHeader class="pb-2">
          <div class="flex items-center justify-between gap-2">
            <CardTitle class="text-sm font-semibold truncate">
              {entry.safeFilename}
            </CardTitle>
            <Badge variant={statusVariant(entry.status)} class="shrink-0">
              <Icon class="mr-1 h-3 w-3" />
              {statusLabel(entry.status)}
            </Badge>
          </div>
          <CardDescription class="text-xs text-muted-foreground">
            From {resolveDisplayName(entry.senderId)}
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-1 text-xs text-muted-foreground">
          <p>
            <span class="font-semibold text-foreground">Size:</span>
            {formatBytes(entry.size)}
          </p>
          <p>
            <span class="font-semibold text-foreground">Updated:</span>
            {formatTimestamp(entry.updatedAt)}
          </p>
          {#if entry.path}
            <p class="truncate" title={entry.path}>{statusMessage(entry)}</p>
          {:else}
            <p>{statusMessage(entry)}</p>
          {/if}
        </CardContent>
        <CardFooter class="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            class="text-xs"
            on:click={() => dismissEntry(entry.id)}
          >
            Dismiss
          </Button>
        </CardFooter>
      </Card>
    {/each}
  </div>
{/if}
