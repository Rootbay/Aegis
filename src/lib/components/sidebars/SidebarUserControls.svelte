<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Avatar, AvatarFallback, AvatarImage } from "$lib/components/ui/avatar";
  import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
  } from "$lib/components/ui/tooltip";
  import * as Popover from "$lib/components/ui/popover";
  import UserCardModal from "$lib/components/modals/UserCardModal.svelte";
  import { callStore } from "$lib/features/calls/stores/callStore";
  import { userStore } from "$lib/stores/userStore";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { cn } from "$lib/utils";
  import { Mic, MicOff, Settings, Headphones } from "@lucide/svelte";
  import type { User } from "$lib/features/auth/models/User";

  type OpenProfileHandler = (user: User) => void;

  let {
    openDetailedProfileModal,
    onSettingsClick,
    settingsTooltip = "Settings",
    isServerMemberContext = false,
    serverId = null,
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
    (() => {
      // intentionally empty
    });

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
    audioAvailable: false,
  };

  const localMedia = $derived(() => $callStore.localMedia ?? FALLBACK_LOCAL_MEDIA);
  const micTooltip = $derived(
    () =>
      localMedia().audioEnabled ? "Mute microphone" : "Unmute microphone",
  );
  const deafTooltip = $derived(() => (isDeafened ? "Undeafen" : "Deafen"));
  const settingsDisabled = $derived(() => !onSettingsClick);
</script>


<TooltipProvider>
  <div class="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-2 pb-2">

    <div
      role="main"
      class={cn(
        "pointer-events-auto flex h-14 w-full items-center justify-between gap-2 rounded-lg border border-border/60 bg-card px-1 text-muted-foreground shadow-lg transition-all duration-150",
        overlayHovered ? "shadow-xl" : "",
      )}
      onmouseenter={() => (overlayHovered = true)}
      onmouseleave={() => (overlayHovered = false)}
    >
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
          class="w-auto p-0 border-none"
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
                <Mic class="size-4" />
              {:else}
                <MicOff class="size-4" />
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
              <Headphones class="size-4" />
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
              <Settings class="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{settingsTooltip}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  </div>
</TooltipProvider>
