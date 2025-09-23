<script lang="ts">
  import { ZoomIn, ZoomOut, Download, X } from "@lucide/svelte";
  import MagnifierContextMenu from "$lib/components/context-menus/MagnifierContextMenu.svelte";
  import { onMount, onDestroy } from "svelte";

  type SaveHandler = (url: string) => void; // eslint-disable-line no-unused-vars

  type ImageLightboxProps = {
    imageUrl?: string;
    show?: boolean;
    onClose?: () => void;
    onsave?: SaveHandler;
  };

  let {
    imageUrl = "",
    show = $bindable(false),
    onClose = () => {},
    onsave,
  }: ImageLightboxProps = $props();

  let imageZoomLevel = $state(1);
  let magnifierZoom = $state(2);
  let magnifierSize = $state(150);
  let magnifierX = $state(0);
  let magnifierY = $state(0);
  let imageMouseX = $state(0);
  let imageMouseY = $state(0);
  let showMagnifier = $state(false);
  let showContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let imageElement = $state<HTMLImageElement | null>(null);
  let parentDivElement = $state<HTMLDivElement | null>(null);

  function closeLightbox() {
    show = false;
    onClose();
  }

  async function saveImage() {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download =
        imageUrl.substring(imageUrl.lastIndexOf("/") + 1) ||
        "downloaded_image.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
      onsave?.(imageUrl);
    } catch (error) {
      console.error("Error saving image:", error);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      closeLightbox();
    }
  }

  function handleImageMouseMove(event: MouseEvent) {
    const image = event.currentTarget as HTMLImageElement;
    const parentElement = parentDivElement;

    if (!parentElement) {
      showMagnifier = false;
      return;
    }

    const imageRect = image.getBoundingClientRect();
    const parentRect = parentElement.getBoundingClientRect();

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
    event.preventDefault();
    showContextMenu = true;
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
  }

  function handleSetMagnifierSize(size: number) {
    magnifierSize = size;
  }

  function handleSetMagnifierZoom(zoom: number) {
    magnifierZoom = zoom;
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

  onMount(() => {
    window.addEventListener("keydown", handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener("keydown", handleKeydown);
  });
</script>

{#if show}
  <div
    class="fixed inset-0 flex items-center justify-center z-[9999]"
    style="background-color: rgba(0, 0, 0, 0.7);"
    onclick={closeLightbox}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") closeLightbox();
    }}
    role="button"
    tabindex="0"
  >
    <div
      class="absolute top-4 right-4 bg-gray-800 p-2 rounded-lg flex space-x-2"
    >
      <button
        class="text-white hover:text-gray-300 z-10 cursor-pointer"
        onclick={zoomIn}
        aria-label="Zoom In"
      >
        <ZoomIn size={12} />
      </button>
      <button
        class="text-white hover:text-gray-300 z-10 cursor-pointer"
        onclick={zoomOut}
        aria-label="Zoom Out"
      >
        <ZoomOut size={12} />
      </button>
      <button
        class="text-white hover:text-gray-300 z-10 cursor-pointer"
        onclick={saveImage}
        aria-label="Save image"
      >
        <Download size={12} />
      </button>
      <button
        class="text-white hover:text-gray-300 z-10 cursor-pointer"
        onclick={closeLightbox}
        aria-label="Close image"
      >
        <X size={12} />
      </button>
    </div>
    <div
      bind:this={parentDivElement}
      class="relative flex items-center justify-center"
      role="presentation"
      tabindex="-1"
      oncontextmenu={handleContextMenu}
    >
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
            background-size: {(imageElement?.width ?? 0) *
            imageZoomLevel *
            magnifierZoom}px {(imageElement?.height ?? 0) *
            imageZoomLevel *
            magnifierZoom}px;
            background-position: {magnifierSize / 2 -
            imageMouseX * magnifierZoom * imageZoomLevel}px {magnifierSize / 2 -
            imageMouseY * magnifierZoom * imageZoomLevel}px;
          "
        ></div>
      {/if}
    </div>
    <MagnifierContextMenu
      x={contextMenuX}
      y={contextMenuY}
      bind:show={showContextMenu}
      onsetMagnifierSize={handleSetMagnifierSize}
      onsetMagnifierZoom={handleSetMagnifierZoom}
      onclose={() => (showContextMenu = false)}
    />
  </div>
{/if}
