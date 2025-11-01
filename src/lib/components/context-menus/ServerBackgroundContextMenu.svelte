<svelte:options runes={true} />

<script lang="ts">
  import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
  } from "$lib/components/ui/dropdown-menu/index.js";
  import {
    Plus,
    UserPlus,
    ExternalLink,
    Square,
    Image,
    Code,
  } from "@lucide/svelte";

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

<DropdownMenu>
  <DropdownMenuTrigger>
    {@render children?.()}
  </DropdownMenuTrigger>

  <DropdownMenuContent class="w-48 text-sm">
    <DropdownMenuItem onselect={() => handleAction("hide_muted_channels")}>
      <Square class="mr-2 h-4 w-4" /> Hide Muted Channels
    </DropdownMenuItem>

    <DropdownMenuSeparator />

    <DropdownMenuItem onselect={() => handleAction("create_channel")}>
      <Plus class="mr-2 h-4 w-4" /> Create Channel
    </DropdownMenuItem>
    <DropdownMenuItem onselect={() => handleAction("create_category")}>
      <Plus class="mr-2 h-4 w-4" /> Create Category
    </DropdownMenuItem>
    <DropdownMenuItem onselect={() => handleAction("invite_people")}>
      <UserPlus class="mr-2 h-4 w-4" /> Invite to Server
    </DropdownMenuItem>

    <DropdownMenuSeparator />

    <DropdownMenuItem onselect={() => handleAction("view_icon")}>
      <Image class="mr-2 h-4 w-4" /> View Icon
    </DropdownMenuItem>
    <DropdownMenuItem onselect={() => handleAction("view_raw")}>
      <Code class="mr-2 h-4 w-4" /> View Raw
    </DropdownMenuItem>
    <DropdownMenuItem onselect={() => handleAction("view_reviews")}>
      <ExternalLink class="mr-2 h-4 w-4" /> View Reviews
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
