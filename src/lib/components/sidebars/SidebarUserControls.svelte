<script lang="ts">
  import { onDestroy } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Avatar, AvatarFallback, AvatarImage } from "$lib/components/ui/avatar";
  import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
  } from "$lib/components/ui/tooltip";
  import * as Popover from "$lib/components/ui/popover";
  import UserCardModal from "$lib/components/modals/UserCardModal.svelte";
  import { Separator } from "$lib/components/ui/separator";
  import { callStore } from "$lib/features/calls/stores/callStore";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { userStore } from "$lib/stores/userStore";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { cn } from "$lib/utils";
  import {
    Mic,
    MicOff,
    Settings,
    Headphones,
    HeadphoneOff,
    Camera,
    Monitor,
    Music,
    Power,
    Sparkles,
    PhoneCall,
    BadgeCheck,
    Bug,
    ClipboardCopy
  } from "@lucide/svelte";
  import type { User } from "$lib/features/auth/models/User";

  type OpenProfileHandler = (user: User) => void;

  let {
    openDetailedProfileModal,
    onSettingsClick,
    settingsTooltip = "Settings",
    isServerMemberContext = false,
    serverId = null
  }: {
    openDetailedProfileModal?: OpenProfileHandler;
    onSettingsClick?: () => void;
    settingsTooltip?: string;
    isServerMemberContext?: boolean;
    serverId?: string | null;
  } = $props();

  let overlayHovered = $state(false);
  let isDeafened = $state(false);

  const openProfileHandler =
    openDetailedProfileModal ??
    (() => {});

  const toggleDeafen = () => {
    isDeafened = !isDeafened;
  };

  const handleSettingsClick = () => {
    onSettingsClick?.();
  };

  const toggleMute = () => {
    callStore.toggleMute();
  };

  const FALLBACK_LOCAL_MEDIA = {
    audioEnabled: true,
    audioAvailable: false
  };

  const localMedia = $derived(
    () => $callStore.localMedia ?? FALLBACK_LOCAL_MEDIA
  );

  const micTooltip = $derived(
    () => (localMedia().audioEnabled ? "Mute microphone" : "Unmute microphone")
  );

  const deafTooltip = $derived(
    () => (isDeafened ? "Undeafen" : "Deafen")
  );

  const settingsDisabled = $derived(
    () => !onSettingsClick
  );

  const formatDuration = (milliseconds: number) => {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const syncDuration = () => {
    const activeCall = $callStore.activeCall;
    const start = activeCall?.connectedAt ?? activeCall?.startedAt;
    if (!start) {
      voiceCallDuration = "00:00";
      return;
    }
    voiceCallDuration = formatDuration(Date.now() - start);
  };

  const resetDurationInterval = () => {
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }
  };

  let voiceCallDuration = $state("00:00");
  let durationInterval: ReturnType<typeof setInterval> | null = null;
  let voiceChannelDescriptor = $state("");
  let showVoiceExtension = $state(false);
  let voiceNetworkHistory = $state([32, 34, 28, 36, 31, 29]);
  let voiceLabelHovered = $state(false);

  const voiceNetworkOverview = $derived(() => {
    const history = voiceNetworkHistory;
    const normalizedHistory = history.length ? history : [40];
    const maxValue = Math.max(...normalizedHistory, 1);
    const total = normalizedHistory.reduce((sum, value) => sum + value, 0);
    const average = Math.round(total / normalizedHistory.length);
    return {
      average,
      latest: normalizedHistory[normalizedHistory.length - 1] ?? 0,
      packetLoss: "0.4%",
      jitter: 5,
      max: maxValue
    };
  });

  $effect(() => {
    const activeCall = $callStore.activeCall;
    const startTime = activeCall?.connectedAt ?? activeCall?.startedAt;
    const isVoiceCall = activeCall?.type === "voice";

    if (!startTime || !isVoiceCall) {
      voiceCallDuration = "00:00";
      resetDurationInterval();
      return;
    }

    syncDuration();

    if (!durationInterval) {
      durationInterval = setInterval(syncDuration, 1000);
    }
  });

  $effect(() => {
    const activeCall = $callStore.activeCall;

    if (!activeCall || activeCall.type !== "voice") {
      showVoiceExtension = false;
      voiceChannelDescriptor = "";
      return;
    }

    showVoiceExtension = true;

    const channelName =
      typeof activeCall.chatName === "string" && activeCall.chatName.length > 0
        ? activeCall.chatName
        : "Voice Channel";

    const serverName =
      activeCall.serverId &&
      ($serverStore.servers ?? []).find(
        (server) => server.id === activeCall.serverId
      )?.name;

    const serverLabel = serverName ?? "Server";

    voiceChannelDescriptor = `${channelName} / ${serverLabel}`;
  });

  const handleVoiceDisconnect = () => {
    callStore.endCall("User disconnected from voice");
  };

  const handleVoicePlaceholder = () => {
    // placeholder for voice controls
  };

  const voiceStatsSummary = () => {
    const stats = voiceNetworkOverview();
    const channelLabel = voiceChannelDescriptor || "Voice channel";
    return [
      `Channel: ${channelLabel}`,
      `Duration: ${voiceCallDuration}`,
      `Average ping: ${stats.average}ms`,
      `Latest ping: ${stats.latest}ms`,
      `Packet loss: ${stats.packetLoss}`,
      `Jitter: ${stats.jitter}ms`
    ].join(" • ");
  };

  const handleVoiceDebug = () => {
    console.debug("Voice debug", {
      channel: voiceChannelDescriptor,
      duration: voiceCallDuration,
      stats: voiceNetworkOverview()
    });
  };

  const handleVoiceCopyStats = async () => {
    const summary = voiceStatsSummary();
    const clipboard =
      typeof navigator !== "undefined" ? navigator.clipboard : undefined;

    if (clipboard?.writeText) {
      try {
        await clipboard.writeText(summary);
        return;
      } catch (error) {
        console.error("Unable to copy voice stats", error);
        return;
      }
    }

    console.info("Voice stats summary (clipboard unavailable)", summary);
  };

  const handleCameraToggle = () => {
    callStore.toggleCamera();
  };

  const handleScreenshareToggle = () => {
    void callStore.toggleScreenShare();
  };

  const handleSoundboardOpen = () => {};

  const handleSecondaryPlaceholder = () => {
    // placeholder for future quick action
  };

  onDestroy(() => {
    resetDurationInterval();
  });
