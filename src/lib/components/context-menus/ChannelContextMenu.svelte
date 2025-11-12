<svelte:options runes={true} />

<script lang="ts">
  import FloatingContextMenu, {
    type ContextMenuItemConfig,
  } from "./FloatingContextMenu.svelte";
  import type { Channel } from "$lib/features/channels/models/Channel";

  type ContextMenuOption = {
    id: string;
    label: string;
  };

  type ChannelContextMenuAction =
    | "mark_as_read"
    | "invite_people"
    | "copy_link"
    | "mute_channel"
    | "notification_settings"
    | "edit_channel"
    | "duplicate_channel"
    | "create_text_channel"
    | "delete_channel"
    | "copy_channel_id"
    | "open_chat"
    | "hide_names"
    | "create_voice_channel"
    | "view_raw";

  export type ChannelContextMenuDetail = {
    action: ChannelContextMenuAction;
    channelId: string;
    option?: ContextMenuOption;
  };

  type ChannelContextMenuHandler = (detail: ChannelContextMenuDetail) => void;

  type ChannelContextMenuProps = {
    x: number;
    y: number;
    channel: Channel;
    hideNamesEnabled?: boolean;
    onaction?: ChannelContextMenuHandler;
    onclose?: () => void;
  };

  let {
    x,
    y,
    channel,
    hideNamesEnabled = false,
    onaction,
    onclose,
  }: ChannelContextMenuProps = $props();

  const MUTE_OPTIONS: ContextMenuOption[] = [
    { id: "15m", label: "15 Minutes" },
    { id: "1h", label: "1 Hour" },
    { id: "8h", label: "8 Hours" },
    { id: "24h", label: "1 Day" },
    { id: "3d", label: "3 Days" },
    { id: "until_unmuted", label: "Until I Unmute" },
  ];

  const CHANNEL_NOTIFICATION_OPTIONS: ContextMenuOption[] = [
    { id: "all_messages", label: "All Messages" },
    { id: "mentions_only", label: "Mentions Only" },
    { id: "nothing", label: "Nothing" },
    { id: "default", label: "Use Server Default" },
  ];

  const MENU_WIDTH = 260;

  const textMenuItems: ContextMenuItemConfig<null>[] = [
    { label: "Mark As Read", action: "mark_as_read" },
    { isSeparator: true },
    { label: "Invite People", action: "invite_people" },
    { label: "Copy Link", action: "copy_link" },
    { isSeparator: true },
    {
      label: "Mute Channel",
      action: "mute_channel",
      closeOnSelect: false,
    },
    {
      label: "Notification Settings",
      action: "notification_settings",
      closeOnSelect: false,
    },
    { isSeparator: true },
    { label: "Edit Channel", action: "edit_channel" },
    { label: "Duplicate Channel", action: "duplicate_channel" },
    { label: "Create Text Channel", action: "create_text_channel" },
    {
      label: "Delete Channel",
      action: "delete_channel",
      isDestructive: true,
    },
    { isSeparator: true },
    { label: "View Raw", action: "view_raw" },
    { label: "Copy Channel ID", action: "copy_channel_id" },
  ];

  function buildVoiceMenuItems(): ContextMenuItemConfig<null>[] {
    return [
      { label: "Mark As Read", action: "mark_as_read" },
      { isSeparator: true },
      { label: "Invite People", action: "invite_people" },
      { label: "Copy Link", action: "copy_link" },
      { isSeparator: true },
      { label: "Open Chat", action: "open_chat" },
      {
        label: hideNamesEnabled ? "Show Names" : "Hide Names",
        action: "hide_names",
      },
      { isSeparator: true },
      {
        label: "Mute Channel",
        action: "mute_channel",
        closeOnSelect: false,
      },
      {
        label: "Notification Settings",
        action: "notification_settings",
        closeOnSelect: false,
      },
      { isSeparator: true },
      { label: "Edit Channel", action: "edit_channel" },
      { label: "Duplicate Channel", action: "duplicate_channel" },
      { label: "Create Voice Channel", action: "create_voice_channel" },
      {
        label: "Delete Channel",
        action: "delete_channel",
        isDestructive: true,
      },
      { isSeparator: true },
      { label: "View Raw", action: "view_raw" },
      { label: "Copy Channel ID", action: "copy_channel_id" },
    ];
  }

  let voiceMenuItems = $state(buildVoiceMenuItems());
  let menuItems = $state<ContextMenuItemConfig<null>[]>([]);

  $effect(() => {
    voiceMenuItems = buildVoiceMenuItems();
  });

  $effect(() => {
    menuItems =
      channel.channel_type === "voice" ? voiceMenuItems : textMenuItems;
  });

  const muteSubmenuItems = MUTE_OPTIONS.map((option) => ({
    label: option.label,
    action: "mute_channel_option",
    data: option,
  }));

  const notificationSubmenuItems = CHANNEL_NOTIFICATION_OPTIONS.map(
    (option) => ({
      label: option.label,
      action: "notification_settings_option",
      data: option,
    }),
  );

  let showMenu = $state(true);
  let showMuteSubmenu = $state(false);
  let showNotificationSubmenu = $state(false);
  let muteSubmenuX = $state(0);
  let muteSubmenuY = $state(0);
  let notificationSubmenuX = $state(0);
  let notificationSubmenuY = $state(0);

  $effect(() => {
    if (!showMenu) {
      onclose?.();
    }
  });

  function closeAllMenus() {
    showMenu = false;
    showMuteSubmenu = false;
    showNotificationSubmenu = false;
  }

  function openMuteSubmenu() {
    showMuteSubmenu = true;
    showNotificationSubmenu = false;
    muteSubmenuX = x + MENU_WIDTH - 10;
    muteSubmenuY = y + (channel.channel_type === "voice" ? 150 : 130);
  }

  function openNotificationSubmenu() {
    showMuteSubmenu = false;
    showNotificationSubmenu = true;
    notificationSubmenuX = x + MENU_WIDTH - 10;
    notificationSubmenuY = y + (channel.channel_type === "voice" ? 190 : 160);
  }

  function handleBaseAction(detail: {
    action: string;
    itemData: null;
  }) {
    switch (detail.action) {
      case "mute_channel":
        openMuteSubmenu();
        return;
      case "notification_settings":
        openNotificationSubmenu();
        return;
      case "mark_as_read":
      case "invite_people":
      case "copy_link":
      case "edit_channel":
      case "duplicate_channel":
      case "create_text_channel":
      case "delete_channel":
      case "copy_channel_id":
      case "open_chat":
      case "hide_names":
      case "create_voice_channel":
      case "view_raw": {
        onaction?.({
          action: detail.action as ChannelContextMenuAction,
          channelId: channel.id,
        });
        closeAllMenus();
        return;
      }
      default:
        return;
    }
  }

  function handleMuteSubmenuAction(detail: {
    action: string;
    itemData: ContextMenuOption | null;
  }) {
    const option = detail.itemData;
    if (!option) return;
    onaction?.({
      action: "mute_channel",
      channelId: channel.id,
      option,
    });
    closeAllMenus();
  }

  function handleNotificationSubmenuAction(detail: {
    action: string;
    itemData: ContextMenuOption | null;
  }) {
    const option = detail.itemData;
    if (!option) return;
    onaction?.({
      action: "notification_settings",
      channelId: channel.id,
      option,
    });
    closeAllMenus();
  }
</script>

  {#if showMenu}
    <FloatingContextMenu
      {x}
      {y}
      bind:show={showMenu}
      menuItems={menuItems}
      menuWidth={MENU_WIDTH}
      onaction={handleBaseAction}
      onclose={() => {
        showMenu = false;
        onclose?.();
    }}
  />
{/if}

{#if showMuteSubmenu}
  <FloatingContextMenu
    x={muteSubmenuX}
    y={muteSubmenuY}
    bind:show={showMuteSubmenu}
    menuItems={muteSubmenuItems}
    menuWidth={MENU_WIDTH}
    onaction={handleMuteSubmenuAction}
    onclose={() => (showMuteSubmenu = false)}
  />
{/if}

{#if showNotificationSubmenu}
  <FloatingContextMenu
    x={notificationSubmenuX}
    y={notificationSubmenuY}
    bind:show={showNotificationSubmenu}
    menuItems={notificationSubmenuItems}
    menuWidth={MENU_WIDTH}
    onaction={handleNotificationSubmenuAction}
    onclose={() => (showNotificationSubmenu = false)}
  />
{/if}
