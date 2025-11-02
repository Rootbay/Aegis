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
  import {
    Phone,
    PhoneOff,
    Video,
    VideoOff,
    Mic,
    MicOff,
    Timer,
    MonitorUp,
    MonitorStop,
  } from "@lucide/svelte";
  import {
    callStore,
    describeCallStatus,
    type ActiveCall,
    type CallParticipant,
  } from "$lib/features/calls/stores/callStore";
  import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
  } from "$lib/components/ui/tooltip";

  const callStateSnapshot = $callStore;
  const activeCall = $callStore.activeCall;

  let duration = $state(0);
  let interval: ReturnType<typeof setInterval> | null = null;
  let localVideoEl = $state<HTMLVideoElement | null>(null);
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

  type ParticipantView = CallParticipant & {
    userId: string;
    displayStream: MediaStream | null;
  };

  const participants = $derived.by(() => {
    const call = $callStore.activeCall;
    if (!call) {
      return [] as ParticipantView[];
    }
    return Array.from(call.participants.entries()).map(
      ([userId, participant]) => ({
        ...participant,
        userId,
        displayStream:
          participant.screenShareStream ?? participant.remoteStream,
      }),
    );
  });

  const videoParticipants = $derived.by(() => {
    if (!activeCall || activeCall.type !== "video") {
      return [] as ParticipantView[];
    }
    return participants
      .slice()
      .sort(
        (a: ParticipantView, b: ParticipantView) =>
          Number(b.isScreenSharing) - Number(a.isScreenSharing),
      );
  });

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
  const localMedia = $derived($callStore.localMedia);
  const hasLocalStream = $derived(Boolean($callStore.activeCall?.localStream));
  const canToggleAudio = $derived(
    hasLocalStream && $callStore.localMedia.audioAvailable,
  );
  const canToggleVideo = $derived(
    hasLocalStream &&
      $callStore.localMedia.videoAvailable &&
      $callStore.activeCall?.type === "video",
  );
  const isScreenSharing = $derived($callStore.localMedia.screenSharing);
  const canShareScreen = $derived(
    Boolean(
      activeCall &&
        activeCall.type === "video" &&
        isActive &&
        $callStore.localMedia.screenShareAvailable,
    ),
  );
  function describeParticipant(participant: CallParticipant) {
    if (participant.isScreenSharing) {
      return "Presenting";
    }
    switch (participant.status) {
      case "invited":
        return "Invited";
      case "connecting":
        return "Connecting";
      case "connected":
        return "Connected";
      case "disconnected":
        return "Disconnected";
      case "left":
        return "Left";
      case "error":
        return participant.error ?? "Error";
      default:
        return participant.status;
    }
  }
</script>

<Dialog
  open={callStateSnapshot.showCallModal && Boolean(activeCall)}
  onOpenChange={handleOpenChange}
