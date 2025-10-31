<svelte:options runes={true} />

<script lang="ts">
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
  } from "$lib/components/ui/dropdown-menu";

  type SizeHandler = ({ size }: { size: number }) => void;
  type ZoomHandler = ({ zoom }: { zoom: number }) => void;

  type MagnifierContextMenuProps = {
    x?: number;
    y?: number;
    show?: boolean;
    onsetMagnifierSize?: SizeHandler;
    onsetMagnifierZoom?: ZoomHandler;
    onclose?: () => void;
  };

  let {
    x = 0,
    y = 0,
    show = $bindable(false),
    onsetMagnifierSize,
    onsetMagnifierZoom,
    onclose,
  }: MagnifierContextMenuProps = $props();

  function close() {
    show = false;
    onclose?.();
  }

  function setMagnifierSize(size: number) {
    onsetMagnifierSize?.({ size });
    close();
  }

  function setMagnifierZoom(zoom: number) {
    onsetMagnifierZoom?.({ zoom });
    close();
  }
</script>

<DropdownMenu open={show}>
  <DropdownMenuContent
    class="w-56 text-sm"
    style={`position:fixed; left:${x}px; top:${y}px;`}
  >
    <DropdownMenuLabel>Magnifier Settings</DropdownMenuLabel>
    <DropdownMenuItem onselect={() => setMagnifierSize(100)}>
      Small (100px)
    </DropdownMenuItem>
    <DropdownMenuItem onselect={() => setMagnifierSize(150)}>
      Medium (150px)
    </DropdownMenuItem>
    <DropdownMenuItem onselect={() => setMagnifierSize(200)}>
      Large (200px)
    </DropdownMenuItem>

    <DropdownMenuSeparator />

    <DropdownMenuLabel>Magnifier Zoom</DropdownMenuLabel>
    <DropdownMenuItem onselect={() => setMagnifierZoom(1.5)}
      >Zoom 1.5x</DropdownMenuItem
    >
    <DropdownMenuItem onselect={() => setMagnifierZoom(2)}
      >Zoom 2x</DropdownMenuItem
    >
    <DropdownMenuItem onselect={() => setMagnifierZoom(3)}
      >Zoom 3x</DropdownMenuItem
    >
  </DropdownMenuContent>
</DropdownMenu>
