<script lang="ts">
  type SizeHandler = (size: number) => void; // eslint-disable-line no-unused-vars
  type ZoomHandler = (zoom: number) => void; // eslint-disable-line no-unused-vars

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
    onclose
  }: MagnifierContextMenuProps = $props();

  function handleClickOutside() {
    show = false;
    onclose?.();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      handleClickOutside();
    }
  }

  function setMagnifierSize(size: number) {
    onsetMagnifierSize?.(size);
    onclose?.();
    show = false;
  }

  function setMagnifierZoom(zoom: number) {
    onsetMagnifierZoom?.(zoom);
    onclose?.();
    show = false;
  }

  function handleInnerClick(event: MouseEvent) {
    event.stopPropagation();
  }

  function handleInnerContextMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleInnerKeydown(event: KeyboardEvent) {
    event.stopPropagation();
  }
</script>

{#if show}
  <div
    class="fixed inset-0 z-[10000]"
    onclick={handleClickOutside}
    oncontextmenu={handleClickOutside}
    onkeydown={handleKeydown}
    role="button"
    tabindex="-1"
  >
    <div
      class="absolute bg-gray-700 text-white rounded-md shadow-lg py-1 z-[10001]"
      style="left: {x}px; top: {y}px;"
      onclick={handleInnerClick}
      oncontextmenu={handleInnerContextMenu}
      onkeydown={handleInnerKeydown}
      role="menu"
      tabindex="0"
    >
      <div class="px-4 py-2 text-sm font-semibold border-b border-gray-600">Magnifier Settings</div>
      <button class="block w-full text-left px-4 py-2 text-sm hover:bg-gray-600" onclick={() => setMagnifierSize(100)}>Small (100px)</button>
      <button class="block w-full text-left px-4 py-2 text-sm hover:bg-gray-600" onclick={() => setMagnifierSize(150)}>Medium (150px)</button>
      <button class="block w-full text-left px-4 py-2 text-sm hover:bg-gray-600" onclick={() => setMagnifierSize(200)}>Large (200px)</button>
      <div class="px-4 py-2 text-sm font-semibold border-t border-gray-600 mt-1">Magnifier Zoom</div>
      <button class="block w-full text-left px-4 py-2 text-sm hover:bg-gray-600" onclick={() => setMagnifierZoom(1.5)}>Zoom 1.5x</button>
      <button class="block w-full text-left px-4 py-2 text-sm hover:bg-gray-600" onclick={() => setMagnifierZoom(2)}>Zoom 2x</button>
      <button class="block w-full text-left px-4 py-2 text-sm hover:bg-gray-600" onclick={() => setMagnifierZoom(3)}>Zoom 3x</button>
    </div>
  </div>
{/if}
