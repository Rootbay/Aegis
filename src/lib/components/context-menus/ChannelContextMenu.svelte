<svelte:options runes={true} />

<script lang="ts">
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
  } from "$lib/components/ui/dropdown-menu/index.js";

  import type { Channel } from "$lib/features/channels/models/Channel";

  type ChannelContextMenuDetail = {
    action: "mark_as_read" | "invite_people" | "copy_link" | "mute_channel" | 
          "notification_settings" | "edit_channel" | "duplicate_channel" |
          "create_text_channel" | "delete_channel" | "copy_channel_id" |
          "open_chat" | "hide_names" | "create_voice_channel";
    channelId: string;
  };

  type ChannelContextMenuHandler = (detail: ChannelContextMenuDetail) => void;

  type ChannelContextMenuProps = {
    x: number;
    y: number;
    channel: Channel;
    hideNamesEnabled?: boolean;
    onaction?: ChannelContextMenuHandler;
  };

  let {
    x,
    y,
    channel,
    hideNamesEnabled = false,
    onaction,
  }: ChannelContextMenuProps = $props();

  function handleAction(action: "mark_as_read" | "invite_people" | "copy_link" | 
                      "mute_channel" | "notification_settings" | "edit_channel" |
                      "duplicate_channel" | "create_text_channel" | 
                      "delete_channel" | "copy_channel_id" | 
                      "open_chat" | "hide_names" | "create_voice_channel") {
    onaction?.({ action, channelId: channel.id });
  }
</script>

<DropdownMenu open>
  <DropdownMenuContent
    class="w-48 text-sm"
    side="right"
    style={`position:absolute; left:${x}px; top:${y}px;`}
  >
    {#if channel.channel_type === "text"}
      <DropdownMenuItem onselect={() => handleAction("mark_as_read")}>
        Mark As Read
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem onselect={() => handleAction("invite_people")}>
        Invite People
      </DropdownMenuItem>
      <DropdownMenuItem onselect={() => handleAction("copy_link")}>
        Copy Link
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem onselect={() => handleAction("mute_channel")}>
        Mute Channel
      </DropdownMenuItem>
      <DropdownMenuItem onselect={() => handleAction("notification_settings")}>
        Notification Settings
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem onselect={() => handleAction("edit_channel")}>
        Edit Channel
      </DropdownMenuItem>
      <DropdownMenuItem onselect={() => handleAction("duplicate_channel")}>
        Duplicate Channel
      </DropdownMenuItem>
      <DropdownMenuItem onselect={() => handleAction("create_text_channel")}>
        Create Text Channel
      </DropdownMenuItem>
      <DropdownMenuItem
        class="text-destructive focus:text-destructive"
        onselect={() => handleAction("delete_channel")}
      >
        Delete Channel
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem onselect={() => handleAction("copy_channel_id")}>
        Copy Channel ID
      </DropdownMenuItem>
    {:else if channel.channel_type === "voice"}
      <DropdownMenuItem onselect={() => handleAction("mark_as_read")}>
        Mark As Read
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem onselect={() => handleAction("invite_people")}>
        Invite People
      </DropdownMenuItem>
      <DropdownMenuItem onselect={() => handleAction("copy_link")}>
        Copy Link
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem onselect={() => handleAction("open_chat")}>
        Open Chat
      </DropdownMenuItem>
      <DropdownMenuItem onselect={() => handleAction("hide_names")}>
        {hideNamesEnabled ? "Show Names" : "Hide Names"}
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem onselect={() => handleAction("mute_channel")}>
        Mute Channel
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem onselect={() => handleAction("edit_channel")}>
        Edit Channel
      </DropdownMenuItem>
      <DropdownMenuItem onselect={() => handleAction("duplicate_channel")}>
        Duplicate Channel
      </DropdownMenuItem>
      <DropdownMenuItem onselect={() => handleAction("create_voice_channel")}>
        Create Voice Channel
      </DropdownMenuItem>
      <DropdownMenuItem
        class="text-destructive focus:text-destructive"
        onselect={() => handleAction("delete_channel")}
      >
        Delete Channel
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem onselect={() => handleAction("copy_channel_id")}>
        Copy Channel ID
      </DropdownMenuItem>
    {/if}
  </DropdownMenuContent>
</DropdownMenu>
