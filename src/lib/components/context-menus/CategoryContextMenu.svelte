<svelte:options runes={true} />

<script lang="ts">
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
  } from "$lib/components/ui/dropdown-menu";

  type CategoryContextMenuDetail = {
    action: string;
    categoryId: string;
  };

  type CategoryContextMenuHandler = (detail: CategoryContextMenuDetail) => void;

  type CategoryContextMenuProps = {
    x: number;
    y: number;
    categoryId: string;
    onaction?: CategoryContextMenuHandler;
  };

  let { x, y, categoryId, onaction }: CategoryContextMenuProps = $props();

  function handleAction(action: string) {
    onaction?.({ action, categoryId });
  }
</script>

<DropdownMenu open>
  <DropdownMenuContent
    class="w-52 text-sm"
    style={`position:fixed; left:${x}px; top:${y}px;`}
  >
    <DropdownMenuItem onselect={() => handleAction("collapse_category")}>
      Collapse Category
    </DropdownMenuItem>
    <DropdownMenuItem onselect={() => handleAction("collapse_all")}>
      Collapse All Categories
    </DropdownMenuItem>

    <DropdownMenuSeparator />

    <DropdownMenuItem onselect={() => handleAction("mute_category")}>
      Mute Category
    </DropdownMenuItem>
    <DropdownMenuItem onselect={() => handleAction("notification_settings")}>
      Notification Settings
    </DropdownMenuItem>

    <DropdownMenuSeparator />

    <DropdownMenuItem onselect={() => handleAction("edit_category")}>
      Edit Category
    </DropdownMenuItem>
    <DropdownMenuItem
      class="text-destructive focus:text-destructive"
      onselect={() => handleAction("delete_category")}
    >
      Delete Category
    </DropdownMenuItem>

    <DropdownMenuSeparator />

    <DropdownMenuItem onselect={() => handleAction("copy_id")}>
      Copy Category ID
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
