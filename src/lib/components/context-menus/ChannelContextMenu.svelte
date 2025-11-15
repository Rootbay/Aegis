<svelte:options runes={true} />

<script lang="ts">
  import FloatingContextMenu, {
    type ContextMenuItemConfig,
  } from "./FloatingContextMenu.svelte";
  import type { Channel } from "$lib/features/channels/models/Channel";
  import type { ContextMenuOption } from "./submenuOptions";
  import {
    MUTE_OPTIONS,
    NOTIFICATION_OPTIONS,
    buildSubmenuItems,
    invokeSubmenuOption,
  } from "./submenuOptions";

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

  const MENU_WIDTH = 260;

  function buildMenuItems(): ContextMenuItemConfig<null>[] {
    if (!channel) return [];

    const isVoiceChannel = channel.channel_type === "voice";
    const items: ContextMenuItemConfig<null>[] = [
      { label: "Mark As Read", action: "mark_as_read" },
      { isSeparator: true },
      { label: "Invite People", action: "invite_people" },
      { label: "Copy Link", action: "copy_link" },
      { isSeparator: true },
    ];

    if (isVoiceChannel) {
      items.push(
        { label: "Open Chat", action: "open_chat" },
        {
          label: hideNamesEnabled ? "Show Names" : "Hide Names",
          action: "hide_names",
        },
        { isSeparator: true },
      );
    }

    items.push(
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
      {
        label: isVoiceChannel ? "Create Voice Channel" : "Create Text Channel",
        action: isVoiceChannel ? "create_voice_channel" : "create_text_channel",
      },
      {
        label: "Delete Channel",
        action: "delete_channel",
        isDestructive: true,
      },
      { isSeparator: true },
      { label: "View Raw", action: "view_raw" },
      { label: "Copy Channel ID", action: "copy_channel_id" },
    );

    return items;
  }

  let menuItems = $state<ContextMenuItemConfig<null>[]>([]);

  $effect(() => {
    menuItems = buildMenuItems();
  });

  const muteSubmenuItems = buildSubmenuItems(
    MUTE_OPTIONS,
    "mute_channel_option",
  );

  const notificationSubmenuItems = buildSubmenuItems(
    NOTIFICATION_OPTIONS,
    "notification_settings_option",
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
    invokeSubmenuOption(detail, (option) => {
      onaction?.({
        action: "mute_channel",
        channelId: channel.id,
        option,
      });
      closeAllMenus();
    });
  }

  function handleNotificationSubmenuAction(detail: {
    action: string;
    itemData: ContextMenuOption | null;
  }) {
    invokeSubmenuOption(detail, (option) => {
      onaction?.({
        action: "notification_settings",
        channelId: channel.id,
        option,
      });
      closeAllMenus();
    });
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
