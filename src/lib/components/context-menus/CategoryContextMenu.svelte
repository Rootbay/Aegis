<svelte:options runes={true} />

<script lang="ts">
  import FloatingContextMenu, {
    type ContextMenuItemConfig,
  } from "./FloatingContextMenu.svelte";

  type ContextMenuOption = {
    id: string;
    label: string;
  };

  type CategoryContextMenuAction =
    | "create_channel"
    | "create_category"
    | "collapse_category"
    | "collapse_all"
    | "mute_category"
    | "notification_settings"
    | "edit_category"
    | "delete_category"
    | "copy_id"
    | "mark_category_read"
    | "view_raw";

  export type CategoryContextMenuDetail = {
    action: CategoryContextMenuAction;
    categoryId: string;
    option?: ContextMenuOption;
  };

  type CategoryContextMenuHandler = ({
    action,
    categoryId,
    option,
  }: CategoryContextMenuDetail) => void;

  type CategoryContextMenuProps = {
    x: number;
    y: number;
    categoryId: string;
    isCollapsed?: boolean;
    onaction?: CategoryContextMenuHandler;
    onclose?: () => void;
  };

  let {
    x,
    y,
    categoryId,
    isCollapsed = false,
    onaction,
    onclose,
  }: CategoryContextMenuProps = $props();

  const MUTE_OPTIONS: ContextMenuOption[] = [
    { id: "15m", label: "15 Minutes" },
    { id: "1h", label: "1 Hour" },
    { id: "8h", label: "8 Hours" },
    { id: "24h", label: "1 Day" },
    { id: "3d", label: "3 Days" },
    { id: "until_unmuted", label: "Until I Unmute" },
  ];

  const NOTIFICATION_OPTIONS: ContextMenuOption[] = [
    { id: "all_messages", label: "All Messages" },
    { id: "mentions_only", label: "Mentions Only" },
    { id: "nothing", label: "Nothing" },
    { id: "default", label: "Use Server Default" },
  ];

  const MENU_WIDTH = 260;

  function buildBaseMenuItems(): ContextMenuItemConfig<null>[] {
    return [
      { label: "Mark As Read", action: "mark_category_read" },
      { isSeparator: true },
      { label: "Create Channel", action: "create_channel" },
      {
        label: isCollapsed ? "Expand Category" : "Collapse Category",
        action: "collapse_category",
      },
      { label: "Collapse All Categories", action: "collapse_all" },
      { isSeparator: true },
      {
        label: "Mute Category",
        action: "mute_category",
        closeOnSelect: false,
      },
      {
        label: "Notification Settings",
        action: "notification_settings",
        closeOnSelect: false,
      },
      { isSeparator: true },
      { label: "Edit Category", action: "edit_category" },
      {
        label: "Delete Category",
        action: "delete_category",
        isDestructive: true,
      },
      { isSeparator: true },
      { label: "View Raw", action: "view_raw" },
      { label: "Copy Category ID", action: "copy_id" },
    ];
  }

  let baseMenuItems = $state(buildBaseMenuItems());

  const muteSubmenuItems = MUTE_OPTIONS.map((option) => ({
    label: option.label,
    action: "mute_category_option",
    data: option,
  }));

  const notificationSubmenuItems = NOTIFICATION_OPTIONS.map((option) => ({
    label: option.label,
    action: "notification_settings_option",
    data: option,
  }));

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

  $effect(() => {
    baseMenuItems = buildBaseMenuItems();
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
    muteSubmenuY = y + 140;
  }

  function openNotificationSubmenu() {
    showMuteSubmenu = false;
    showNotificationSubmenu = true;
    notificationSubmenuX = x + MENU_WIDTH - 10;
    notificationSubmenuY = y + 180;
  }

  function handleBaseAction(detail: {
    action: string;
    itemData: null;
  }) {
    switch (detail.action) {
      case "mute_category":
        openMuteSubmenu();
        return;
      case "notification_settings":
        openNotificationSubmenu();
        return;
      case "mark_category_read":
      case "create_channel":
      case "collapse_category":
      case "collapse_all":
      case "edit_category":
      case "delete_category":
      case "copy_id":
      case "view_raw": {
        onaction?.({
          action: detail.action as CategoryContextMenuAction,
          categoryId,
          option:
            detail.action === "collapse_category"
              ? {
                  id: isCollapsed ? "expand" : "collapse",
                  label: isCollapsed ? "Expanded" : "Collapsed",
                }
              : undefined,
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
      action: "mute_category",
      categoryId,
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
      categoryId,
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
    menuItems={baseMenuItems}
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
