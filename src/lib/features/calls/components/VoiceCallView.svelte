<svelte:options runes={true} />

<script lang="ts">
  import { onMount } from "svelte";
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
    MessageCircle
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
  let isCallViewHovered = $state(false);

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
    () =>
      Boolean(callForChat) &&
      orderedParticipants.length === 1 &&
      !selectedParticipantId,
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

  onMount(() => {
    void callStore.initialize();
  });

  function formatParticipantName(
    participant: CallParticipant & { userId: string },
  ) {
    if (participant.userId === localUserId) {
      return "You";
    }
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
    return "grid-cols-[repeat(auto-fit,minmax(220px,1fr))]";
  }

  const PARTICIPANT_CARD_BASE_CLASSES =
    "relative flex w-full max-w-[min(420px,100%)] min-w-[220px] min-h-[200px] flex-col justify-between overflow-hidden rounded-lg border border-border text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer aspect-[16/9] mx-auto";
  const PARTICIPANT_CARD_DEFAULT_BACKGROUND =
    "bg-gradient-to-br from-slate-950/70 to-slate-900/60 text-foreground";
  const PARTICIPANT_CARD_VIDEO_BACKGROUND =
    "bg-slate-100/80 border-border/70 text-slate-900 shadow-[0_25px_60px_rgba(15,23,42,0.15)]";

  const INVITE_PLACEHOLDER_CLASSES =
    `${PARTICIPANT_CARD_BASE_CLASSES} border-dashed border-border/60 bg-muted/20 items-center justify-center text-center hover:shadow-[0_20px_60px_rgba(15,23,42,0.35)]`;

  function getParticipantCardClasses(isSelected: boolean, hasVideo: boolean) {
    const classes = [
      PARTICIPANT_CARD_BASE_CLASSES,
      hasVideo
        ? PARTICIPANT_CARD_VIDEO_BACKGROUND
        : PARTICIPANT_CARD_DEFAULT_BACKGROUND,
      "focus-visible:scale-110 focus-visible:shadow-[0_25px_65px_rgba(15,23,42,0.35)]",
      isSelected
        ? "scale-145 border-border/80 shadow-[0_25px_65px_rgba(15,23,42,0.35)] z-10"
        : "hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(15,23,42,0.45)]",
      "group",
    ];
    if (isSelected) {
      classes.push("lg:col-span-3 lg:row-span-2");
    }
    return classes.join(" ");
  }

  function participantHasActiveVideo(
    participant: CallParticipant & { userId: string },
  ) {
    if (participant.userId === localUserId) {
      return localMedia.videoEnabled;
    }
    return Boolean(participant.videoStream || participant.screenShareStream);
  }

  function handleParticipantKey(event: KeyboardEvent, userId: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleSelectParticipant(userId);
    }
  }

  function handleSelectParticipant(userId: string) {
    selectedParticipantId =
      selectedParticipantId === userId ? null : userId;
  }

  function handleWatchParticipant(userId: string) {
    selectedParticipantId = userId;
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

<div
  role="main"
  class="flex h-full min-h-0 flex-col bg-card/60"
  onmouseenter={() => (isCallViewHovered = true)}
  onmouseleave={() => (isCallViewHovered = false)}
>
  <header
    class={`px-4 py-4 transition-opacity duration-200 ${
      isCallViewHovered
        ? "opacity-100 pointer-events-auto"
        : "opacity-0 pointer-events-none"
    }`}
  >
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold text-foreground flex items-center gap-2">
        <Volume2 />
        {chat.name}
      </h1>
      <button class="cursor-pointer group">
        <MessageCircle size={20} class="text-gray-300 group-hover:text-gray-100 transition-colors duration-150" />
      </button>
    </div>
  </header>

  <div class="flex flex-1 flex-col overflow-hidden">
    <div class="flex-1 overflow-hidden px-4 py-4">
      {#if callForChat}
        <div
          class={`grid h-full w-full gap-3 auto-rows-[minmax(0,auto)] ${gridColumnsClass} items-center justify-items-center`}
        >
          {#each orderedParticipants as participant (participant.userId)}
            {@const participantName = formatParticipantName(participant)}
            {@const hasActiveVideo = participantHasActiveVideo(participant)}
            <div
              role="button"
              tabindex="0"
              class={getParticipantCardClasses(
                selectedParticipantId === participant.userId,
                hasActiveVideo,
              )}
              onclick={() => handleSelectParticipant(participant.userId)}
              onkeydown={(event) =>
                handleParticipantKey(event, participant.userId)
              }
              aria-pressed={selectedParticipantId === participant.userId}
            >
              <div class="flex flex-1 flex-col items-center justify-center gap-4 p-6">
                {#if participant.userId === localUserId && localMedia.videoEnabled}
                  <video
                    use:mediaStream={callStore.getLocalMediaStream()}
                    autoplay
                    muted
                    playsinline
                    class="h-28 w-28 rounded-full border border-border/50 object-cover object-center"
                  ></video>
                {:else if participant.videoStream}
                  <video
                    use:mediaStream={participant.videoStream}
                    autoplay
                    muted
                    playsinline
                    class="h-28 w-28 rounded-full border border-border/50 object-cover object-center"
                  ></video>
                {/if}
                <img
                  src={getAvatarForUser(participant.userId)}
                  alt={`${participantName} avatar`}
                  class="h-28 w-28 rounded-full border border-border/50 object-cover object-center"
                />
                {#if hasActiveVideo && participant.userId !== localUserId}
                  <Button
                    variant="outline"
                    class="text-xs font-semibold tracking-wide uppercase px-5 py-1 rounded-full"
                    onclick={(event) => {
                      event.stopPropagation();
                      handleWatchParticipant(participant.userId);
                    }}
                  >
                    Watch
                  </Button>
                {/if}
              </div>
              <div class="absolute inset-x-3 bottom-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
                <div class="flex items-center justify-between gap-2">
                  <div class="px-2 py-1 rounded-md bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80">
                    <p class="text-base font-semibold text-foreground">
                      {participantName}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    class="h-7 w-7 rounded-md text-muted-foreground"
                    onclick={(event) => event.stopPropagation()}
                    aria-label="More options"
                  >
                    <Ellipsis size={16} />
                  </Button>
                </div>
              </div>
            </div>
          {/each}
          {#if shouldShowInvitePlaceholder}
            <div
              role="button"
              tabindex="0"
              class={`${INVITE_PLACEHOLDER_CLASSES} group`}
              onclick={handleInviteFriends}
              onkeydown={handleInviteKey}
              aria-label="Invite friends to the call"
            >
              <div class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                <div class="flex h-24 w-24 items-center justify-center rounded-full border border-border/70 bg-muted/30 transition group-hover:border-border">
                  <UserPlus size={36} class="text-foreground" />
                </div>
                <p class="text-lg font-semibold text-foreground">Invite Friends</p>
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
            </div>
          {/if}
        </div>
      {:else}
        <div class="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <p>Joining voice channel…</p>
        </div>
      {/if}
    </div>
      <div
        class={`flex flex-wrap gap-x-3 gap-y-2 justify-center gap-3 mb-4 transition-opacity duration-200 ${
          isCallViewHovered
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
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
