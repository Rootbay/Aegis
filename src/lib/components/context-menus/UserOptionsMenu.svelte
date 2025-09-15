<script>
  import BaseContextMenu from './BaseContextMenu.svelte';

  export let x = 0;
  export let y = 0;
  export let show = false;

  const menuItems = [
    { label: 'Invite to Server', action: 'invite_to_server' },
    { label: 'Ignore', action: 'ignore' },
    { label: 'Mute User', action: 'mute_user' },
    { isSeparator: true },
    { label: 'Block', action: 'block', isDestructive: true },
    { label: 'Report', action: 'report', isDestructive: true },
    { isSeparator: true },
    { label: 'Copy User ID', action: 'copy_user_id' },
    { label: 'View Reviews', action: 'view_reviews' },
    { label: 'Add to Group', action: 'add_to_group' },
  ];
</script>

<BaseContextMenu
  {x}
  {y}
  {show}
  menuItems={menuItems}
  on:close
  on:action
/>