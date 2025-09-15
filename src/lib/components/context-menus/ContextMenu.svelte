<script>
  import BaseContextMenu from './BaseContextMenu.svelte';

  export let x = 0;
  export let y = 0;
  export let show = false;
  export let friend = null;
  export let onAction;

  $: menuItems = [
    { label: 'View Profile', action: 'view_profile', data: friend },
    { label: 'Remove Friend', action: 'remove_friend', data: friend },
    { isSeparator: true },
    { label: 'Block', action: 'block_user', isDestructive: true, data: friend },
    { label: 'Mute', action: 'mute_user', data: friend },
    { label: 'Report User', action: 'report_user', isDestructive: true, data: friend },
  ];

  function handleAction(event) {
    event.detail.itemData = friend;
    onAction(event.detail);
  }
</script>

<BaseContextMenu
  {x}
  {y}
  {show}
  menuItems={menuItems}
  on:close
  on:action={handleAction}
/>
