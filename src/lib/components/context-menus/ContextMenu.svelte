<svelte:options runes={true} />

<script lang="ts">
  import BaseContextMenu from "./BaseContextMenu.svelte";
  import type { Friend } from "$lib/features/friends/models/Friend";
  import type { User } from "$lib/features/auth/models/User";

  type ContextMenuDetail = {
    action: string;
    itemData: Friend | User | null;
  };

  type ContextMenuHandler = (detail: ContextMenuDetail) => void; // eslint-disable-line no-unused-vars

  type ContextMenuProps = {
    x?: number;
    y?: number;
    show?: boolean;
    friend?: Friend | User | null;
    onaction?: ContextMenuHandler;
    onclose?: () => void;
  };

  let {
    x = 0,
    y = 0,
    show = $bindable(false),
    friend = null,
    onaction,
    onclose,
  }: ContextMenuProps = $props();

  const menuItems = $derived([
    { label: "View Profile", action: "view_profile", data: friend },
    { label: "Remove Friend", action: "remove_friend", data: friend },
    { isSeparator: true, data: friend },
    { label: "Block", action: "block_user", isDestructive: true, data: friend },
    { label: "Mute", action: "mute_user", data: friend },
    {
      label: "Report User",
      action: "report_user",
      isDestructive: true,
      data: friend,
    },
  ]);

  function handleAction(detail: ContextMenuDetail) {
    onaction?.({ ...detail, itemData: friend });
  }
</script>

<BaseContextMenu
  {x}
  {y}
  bind:show
  {menuItems}
  {onclose}
  onaction={handleAction}
/>