>
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
            <p
              class="mt-2 flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Timer class="h-3.5 w-3.5" />
              Connected for {formatDuration(duration)}
            </p>
          {/if}
        </div>

        {#if activeCall.type === "video"}
          <div class="space-y-3">
            <div class="grid gap-3 sm:grid-cols-2">
              {#if videoParticipants.length === 0}
                <div
                  class="flex h-40 items-center justify-center rounded-md border border-border bg-muted/40 text-sm text-muted-foreground"
                >
                  Waiting for participants...
                </div>
              {/if}
              {#each videoParticipants as participant (participant.userId)}
                <div
                  class={`relative h-40 overflow-hidden rounded-md border border-border bg-black ${
                    participant.isScreenSharing ? "ring-2 ring-primary" : ""
                  }`}
                >
                  <video
                    use:mediaStream={participant.displayStream}
                    autoplay
                    playsinline
                    class="h-full w-full object-cover"
                  >
                    <track
                      kind="captions"
                      srclang="en"
                      label="Live captions unavailable"
                      src="data:text/vtt,WEBVTT"
                    />
                  </video>
                  {#if participant.isScreenSharing}
                    <div
                      class="absolute top-2 left-2 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white"
                    >
                      Presenting
                    </div>
                  {/if}
                  <div
                    class="absolute top-2 right-2 rounded bg-black/60 px-2 py-1 text-xs text-white"
                  >
                    {describeParticipant(participant)}
                  </div>
                  {#if !participant.displayStream}
                    <div
                      class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-xs text-muted-foreground"
                    >
                      <Video class="h-6 w-6" />
                      <span>{participant.name ?? participant.userId}</span>
                    </div>
                  {/if}
                  {#if participant.isScreenSharing && participant.remoteStream && participant.displayStream !== participant.remoteStream}
                    <video
                      use:mediaStream={participant.remoteStream}
                      autoplay
                      playsinline
                      muted
                      class="absolute bottom-2 right-2 h-16 w-24 rounded border border-white/40 object-cover shadow-lg"
                    >
                      <track
                        kind="captions"
                        srclang="en"
                        label="Live captions unavailable"
                        src="data:text/vtt,WEBVTT"
                      />
                    </video>
                  {/if}
                  {#if participant.screenShareStream}
                    <audio
                      use:mediaStream={participant.remoteStream}
                      autoplay
                      playsinline
                      class="sr-only"
                    ></audio>
                  {/if}
                  <div
                    class="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-white"
                  >
                    {participant.name ?? participant.userId}
                  </div>
                </div>
              {/each}
            </div>
            <div
              class="relative h-24 w-full rounded-md border border-border bg-black/80"
            >
              <video
                use:mediaStream={activeCall.localStream ?? null}
                bind:this={localVideoEl}
                autoplay
                playsinline
                muted
                class="absolute inset-0 h-full w-full object-cover"
              >
                <track
                  kind="captions"
                  srclang="en"
                  label="Live captions unavailable"
                  src="data:text/vtt,WEBVTT"
                />
              </video>
              {#if isScreenSharing}
                <div
                  class="absolute top-2 left-2 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white"
                >
                  You are sharing your screen
                </div>
              {/if}
              <div
                class="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-white"
              >
                You
              </div>
            </div>
          </div>
        {:else}
          <div class="flex flex-col gap-3">
            {#if participants.length === 0}
              <div
                class="flex items-center gap-3 rounded-md border border-border bg-background/80 px-3 py-2 text-sm text-muted-foreground"
              >
                <Mic class="h-4 w-4" />
                Waiting for others to join...
              </div>
            {/if}
            {#each participants as participant (participant.userId)}
              <div
                class="flex items-center justify-between rounded-md border border-border bg-background/80 px-3 py-2 text-sm"
              >
                <div>
                  <p class="font-medium text-foreground">
                    {participant.name ?? participant.userId}
                  </p>
                  <p class="text-xs text-muted-foreground">
                    {describeParticipant(participant)}
                  </p>
                </div>
                <audio
                  use:mediaStream={participant.remoteStream}
                  autoplay
                  playsinline
                  class="sr-only"
                ></audio>
              </div>
            {/each}
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
        {#if activeCall.status === "ringing"}
          <div class="flex items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              class="cursor-pointer"
              onclick={() => void callStore.rejectCall()}
            >
              <PhoneOff class="mr-2 h-4 w-4" />
              Decline
            </Button>
            <Button
              type="button"
              class="cursor-pointer"
              onclick={() => void callStore.acceptCall()}
            >
              <Phone class="mr-2 h-4 w-4" />
              Accept
            </Button>
          </div>
        {:else if isActive}
          <div class="flex items-center gap-2">
            <TooltipProvider>
              <div class="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      type="button"
                      size="icon"
                      variant={localMedia.audioEnabled
                        ? "secondary"
                        : "outline"}
                      class="cursor-pointer"
                      aria-pressed={localMedia.audioEnabled}
                      aria-label={localMedia.audioEnabled
                        ? "Mute microphone"
                        : "Unmute microphone"}
                      disabled={!canToggleAudio}
                      onclick={() => callStore.toggleMute()}
                    >
                      {#if localMedia.audioEnabled}
                        <Mic class="h-4 w-4" />
                      {:else}
                        <MicOff class="h-4 w-4" />
                      {/if}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {localMedia.audioEnabled
                      ? "Mute microphone"
                      : "Unmute microphone"}
                  </TooltipContent>
                </Tooltip>
                {#if activeCall.type === "video"}
                  <Tooltip>
                    <TooltipTrigger>
                      <Button
                        type="button"
                        size="icon"
                        variant={localMedia.videoEnabled
                          ? "secondary"
                          : "outline"}
                        class="cursor-pointer"
                        aria-pressed={localMedia.videoEnabled}
                        aria-label={localMedia.videoEnabled
                          ? "Disable camera"
                          : "Enable camera"}
                        disabled={!canToggleVideo}
                        onclick={() => callStore.toggleCamera()}
                      >
                        {#if localMedia.videoEnabled}
                          <Video class="h-4 w-4" />
                        {:else}
                          <VideoOff class="h-4 w-4" />
                        {/if}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {localMedia.videoEnabled
                        ? "Disable camera"
                        : "Enable camera"}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger>
                      <Button
                        type="button"
                        size="icon"
                        variant={isScreenSharing ? "secondary" : "outline"}
                        class="cursor-pointer"
                        aria-pressed={isScreenSharing}
                        aria-label={isScreenSharing
                          ? "Stop screen sharing"
                          : "Start screen sharing"}
                        disabled={!canShareScreen}
                        onclick={() => void callStore.toggleScreenShare()}
                      >
                        {#if isScreenSharing}
                          <MonitorStop class="h-4 w-4" />
                        {:else}
                          <MonitorUp class="h-4 w-4" />
                        {/if}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {isScreenSharing
                        ? "Stop screen sharing"
                        : "Start screen sharing"}
                    </TooltipContent>
                  </Tooltip>
                {/if}
              </div>
            </TooltipProvider>
            {#if isScreenSharing}
              <Button
                type="button"
                variant="outline"
                class="cursor-pointer"
                onclick={() => callStore.stopScreenShare()}
              >
                <MonitorStop class="mr-2 h-4 w-4" />
                Stop Sharing
              </Button>
            {/if}
            <Button
              type="button"
              variant="destructive"
              class="cursor-pointer"
              onclick={() => callStore.endCall("Call ended")}
            >
              <PhoneOff class="mr-2 h-4 w-4" />
              End Call
            </Button>
          </div>
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
