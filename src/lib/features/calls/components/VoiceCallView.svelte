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
    Volume2,
    UserPlus,
    Ellipsis,
  } from "@lucide/svelte";
  import {
    callStore,
    describeCallStatus,
    type CallParticipant,
    type ParticipantStatus,
  } from "$lib/features/calls/stores/callStore";
  import type { ChannelChat } from "$lib/features/chat/models/Chat";
  import { toasts } from "$lib/stores/ToastStore";
  import { userStore } from "$lib/stores/userStore";
  import { userCache } from "$lib/utils/cache";

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

  const statusLabel = $derived.by(() => {
    if (!callForChat) {
      return "Connecting to voice channel…";
    }
    return describeCallStatus(callForChat);
  });

  const localMedia = $derived($callStore.localMedia);
  const isScreenSharing = $derived($callStore.localMedia.screenSharing);

  const FALLBACK_AVATAR = (id: string) =>
    `https://api.dicebear.com/8.x/bottts-neutral/svg?seed=${encodeURIComponent(id)}`;

  let selectedParticipantId = $state<string | null>(null);

  const localUserId = $derived.by(() => $userStore.me?.id ?? null);

  const orderedParticipants = $derived.by<Array<CallParticipant & { userId: string }>>(
    () => {
      const currentLocalUserId = localUserId;
      const sorted = [...participants];
      sorted.sort((a, b) => {
        if (a.userId === currentLocalUserId) {
          return -1;
        }
        if (b.userId === currentLocalUserId) {
          return 1;
        }
        const joinedA = a.joinedAt ?? Number.MAX_SAFE_INTEGER;
        const joinedB = b.joinedAt ?? Number.MAX_SAFE_INTEGER;
        if (joinedA !== joinedB) {
          return joinedA - joinedB;
        }
        return a.userId.localeCompare(b.userId);
      });
      return sorted;
    },
  );

  const shouldShowInvitePlaceholder = $derived.by(
    () => Boolean(callForChat) && orderedParticipants.length === 1,
  );

  const gridItemCount = $derived.by(
    () => orderedParticipants.length + (shouldShowInvitePlaceholder ? 1 : 0),
  );

  const gridColumnsClass = $derived.by(() =>
    computeGridColumns(gridItemCount),
  );

  $effect(() => {
    if (
      selectedParticipantId &&
      !orderedParticipants.some(
        (participant) => participant.userId === selectedParticipantId,
      )
    ) {
      selectedParticipantId = null;
    }
  });

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

  function getAvatarForUser(userId: string) {
    const cached = userCache.get(userId);
    return cached?.avatar ?? FALLBACK_AVATAR(userId);
  }

  function computeGridColumns(count: number) {
    if (count <= 1) {
      return "grid-cols-1";
    }
    if (count === 2) {
      return "grid-cols-1 sm:grid-cols-2";
    }
    if (count === 3) {
      return "grid-cols-1 sm:grid-cols-2 md:grid-cols-2";
    }
    if (count === 4) {
      return "grid-cols-1 sm:grid-cols-2 md:grid-cols-2";
    }
    if (count <= 6) {
      return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3";
    }
    return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
  }

  function getParticipantCardClasses(index: number, isSelected: boolean) {
    const classes = [
      "relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-[30px] border border-border bg-gradient-to-br from-slate-950/70 to-slate-900/60 px-6 py-6 text-center transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer",
      isSelected
        ? "scale-105 border-emerald-400/70 shadow-[0_25px_65px_rgba(16,185,129,0.35)]"
        : "hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(15,23,42,0.45)]",
    ];
    if (gridItemCount === 3 && index === 0 && !shouldShowInvitePlaceholder) {
      classes.push("col-span-2");
    }
    return classes.join(" ");
  }

  function handleSelectParticipant(userId: string) {
    selectedParticipantId =
      selectedParticipantId === userId ? null : userId;
  }

  async function handleInviteFriends() {
    if (typeof window === "undefined") {
      toasts.addToast("Unable to share invite right now.", "error");
      return;
    }
    const shareUrl = window.location.href || "https://aegis.app";
    const shareData = {
      title: chat.name ?? "Join my voice call",
      text: chat.name
        ? `Join my voice call in ${chat.name}.`
        : "Join my voice call on Aegis.",
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        toasts.addToast("Invite sent!", "success");
        return;
      }
    } catch (error) {
      console.error("Failed to use native share:", error);
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        toasts.addToast("Invite link copied to clipboard.", "success");
        return;
      }
    } catch (error) {
      console.error("Failed to copy invite link:", error);
    }

    toasts.addToast("Copy the link to share with friends.", "info");
  }

  function handleInviteKey(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleInviteFriends();
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
      <h1 class="text-2xl font-semibold text-foreground flex items-center gap-2">
        <Volume2 />
        {chat.name}
      </h1>
        <p class="text-sm text-muted-foreground">
          {statusLabel}
          {#if duration}
            · {formatDuration(duration)}
          {/if}
        </p>
      </div>
      <p class="text-sm font-semibold text-muted-foreground">
        {#if !callForChat}
          Starting call…
        {/if}
      </p>
    </div>
  </header>

  <div class="flex flex-1 flex-col overflow-hidden bg-card/60">
    <div class="flex-1 overflow-hidden px-4 py-4">
      {#if callForChat}
        <div
          class={`grid h-full w-full gap-3 auto-rows-[minmax(220px,1fr)] ${gridColumnsClass}`}
        >
          {#each orderedParticipants as participant, index (participant.userId)}
            {@const participantName = formatParticipantName(participant)}
            <button
              type="button"
              class={getParticipantCardClasses(
                index,
                selectedParticipantId === participant.userId,
              )}
              onclick={() => handleSelectParticipant(participant.userId)}
              aria-pressed={selectedParticipantId === participant.userId}
            >
              <img
                src={getAvatarForUser(participant.userId)}
                alt={`${participantName} avatar`}
                class="h-28 w-28 rounded-full border border-border/50 object-cover object-center"
              />
              <div class="space-y-1">
                <p class="text-base font-semibold text-foreground">
                  {participantName}
                </p>
                <p class="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  {participant.userId === localUserId
                    ? "You"
                    : formatParticipantStatus(participant.status)}
                </p>
              </div>
            </button>
          {/each}
          {#if shouldShowInvitePlaceholder}
            <div
              role="button"
              tabindex="0"
              class="group relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-[30px] border border-dashed border-border/60 bg-muted/20 px-6 py-6 text-center transition hover:shadow-[0_20px_50px_rgba(15,23,42,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer"
              onclick={handleInviteFriends}
              onkeydown={handleInviteKey}
              aria-label="Invite friends to the call"
            >
              <div class="flex h-24 w-24 items-center justify-center rounded-full border border-border/70 bg-muted/30 transition group-hover:border-border">
                <UserPlus size={36} class="text-foreground" />
              </div>
              <div class="space-y-1">
                <p class="text-lg font-semibold text-foreground">Invite Friends</p>
                <p class="text-sm text-muted-foreground">
                  Bring someone else into the call.
                </p>
              </div>
              <Button
                variant="outline"
                class="w-full max-w-[220px]"
                onclick={(event) => {
                  event.stopPropagation();
                  handleInviteFriends();
                }}
              >
                Invite Friends
              </Button>
            </div>
          {/if}
        </div>
      {:else}
        <div class="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <p>Joining voice channel…</p>
        </div>
      {/if}
    </div>
      <div class="flex flex-wrap gap-x-3 gap-y-2 justify-center gap-3 mb-4">
        <div class="flex gap-2 bg-card rounded-xl px-2 py-2 border border-border">
          <Button
            variant="ghost"
            class="cursor-pointer"
            onclick={handleMuteToggle}
            aria-pressed={localMedia.audioEnabled}
            aria-label={
              localMedia.audioEnabled ? "Mute microphone" : "Unmute microphone"
            }
            disabled={!callIsActive || !localMedia.audioAvailable}
          >
            {#if localMedia.audioEnabled}
              <Mic size={20} />
            {:else}
              <MicOff size={20} />
            {/if}
          </Button>
          <Button
            variant="ghost"
            class="cursor-pointer"
            onclick={handleVideoToggle}
            aria-pressed={localMedia.videoEnabled}
            aria-label={localMedia.videoEnabled ? "Disable camera" : "Enable camera"}
            disabled={!callIsActive || !localMedia.videoAvailable}
          >
            {#if localMedia.videoEnabled}
              <Video size={20} />
            {:else}
              <VideoOff size={20} />
            {/if}
          </Button>
        </div>
        <div class="flex gap-2 bg-card rounded-xl px-2 py-2 border border-border">
          <Button
            variant="ghost"
            class="cursor-pointer"
            onclick={handleScreenShareToggle}
            aria-pressed={isScreenSharing}
            aria-label={
              isScreenSharing ? "Stop screen sharing" : "Share screen"
            }
            disabled={!callIsActive || !localMedia.screenShareAvailable}
          >
            {#if isScreenSharing}
              <MonitorStop size={20} />
            {:else}
              <MonitorUp size={20} />
            {/if}
          </Button>
          <Button
            variant="ghost"
            class="cursor-pointer"
            aria-label={"More Options"}
          >
            <Ellipsis size={20} />
          </Button>
        </div>
        <Button
          variant="destructive"
          class="w-18 h-auto cursor-pointer py-2"
          onclick={handleLeaveCall}
          disabled={!callForChat}
        >
          <PhoneOff size={20} />
        </Button>
      </div>
  </div>
</div>
