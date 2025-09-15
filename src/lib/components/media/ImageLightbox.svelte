<script lang="ts">
  import { mdiClose, mdiDownload, mdiMagnifyPlus, mdiMagnifyMinus } from '@mdi/js';
  import Icon from '$lib/components/ui/Icon.svelte';
  import MagnifierContextMenu from '$lib/components/context-menus/MagnifierContextMenu.svelte';

  export let imageUrl = '';
  export let show = false;
  export let onClose: () => void;
  export let onSave: (imageUrl: string) => void;

  let imageZoomLevel = 1;
  let magnifierZoom = 2;
  let magnifierSize = 150;
  let magnifierX = 0;
  let magnifierY = 0;
  let imageMouseX = 0;
  let imageMouseY = 0;
  let showMagnifier = false;
  let imageElement: HTMLImageElement;
  let parentDivElement: HTMLDivElement;

  let showContextMenu = false;
  let contextMenuX = 0;
  let contextMenuY = 0;

  function closeLightbox() {
    show = false;
    onClose();
  }

  async function saveImage() {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = imageUrl.substring(imageUrl.lastIndexOf('/') + 1) || 'downloaded_image.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
      onSave(imageUrl);
    } catch (error) {
      console.error('Error saving image:', error);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeLightbox();
    }
  }

  function handleImageMouseMove(event: MouseEvent) {
    const image = event.currentTarget as HTMLImageElement;
    const imageRect = image.getBoundingClientRect();
    const parentRect = parentDivElement.getBoundingClientRect();

    imageMouseX = event.clientX - imageRect.left;
    imageMouseY = event.clientY - imageRect.top;

    magnifierX = imageMouseX + (imageRect.left - parentRect.left);
    magnifierY = imageMouseY + (imageRect.top - parentRect.top);
    showMagnifier = true;
  }

  function handleImageMouseLeave() {
    showMagnifier = false;
  }

  function handleContextMenu(event: MouseEvent) {
    showContextMenu = true;
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
  }

  function handleSetMagnifierSize(event: CustomEvent) {
    magnifierSize = event.detail;
  }

  function handleSetMagnifierZoom(event: CustomEvent) {
    magnifierZoom = event.detail;
  }

  function handleMagnifierWheel(event: WheelEvent) {
    event.preventDefault();
    const zoomAmount = 0.2;
    if (event.deltaY < 0) {
      magnifierZoom = Math.min(magnifierZoom + zoomAmount, 5);
    } else {
      magnifierZoom = Math.max(magnifierZoom - zoomAmount, 1);
    }
  }

  function zoomIn() {
    imageZoomLevel = Math.min(imageZoomLevel + 0.2, 3);
  }

  function zoomOut() {
    imageZoomLevel = Math.max(imageZoomLevel - 0.2, 1);
  }

  import { onMount, onDestroy } from 'svelte';

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if show}
  <div
    class="fixed inset-0 flex items-center justify-center z-[9999]"
    style="background-color: rgba(0, 0, 0, 0.7);"
    onclick={closeLightbox}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') closeLightbox(); }}
    role="button"
    tabindex="0"
  >
    <div class="absolute top-4 right-4 bg-gray-800 p-2 rounded-lg flex space-x-2">
      <button
        class="text-white hover:text-gray-300 z-10 cursor-pointer"
        onclick={zoomIn}
        aria-label="Zoom In"
      >
        <Icon data={mdiMagnifyPlus} size="6" />
      </button>
      <button
        class="text-white hover:text-gray-300 z-10 cursor-pointer"
        onclick={zoomOut}
        aria-label="Zoom Out"
      >
        <Icon data={mdiMagnifyMinus} size="6" />
      </button>
      <button
        class="text-white hover:text-gray-300 z-10 cursor-pointer"
        onclick={saveImage}
        aria-label="Save image"
      >
        <Icon data={mdiDownload} size="6" />
      </button>
      <button
        class="text-white hover:text-gray-300 z-10 cursor-pointer"
        onclick={closeLightbox}
        aria-label="Close image"
      >
        <Icon data={mdiClose} size="6" />
      </button>
    </div>
    <div bind:this={parentDivElement} class="relative flex items-center justify-center" role="presentation" tabindex="-1" oncontextmenu={(e) => { e.preventDefault(); handleContextMenu(e); }}>
      <img
        bind:this={imageElement}
        src={imageUrl}
        alt="Profile"
        class="w-[40vh] h-[40vh] object-contain"
        style="transform: scale({imageZoomLevel});"
        onmousemove={handleImageMouseMove}
        onmouseleave={handleImageMouseLeave}
        onwheel={handleMagnifierWheel}
      />

      {#if showMagnifier}
        <div
          class="absolute rounded-full border-2 border-white overflow-hidden pointer-events-none"
          style="
            width: {magnifierSize}px;
            height: {magnifierSize}px;
            left: {magnifierX - magnifierSize / 2}px;
            top: {magnifierY - magnifierSize / 2}px;
            background-image: url({imageUrl});
            background-size: {(imageElement.width * imageZoomLevel) * magnifierZoom}px {(imageElement.height * imageZoomLevel) * magnifierZoom}px;
            background-position: {(magnifierSize / 2) - (imageMouseX * magnifierZoom * imageZoomLevel)}px {(magnifierSize / 2) - (imageMouseY * magnifierZoom * imageZoomLevel)}px;
          ">
        </div>
          
      {/if}
    </div>
    <MagnifierContextMenu
      x={contextMenuX}
      y={contextMenuY}
      show={showContextMenu}
      on:setMagnifierSize={handleSetMagnifierSize}
      on:setMagnifierZoom={handleSetMagnifierZoom}
      on:close={() => (showContextMenu = false)}
    />
  </div>
{/if}
