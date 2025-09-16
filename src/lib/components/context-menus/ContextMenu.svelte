<svelte:options runes={true} />

<script lang="ts">
  import BaseContextMenu from './BaseContextMenu.svelte';
  import type { Friend } from '$lib/models/Friend';
  import type { User } from '$lib/models/User';

  type ContextMenuItem = {
    label?: string;
    action?: string;
    isDestructive?: boolean;
    isSeparator?: boolean;
    data: Friend | User | null;
  };

  const props = $props<{
    x?: number;
    y?: number;
    show?: boolean;
    friend?: Friend | User | null;
    onaction?: (detail: { action: string; itemData: Friend | User | null }) => void;
    onclose?: () => void;
  }>();

  let {
    x = 0,
    y = 0,
    show = false,
    friend = null,
    onaction,
    onclose
  } = props;

  let menuItems = $state<ContextMenuItem[]>([]);

  $effect(() => {
    menuItems = [
      { label: 'View Profile', action: 'view_profile', data: friend },
      { label: 'Remove Friend', action: 'remove_friend', data: friend },
      { isSeparator: true, data: friend },
      { label: 'Block', action: 'block_user', isDestructive: true, data: friend },
      { label: 'Mute', action: 'mute_user', data: friend },
      { label: 'Report User', action: 'report_user', isDestructive: true, data: friend },
    ];
  });

  function handleAction(detail: { action: string; itemData: Friend | User | null }) {
    detail.itemData = friend;
    onaction?.(detail);
  }
</script>

<BaseContextMenu
  {x}
  {y}
  {show}
  {menuItems}
  onclose={onclose}
  onaction={handleAction}
/>