</script>

<TooltipProvider>
  <div class="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-2 pb-2">
    <div
      role="main"
      class={cn(
        "pointer-events-auto flex w-full flex-col gap-2 rounded-lg border border-border/60 bg-card px-1 pb-2 pt-2 text-muted-foreground shadow-lg transition-all duration-150",
        overlayHovered ? "shadow-xl" : "",
      )}
      onmouseenter={() => (overlayHovered = true)}
      onmouseleave={() => (overlayHovered = false)}
    >
      {#if showVoiceExtension}
        <div class="space-y-3 px-2 py-2 shadow-inner text-left text-sm">
          <div class="flex items-start justify-between mb-1">
            <div class="flex items-start gap-3">
              <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 text-green-500">
                <BadgeCheck size={16} />
              </div>
              <Popover.Root>
                <Popover.Trigger
                  type="button"
                  class="flex flex-col gap-1 text-left focus-visible:outline-none"
                >
                  <div class="space-y-1">
                    <div
                      role="button"
                      tabindex="0"
                      class="relative inline-flex items-center overflow-hidden whitespace-nowrap h-[18px] min-w-[120px]"
                      onmouseenter={() => voiceLabelHovered = true}
                      onmouseleave={() => voiceLabelHovered = false}
                    >
                      {#each [
                        { text: "Voice Connected", visible: !voiceLabelHovered },
                        { text: "Voice Details",   visible: voiceLabelHovered }
                      ] as item}
                        <span
                          class="absolute inset-0 text-[16px] font-semibold text-green-500 leading-none transition-opacity duration-200"
                          style:opacity={item.visible ? 1 : 0}
                        >
                          {item.text}
                        </span>
                      {/each}
                    </div>

                    <div class="flex flex-col">
                      <span class="text-xs text-muted-foreground truncate">
                        {voiceChannelDescriptor}
                      </span>
                      <span class="text-xs font-mono text-muted-foreground">
                        {voiceCallDuration}
                      </span>
                    </div>
                  </div>
                </Popover.Trigger>
                <Popover.Content
                  side="bottom"
                  align="start"
                  class="space-y-4 rounded-2xl border border-border/60 bg-card/90 p-4 shadow-lg"
                >
                  {@const stats = voiceNetworkOverview()}
                  {@const history = voiceNetworkHistory}
                  <div class="space-y-2">
                    <p class="text-xs font-semibold text-muted-foreground">
                      Voice Details
                    </p>
                    <div class="flex h-20 items-end gap-1">
                      {#each history as ping}
                        <div class="flex-1 text-center">
                          <div class="mx-auto flex h-full items-end justify-center">
                            <div
                              class="h-full w-2 rounded-full bg-linear-to-t from-emerald-500/90 to-emerald-400"
                              style={`height:${(ping / Math.max(stats.max, 1)) * 100}%`}
                            ></div>
                          </div>
                          <span class="mt-1 block text-[10px] text-muted-foreground">
                            {ping}ms
                          </span>
                        </div>
                      {/each}
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <p class="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Average ping
                      </p>
                      <p class="font-semibold text-foreground">
                        {stats.average} ms
                      </p>
                    </div>
                    <div>
                      <p class="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Latest ping
                      </p>
                      <p class="font-semibold text-foreground">
                        {stats.latest} ms
                      </p>
                    </div>
                    <div>
                      <p class="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Packet loss
                      </p>
                      <p class="font-semibold text-foreground">
                        {stats.packetLoss}
                      </p>
                    </div>
                    <div>
                      <p class="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Jitter
                      </p>
                      <p class="font-semibold text-foreground">
                        {stats.jitter} ms
                      </p>
                    </div>
                  </div>
                  <div class="rounded-lg border border-border/60 bg-muted/70 px-3 py-2 text-[11px] text-muted-foreground">
                    <p class="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Security
                    </p>
                    <p class="text-xs font-semibold text-foreground leading-tight">
                      Voice traffic is protected with end-to-end encryption (E2EE).
                    </p>
                    <p class="text-[10px] text-muted-foreground opacity-80">
                      Session keys rotate inside the Tauri runtime to keep every call private.
                    </p>
                  </div>
                  <div class="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      class="flex-1 items-center justify-center gap-1 rounded-lg border border-border/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide"
                      onclick={handleVoiceDebug}
                      aria-label="Log voice debug info"
                    >
                      <Bug size={13} />
                      Debug
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      class="flex-1 items-center justify-center gap-1 rounded-lg border border-border/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide"
                      onclick={handleVoiceCopyStats}
                      aria-label="Copy voice stats"
                    >
                      <ClipboardCopy size={13} />
                      Copy stats
                    </Button>
                  </div>
                </Popover.Content>
              </Popover.Root>
            </div>
            <div class="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="rounded-full p-2"
                    onclick={handleVoicePlaceholder}
                    aria-label="Voice controls placeholder"
                  >
                    <PhoneCall size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Voice controls placeholder</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="rounded-full p-2"
                    onclick={handleVoiceDisconnect}
                    aria-label="Disconnect from voice"
                  >
                    <Power size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Disconnect</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div class="grid w-full grid-cols-4 gap-2">
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="secondary"
                  class="flex h-10 w-full items-center justify-center rounded-lg border border-border/60 px-3 py-2 text-sm transition hover:border-primary/80 hover:bg-primary/5"
                  onclick={handleCameraToggle}
                  aria-label="Toggle camera"
                >
                  <Camera size={13} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Camera</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="secondary"
                  class="flex h-10 w-full items-center justify-center rounded-lg border border-border/60 px-3 py-2 text-sm transition hover:border-primary/80 hover:bg-primary/5"
                  onclick={handleScreenshareToggle}
                  aria-label="Toggle screenshare"
                >
                  <Monitor size={13} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Screenshare</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="secondary"
                  class="flex h-10 w-full items-center justify-center rounded-lg border border-border/60 px-3 py-2 text-sm transition hover:border-primary/80 hover:bg-primary/5"
                  onclick={handleSoundboardOpen}
                  aria-label="Open soundboard"
                >
                  <Music size={13} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Open Soundboard</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="secondary"
                  class="flex h-10 w-full items-center justify-center rounded-lg border border-border/60 px-3 py-2 text-sm transition hover:border-primary/80 hover:bg-primary/5"
                  onclick={handleSecondaryPlaceholder}
                  aria-label="Additional voice action"
                >
                  <Sparkles size={13} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">More</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <Separator class="opacity-60" />
      {/if}
      <div class="flex w-full items-center justify-between gap-2 rounded-lg px-1 pr-2 py-1">
        <Popover.Root>
          <Tooltip>
            <TooltipTrigger>
              <Popover.Trigger>
                <div class="flex flex-1 items-center gap-3 truncate px-1 pr-2 py-1 rounded-lg hover:bg-background/50 cursor-pointer">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Open profile"
                    class="size-10 p-0 rounded-full overflow-hidden"
                  >
                    <Avatar class="size-8">
                      <AvatarImage
                        src={$userStore.me?.avatar}
                        alt="User avatar"
                      />
                      <AvatarFallback class="text-xs">ME</AvatarFallback>
                    </Avatar>
                  </Button>
                  <div class="flex flex-col truncate text-left">
                    {#if $userStore.me}
                      <span class="text-sm font-semibold text-foreground truncate">
                        {$userStore.me.name}
                      </span>
                      {#if $userStore.me.tag}
                        <span class="text-[11px] text-muted-foreground truncate">
                          #{ $userStore.me.tag }
                        </span>
                      {:else if $userStore.me.id}
                        <span class="text-[11px] text-muted-foreground truncate">
                          { $userStore.me.id.slice(0, 8) }
                        </span>
                      {/if}
                    {:else}
                      <div class="space-y-1">
                        <Skeleton class="h-4 w-28" />
                        <Skeleton class="h-3 w-16" />
                      </div>
                    {/if}
                  </div>
                </div>
              </Popover.Trigger>
            </TooltipTrigger>
            <TooltipContent side="top">View profile</TooltipContent>
          </Tooltip>
          <Popover.Content
            side="top"
            align="center"
            class={cn("w-auto p-0 border-none", "relative left-4 mb-2")}
          >
            {#if $userStore.me}
              <UserCardModal
                profileUser={$userStore.me}
                openDetailedProfileModal={openProfileHandler}
                {isServerMemberContext}
                serverId={serverId}
              />
            {/if}
          </Popover.Content>
        </Popover.Root>
        <div class="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon"
                class="rounded-xl"
                aria-label={micTooltip()}
                aria-pressed={localMedia().audioEnabled}
                disabled={!localMedia().audioAvailable}
                onclick={toggleMute}
              >
                {#if localMedia().audioEnabled}
                  <Mic size={16} />
                {:else}
                  <MicOff size={16} />
                {/if}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{micTooltip()}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  class="rounded-xl"
                  aria-label={deafTooltip()}
                  aria-pressed={isDeafened}
                  onclick={toggleDeafen}
                >
                {#if !isDeafened}
                  <Headphones size={16} />
                {:else}
                  <HeadphoneOff size={16} />
                {/if}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{deafTooltip()}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  class="rounded-xl"
                  aria-label={settingsTooltip}
                  onclick={handleSettingsClick}
                  disabled={settingsDisabled()}
                >
                <Settings size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{settingsTooltip}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  </div>
</TooltipProvider>
