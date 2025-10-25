<svelte:options runes={true} />

<script lang="ts">
  import { onDestroy } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { PhoneCall, PhoneOff } from "@lucide/svelte";
  import type { ActiveCall } from "$lib/features/calls/stores/callStore";
  import { describeCallStatus } from "$lib/features/calls/stores/callStore";

  let {
    call,
    onLeave,
    onDismiss,
    onOpenModal,
  } = $props<{
    call: ActiveCall;
    onLeave: () => void;
    onDismiss: () => void;
    onOpenModal: () => void;
  }>();

  let duration = $state(0);
  let interval: ReturnType<typeof setInterval> | null = null;

  function startTimer() {
    stopTimer();
    if (!call.connectedAt) return;
    duration = Date.now() - call.connectedAt;
    interval = setInterval(() => {
      duration = Date.now() - (call.connectedAt ?? Date.now());
    }, 1000);
  }

  function stopTimer() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  }

  $effect(() => {
    if (call.status === "in-call" && call.connectedAt) {
      startTimer();
    } else {
      stopTimer();
      if (call.connectedAt && call.endedAt) {
        duration = call.endedAt - call.connectedAt;
      } else {
        duration = 0;
      }
    }
  });

  onDestroy(stopTimer);

  function formatDuration(ms: number) {
    if (!ms) return "00:00";
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  const statusLabel = $derived(describeCallStatus(call));
  const isActive = $derived(
    call.status === "connecting" || call.status === "in-call" || call.status === "initializing",
  );
  const isError = $derived(call.status === "error");
  const canDismiss = $derived(call.status === "ended" || call.status === "error");
  const directionLabel = $derived(call.direction === "incoming" ? "Incoming" : "Outgoing");
</script>

<div
  class="mb-2 flex items-center justify-between gap-3 rounded-md border border-border bg-background/70 px-3 py-2 text-sm"
  role="status"
  aria-live="polite"
>
  <div class="space-y-0.5">
    <p class="font-medium text-foreground">
      {call.type === "video" ? "Video call" : "Voice call"} · {directionLabel} ·
      {statusLabel}
    </p>
    {#if call.status === "in-call" && call.connectedAt}
      <p class="text-xs text-muted-foreground">Duration {formatDuration(duration)}</p>
    {:else if canDismiss && call.endReason}
      <p class="text-xs text-muted-foreground">{call.endReason}</p>
    {:else if isError && call.error}
      <p class="text-xs text-destructive">{call.error}</p>
    {/if}
  </div>
  <div class="flex items-center gap-2">
    <Button
      variant="secondary"
      size="sm"
      class="cursor-pointer"
      onclick={onOpenModal}
    >
      <PhoneCall class="mr-2 h-3.5 w-3.5" />
      View
    </Button>
    {#if isActive}
      <Button
        variant="destructive"
        size="sm"
        class="cursor-pointer"
        onclick={onLeave}
      >
        <PhoneOff class="mr-2 h-3.5 w-3.5" />
        End
      </Button>
    {:else if canDismiss}
      <Button
        variant="ghost"
        size="sm"
        class="cursor-pointer"
        onclick={onDismiss}
      >
        Dismiss
      </Button>
    {/if}
  </div>
</div>
