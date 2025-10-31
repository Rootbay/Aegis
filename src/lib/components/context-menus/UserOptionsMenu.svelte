<script lang="ts">
  import BaseContextMenu from "./BaseContextMenu.svelte";

  let {
    x = 0,
    y = 0,
    show = false,
    onaction = undefined,
    onclose = undefined,
    ignored = false,
  } = $props();

  const menuItems = $derived(() => [
    { label: "Invite to Server", action: "invite_to_server" },
    { label: "View Reviews", action: "view_reviews" },
    { label: ignored ? "Unignore" : "Ignore", action: "ignore" },
    { label: "Mute User", action: "mute_user" },
    { isSeparator: true },
    { label: "Block", action: "block", isDestructive: true },
    { label: "Report", action: "report", isDestructive: true },
    { isSeparator: true },
    { label: "Copy User ID", action: "copy_user_id" },
    { label: "Add to Group", action: "add_to_group" },
  ]);
</script>

<BaseContextMenu {x} {y} {show} {menuItems} {onclose} {onaction} />
