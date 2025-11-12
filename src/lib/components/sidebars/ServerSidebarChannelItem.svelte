<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge";
  import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
  } from "$lib/components/ui/tooltip/index.js";
  import { Hash, Mic, Lock, Plus, Settings } from "@lucide/svelte";
  import type { Channel } from "$lib/features/channels/models/Channel";
  import type { ChatMetadata } from "$lib/features/chat/stores/chatStore";

  const {
    channel,
    metadata,
    draggingChannelId = null,
    channelType = "text",
    active = false,
    activeClass = "bg-primary/80 text-foreground",
    primaryAction = (channel: Channel) => {},
    inviteHandler = (channel: Channel, event: MouseEvent) => {},
    settingsHandler = (channel: Channel, event: MouseEvent) => {},
    dragStartHandler = (event: DragEvent, channel: Channel) => {},
    dragEndHandler = (event: DragEvent) => {},
    dragOverHandler = (event: DragEvent) => {},
    dropHandler = (event: DragEvent) => {},
    contextMenuHandler = (event: MouseEvent, channel: Channel) => {},
    dataActive,
  } = $props<{
    channel: Channel;
    metadata: ChatMetadata | null | undefined;
    draggingChannelId?: string | null;
    channelType?: "text" | "voice";
    active?: boolean;
    activeClass?: string;
    primaryAction?: (channel: Channel) => void;
    inviteHandler?: (channel: Channel, event: MouseEvent) => void;
    settingsHandler?: (channel: Channel, event: MouseEvent) => void;
    dragStartHandler?: (event: DragEvent, channel: Channel) => void;
    dragEndHandler?: (event: DragEvent) => void;
    dragOverHandler?: (event: DragEvent) => void;
    dropHandler?: (event: DragEvent) => void;
    contextMenuHandler?: (event: MouseEvent, channel: Channel) => void;
    dataActive?: string | undefined;
  }>();

  const baseTriggerClasses =
    "group w-full h-[34px] text-left py-2 px-2 flex items-center justify-between transition-colors cursor-pointer my-1 rounded-md";
  const inactiveClasses =
    "text-muted-foreground hover:bg-muted/50 hover:text-foreground";

  const unreadCount = $derived(metadata?.unreadCount ?? 0);

  const triggerClasses = $derived(
    [
      baseTriggerClasses,
      active ? activeClass : inactiveClasses,
      draggingChannelId === channel.id ? "opacity-50" : "",
    ]
      .filter(Boolean)
      .join(" ")
  );

  function handlePrimaryAction() {
    primaryAction(channel);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handlePrimaryAction();
    }
  }
</script>

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger
      draggable
      class={triggerClasses}
      ondragstart={(event) => dragStartHandler(event, channel)}
      ondragend={dragEndHandler}
      ondragover={dragOverHandler}
      ondrop={dropHandler}
      onclick={handlePrimaryAction}
      onkeydown={handleKeydown}
      oncontextmenu={(event) => contextMenuHandler(event, channel)}
      data-active={dataActive}
      title={channel.topic ?? undefined}
    >
      <div class="flex items-center truncate">
        {#if channelType === "text"}
          <Hash size={10} class="mr-1" />
        {:else}
          <Mic size={12} class="mr-1" />
        {/if}
        <span class="truncate select-none ml-2">{channel.name}</span>
        {#if channel.private}
          <Badge
            class="ml-2 flex items-center gap-1 border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
          >
            <Lock size={10} />
            Private
          </Badge>
        {/if}
      </div>
      <div class="ml-auto flex items-center gap-2">
        {#if unreadCount > 0}
          <Badge
            class="shrink-0 bg-primary/10 text-primary border border-primary/20 px-2 py-0 text-[11px]"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        {/if}
        <div
          class="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        >
          <button
            class="text-muted-foreground hover:text-foreground cursor-pointer mr-1.5"
            aria-label="Invite to channel"
            onclick={(event) => inviteHandler(channel, event)}
          >
            <Plus size={16} />
          </button>
          <button
            class="text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Channel settings"
            onclick={(event) => settingsHandler(channel, event)}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>
    </TooltipTrigger>
    {#if channel.topic}
      <TooltipContent
        side="right"
        align="start"
        class="max-w-xs text-xs leading-snug"
      >
        {channel.topic}
      </TooltipContent>
    {/if}
  </Tooltip>
</TooltipProvider>
