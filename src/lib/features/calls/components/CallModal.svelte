<svelte:options runes={true} />

<script lang="ts">
  import { onDestroy } from "svelte";
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { PhoneOff, Video, Mic, Timer } from "@lucide/svelte";
  import {
    callStore,
    describeCallStatus,
    type ActiveCall,
  } from "$lib/features/calls/stores/callStore";

  const state = $callStore;
  const activeCall = $callStore.activeCall;

  let duration = $state(0);
  let interval: ReturnType<typeof setInterval> | null = null;
  let localVideoEl: HTMLVideoElement | null = null;
  let remoteVideoEl: HTMLVideoElement | null = null;
  let remoteAudioEl: HTMLAudioElement | null = null;

  function beginTimer(call: ActiveCall | null) {
    if (!call?.connectedAt) {
      clearTimer();
      duration = 0;
      return;
    }

    duration = Date.now() - call.connectedAt;
    clearTimer();
    interval = setInterval(() => {
      duration = Date.now() - (call.connectedAt ?? Date.now());
    }, 1000);
  }

  function clearTimer() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  }

  $effect(() => {
    const call = $callStore.activeCall;
    if (call?.status === "in-call" && call.connectedAt) {
      beginTimer(call);
    } else if (call?.connectedAt && call.endedAt) {
      clearTimer();
      duration = call.endedAt - call.connectedAt;
    } else {
      clearTimer();
      duration = 0;
    }
  });

  onDestroy(clearTimer);

  function formatDuration(ms: number) {
    if (!ms) return "00:00";
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function handleOpenChange(open: boolean) {
    callStore.setCallModalOpen(open);
  }

  const statusLabel = $derived(describeCallStatus(activeCall));
  const isActive = $derived(
    activeCall &&
      (activeCall.status === "in-call" ||
        activeCall.status === "connecting" ||
        activeCall.status === "initializing"),
  );
  const hasRemoteStream = $derived(Boolean(activeCall?.remoteStream));

  $effect(() => {
    const stream = activeCall?.localStream ?? null;
    if (localVideoEl) {
      if (stream) {
        localVideoEl.srcObject = stream;
        localVideoEl.muted = true;
        localVideoEl.play().catch(() => {});
      } else {
        localVideoEl.srcObject = null;
      }
    }
  });

  $effect(() => {
    const stream = activeCall?.remoteStream ?? null;
    if (remoteVideoEl) {
      if (stream) {
        remoteVideoEl.srcObject = stream;
        remoteVideoEl.play().catch(() => {});
      } else {
        remoteVideoEl.srcObject = null;
      }
    }
    if (remoteAudioEl) {
      if (stream) {
        remoteAudioEl.srcObject = stream;
        remoteAudioEl.play().catch(() => {});
      } else {
        remoteAudioEl.srcObject = null;
      }
    }
  });
</script>

<Dialog open={state.showCallModal && Boolean(activeCall)} onOpenChange={handleOpenChange}>
  {#if activeCall}
    <DialogContent class="sm:max-w-md">
      <DialogHeader class="text-left space-y-1">
        <DialogTitle>
          {activeCall.type === "video" ? "Video Call" : "Voice Call"}
        </DialogTitle>
        <DialogDescription>{statusLabel}</DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div class="rounded-md border border-border bg-muted/40 p-4 text-sm">
          <p class="font-medium text-foreground">{activeCall.chatName}</p>
          <p class="text-xs text-muted-foreground">
            Started {new Date(activeCall.startedAt).toLocaleTimeString()}
          </p>
          {#if activeCall.status === "in-call" && activeCall.connectedAt}
            <p class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Timer class="h-3.5 w-3.5" />
              Connected for {formatDuration(duration)}
            </p>
          {/if}
        </div>

        {#if activeCall.type === "video"}
          <div class="relative h-56 w-full overflow-hidden rounded-md border border-border bg-black">
            <video
              bind:this={remoteVideoEl}
              autoplay
              playsinline
              class="h-full w-full object-cover"
            />
            {#if !hasRemoteStream}
              <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-xs text-muted-foreground">
                <Video class="h-6 w-6" />
                <span>Waiting for remote video...</span>
              </div>
            {/if}
            <video
              bind:this={localVideoEl}
              autoplay
              playsinline
              muted
              class="absolute bottom-3 right-3 h-20 w-28 rounded-md border border-white/30 object-cover shadow-lg"
            />
          </div>
        {:else}
          <div class="flex flex-col gap-3">
            <div class="flex items-center gap-3 rounded-md border border-border bg-background/80 px-3 py-2 text-sm">
              <Mic class="h-4 w-4 text-muted-foreground" />
              <span>{hasRemoteStream ? "Audio connected" : "Connecting audio..."}</span>
            </div>
            <audio bind:this={remoteAudioEl} autoplay playsinline class="sr-only" />
          </div>
        {/if}
      </div>

      <DialogFooter class="mt-4 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="secondary"
          class="cursor-pointer"
          onclick={() => callStore.setCallModalOpen(false)}
        >
          Minimize
        </Button>
        {#if isActive}
          <Button
            type="button"
            variant="destructive"
            class="cursor-pointer"
            onclick={() => callStore.endCall("Call ended")}
          >
            <PhoneOff class="mr-2 h-4 w-4" />
            End Call
          </Button>
        {:else}
          <Button
            type="button"
            variant="ghost"
            class="cursor-pointer"
            onclick={() => callStore.dismissCall()}
          >
            Close
          </Button>
        {/if}
      </DialogFooter>
    </DialogContent>
  {/if}
</Dialog>
