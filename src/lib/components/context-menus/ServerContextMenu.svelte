<script lang="ts">
  import BaseContextMenu from './BaseContextMenu.svelte';
  import type { Server } from '$lib/models/Server';
  import { userStore } from '$lib/data/stores/userStore';

  export let x = 0;
  export let y = 0;
  export let show = false;
  export let server: Server | null = null;
  export let onAction: (action: { action: string; data: any }) => void;
  export let onClose: () => void;

  $: menuItems = [
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
  ];

  function handleAction(event: CustomEvent) {
    onAction(event.detail);
  }
</script>

<BaseContextMenu
  {x}
  {y}
  {show}
  menuItems={menuItems}
  on:close={onClose}
  on:action={handleAction}
/>