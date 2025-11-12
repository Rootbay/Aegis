<svelte:options runes={true} />

<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import {
    Mic,
    MicOff,
    Video,
    VideoOff,
    MonitorUp,
    MonitorStop,
    PhoneOff,
  } from "@lucide/svelte";
import {
  callStore,
  describeCallStatus,
  type CallParticipant,
  type ParticipantStatus,
} from "$lib/features/calls/stores/callStore";
import type { ChannelChat } from "$lib/features/chat/models/Chat";
import CallModal from "$lib/features/calls/components/CallModal.svelte";

  let { chat }: { chat: ChannelChat } = $props();

  const callForChat = $derived.by(() => {
    if (!chat?.id) {
      return null;
    }
    const activeCall = $callStore.activeCall;
    if (!activeCall) {
      return null;
    }
    return activeCall.chatId === chat.id ? activeCall : null;
  });

  const participants = $derived.by(() => {
    const call = callForChat;
    if (!call) {
      return [];
    }
    return Array.from(call.participants.entries()).map(
      ([userId, participant]) => ({
        ...participant,
        userId,
      }),
    );
  });

  const callIsActive = $derived(() => {
    const call = callForChat;
    if (!call) {
      return false;
    }
    return (
      call.status !== "ended" &&
      call.status !== "error" &&
      call.status !== "ending"
    );
  });

  const statusLabel = $derived(() => {
    if (!callForChat) {
      return "Connecting to voice channel…";
    }
    return describeCallStatus(callForChat);
  });

  const localMedia = $derived($callStore.localMedia);
  const isScreenSharing = $derived($callStore.localMedia.screenSharing);

  let duration = $state(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  function clearTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  $effect(() => {
    const call = callForChat;
    if (call?.status === "in-call" && call.connectedAt) {
      duration = Date.now() - call.connectedAt;
      clearTimer();
      timer = setInterval(() => {
        duration = Date.now() - (call.connectedAt ?? Date.now());
      }, 1000);
      return;
    }
    if (call?.connectedAt && call.endedAt) {
      duration = call.endedAt - call.connectedAt;
    } else {
      duration = 0;
    }
    clearTimer();
  });

  onDestroy(() => {
    clearTimer();
  });

  onMount(() => {
    void callStore.initialize();
  });

  function formatDuration(ms: number) {
    if (!ms) {
      return "00:00";
    }
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function formatParticipantName(
    participant: CallParticipant & { userId: string },
  ) {
    const name = participant.name?.trim();
    if (name) {
      return name;
    }
    return `User-${participant.userId.slice(0, 4) || "anon"}`;
  }

  function formatParticipantStatus(status: ParticipantStatus) {
    switch (status) {
      case "connected":
        return "Connected";
      case "connecting":
        return "Connecting…";
      case "invited":
        return "Invited";
      case "left":
        return "Left";
      case "disconnected":
        return "Disconnected";
      case "error":
        return "Error";
      default:
        return "Unknown";
    }
  }

  function handleMuteToggle() {
    callStore.toggleMute();
  }

  function handleVideoToggle() {
    callStore.toggleCamera();
  }

  function handleScreenShareToggle() {
    if (isScreenSharing) {
      callStore.stopScreenShare();
      return;
    }
    void callStore.toggleScreenShare();
  }

  function handleLeaveCall() {
    callStore.endCall("Call ended");
  }

  function mediaStream(node: HTMLMediaElement, stream: MediaStream | null) {
    const apply = (value: MediaStream | null) => {
      if (node.srcObject !== value) {
        node.srcObject = value;
      }
      if (value && typeof node.play === "function") {
        node.play().catch(() => {});
      }
      if (!value && node.srcObject) {
        node.srcObject = null;
      }
    };

    apply(stream);

    return {
      update(value: MediaStream | null) {
        apply(value);
      },
      destroy() {
        apply(null);
      },
    };
  }
</script>

<div class="flex h-full min-h-0 flex-col">
  <header class="border-b border-border bg-card px-4 py-4">
    <div class="flex items-center justify-between gap-6">
      <div class="[word-wrap:break-word] space-y-1">
        <p class="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Voice Channel
        </p>
        <h1 class="text-2xl font-semibold text-foreground">#{chat.name}</h1>
        <p class="text-sm text-muted-foreground">
          {statusLabel}
          {#if duration}
            · {formatDuration(duration)}
          {/if}
        </p>
      </div>
      <p class="text-sm font-semibold text-muted-foreground">
        {#if callForChat}
          {callForChat.participants.size}
          {" "}
          participant{callForChat.participants.size === 1 ? "" : "s"}
        {:else}
          Starting call…
        {/if}
      </p>
    </div>
  </header>

  <div class="flex flex-1 flex-col overflow-hidden bg-card/60">
    <div class="flex-1 overflow-hidden px-4 py-4">
      {#if participants.length}
        <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {#each participants as participant (participant.userId)}
            <div class="flex flex-col gap-4 rounded-xl border border-border bg-background p-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-foreground">
                    {formatParticipantName(participant)}
                  </p>
                  <p class="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    {formatParticipantStatus(participant.status)}
                  </p>
                </div>
                {#if participant.isScreenSharing}
                  <span class="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-400">
                    Sharing screen
                  </span>
                {/if}
              </div>
              {#if participant.remoteStream}
                <div class="relative h-32 w-full overflow-hidden rounded-lg bg-slate-950">
                  <video
                    use:mediaStream={participant.remoteStream}
                    autoplay
                    playsinline
                    muted
                    class="h-full w-full object-cover"
                  ></video>
                </div>
              {:else}
                <div class="flex h-32 w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                  {participant.isScreenSharing ? "Screen sharing" : "No video"}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <div class="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          {#if callForChat}
            <p>Waiting for others to join the call.</p>
            <p>Only you are connected right now.</p>
          {:else}
            <p>Joining voice channel…</p>
          {/if}
        </div>
      {/if}
    </div>
    <div class="border-t border-border px-4 py-4">
      <div class="flex flex-wrap justify-center gap-3">
        <Button
          type="button"
          variant={localMedia.audioEnabled ? "secondary" : "outline"}
          size="icon"
          class="cursor-pointer"
          onclick={handleMuteToggle}
          aria-pressed={localMedia.audioEnabled}
          aria-label={
            localMedia.audioEnabled ? "Mute microphone" : "Unmute microphone"
          }
          disabled={!callIsActive || !localMedia.audioAvailable}
        >
          {#if localMedia.audioEnabled}
            <Mic class="h-4 w-4" />
          {:else}
            <MicOff class="h-4 w-4" />
          {/if}
        </Button>
        <Button
          type="button"
          variant={localMedia.videoEnabled ? "secondary" : "outline"}
          size="icon"
          class="cursor-pointer"
          onclick={handleVideoToggle}
          aria-pressed={localMedia.videoEnabled}
          aria-label={localMedia.videoEnabled ? "Disable camera" : "Enable camera"}
          disabled={!callIsActive || !localMedia.videoAvailable}
        >
          {#if localMedia.videoEnabled}
            <Video class="h-4 w-4" />
          {:else}
            <VideoOff class="h-4 w-4" />
          {/if}
        </Button>
        <Button
          type="button"
          variant={
            isScreenSharing ? "secondary" : "outline"
          }
          size="icon"
          class="cursor-pointer"
          onclick={handleScreenShareToggle}
          aria-pressed={isScreenSharing}
          aria-label={
            isScreenSharing ? "Stop screen sharing" : "Share screen"
          }
          disabled={!callIsActive || !localMedia.screenShareAvailable}
        >
          {#if isScreenSharing}
            <MonitorStop class="h-4 w-4" />
          {:else}
            <MonitorUp class="h-4 w-4" />
          {/if}
        </Button>
        <Button
          type="button"
          variant="destructive"
          class="cursor-pointer px-4"
          onclick={handleLeaveCall}
          disabled={!callForChat}
        >
          <PhoneOff class="mr-2 h-4 w-4" />
          End Call
        </Button>
      </div>
    </div>
  </div>
</div>

<CallModal />
