<svelte:options runes={true} />

<script lang="ts">
  import {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
  } from "$lib/components/ui/context-menu/index.js";
  import {
    Plus,
    UserPlus,
    ExternalLink,
    Square,
    Image,
    Code,
  } from "@lucide/svelte";

  // eslint-disable-next-line no-unused-vars
  type ServerBackgroundActionHandler = ({ action }: { action: string }) => void;

  type ServerBackgroundContextMenuProps = {
    onaction?: ServerBackgroundActionHandler;
    children?: any;
  };

  let { onaction, children }: ServerBackgroundContextMenuProps = $props();

  function handleAction(action: string) {
    onaction?.({ action });
  }
</script>

<ContextMenu>
  <ContextMenuTrigger>
    {@render children?.()}
  </ContextMenuTrigger>

  <ContextMenuContent class="w-48 text-sm">
    <ContextMenuItem onSelect={() => handleAction("hide_muted_channels")}>
      <Square class="mr-2 h-4 w-4" /> Hide Muted Channels
    </ContextMenuItem>

    <ContextMenuSeparator />

    <ContextMenuItem onSelect={() => handleAction("create_channel")}>
      <Plus class="mr-2 h-4 w-4" /> Create Channel
    </ContextMenuItem>
    <ContextMenuItem onSelect={() => handleAction("create_category")}>
      <Plus class="mr-2 h-4 w-4" /> Create Category
    </ContextMenuItem>
    <ContextMenuItem onSelect={() => handleAction("invite_people")}>
      <UserPlus class="mr-2 h-4 w-4" /> Invite to Server
    </ContextMenuItem>

    <ContextMenuSeparator />

    <ContextMenuItem onSelect={() => handleAction("view_icon")}>
      <Image class="mr-2 h-4 w-4" /> View Icon
    </ContextMenuItem>
    <ContextMenuItem onSelect={() => handleAction("view_raw")}>
      <Code class="mr-2 h-4 w-4" /> View Raw
    </ContextMenuItem>
    <ContextMenuItem onSelect={() => handleAction("view_reviews")}>
      <ExternalLink class="mr-2 h-4 w-4" /> View Reviews
    </ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
