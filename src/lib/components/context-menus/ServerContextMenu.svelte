<script lang="ts">
  import BaseContextMenu from './BaseContextMenu.svelte';
  import type { Server } from '$lib/models/Server';
  import { userStore } from '$lib/data/stores/userStore';

  type ServerContextMenuAction = {
    action: string;
    itemData: Server | null;
  };

  type ServerContextMenuHandler = (detail: ServerContextMenuAction) => void; // eslint-disable-line no-unused-vars

  type ServerContextMenuProps = {
    x?: number;
    y?: number;
    show?: boolean;
    server?: Server | null;
    onaction?: ServerContextMenuHandler;
    onclose?: () => void;
  };

  let {
    x = 0,
    y = 0,
    show = $bindable(false),
    server = null,
    onaction,
    onclose
  }: ServerContextMenuProps = $props();

  const menuItems = $derived([
    { label: 'Mark As Read', action: 'mark_as_read', data: server },
    { label: 'Mute/Unmute Server', action: 'mute_unmute_server', data: server },
    { label: 'Notification Settings', action: 'notification_settings', data: server },
    { isSeparator: true },
    { label: 'Copy Server ID', action: 'copy_server_id', data: server },
    { label: 'View Icon', action: 'view_icon', data: server },
    { label: 'View Raw', action: 'view_raw', data: server },
    { isSeparator: true },
    ...(server && server.owner_id === $userStore.me?.id
      ? []
      : [{ label: 'Invite People', action: 'invite_people', data: server }]),
    ...(server && server.owner_id === $userStore.me?.id
      ? [
          { label: 'Server Settings', action: 'server-settings', data: server },
          { label: 'Create Channel', action: 'create_channel', data: server },
          { label: 'Create Category', action: 'create_category', data: server },
          { label: 'Create Event', action: 'create_event', data: server },
        ]
      : []),
    { isSeparator: true },
    ...(server && server.owner_id === $userStore.me?.id
      ? []
      : [{ label: 'Leave Server', action: 'leave_server', isDestructive: true, data: server }]),
  ]);

  function handleAction(detail: ServerContextMenuAction) {
    onaction?.(detail);
  }
</script>

<BaseContextMenu
  {x}
  {y}
  bind:show={show}
  menuItems={menuItems}
  onclose={onclose}
  onaction={handleAction}
/>

