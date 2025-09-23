<svelte:options runes={true} />

<script lang="ts">
  import { X, File as FileIcon } from "@lucide/svelte";
  import { onDestroy } from "svelte";

  type FileRemoveHandler = (file: File) => void; // eslint-disable-line no-unused-vars

  let {
    file,
    onRemove = () => {},
  }: { file: File; onRemove?: FileRemoveHandler } = $props();

  let imagePreviewUrl = $state<string | null>(null);
  let previousPreviewUrl: string | null = null;

  function updatePreview(source: File) {
    if (previousPreviewUrl) {
      URL.revokeObjectURL(previousPreviewUrl);
      previousPreviewUrl = null;
    }

    if (source.type.startsWith("image/")) {
      const url = URL.createObjectURL(source);
      imagePreviewUrl = url;
      previousPreviewUrl = url;
    } else {
      imagePreviewUrl = null;
    }
  }

  $effect(() => {
    updatePreview(file);
  });

  onDestroy(() => {
    if (previousPreviewUrl) {
      URL.revokeObjectURL(previousPreviewUrl);
    }
  });
</script>

<div
  class="relative group bg-zinc-700 p-2 rounded-md flex items-center space-x-2"
>
  {#if imagePreviewUrl}
    <img
      src={imagePreviewUrl}
      alt={file.name}
      class="w-12 h-12 object-cover rounded-md"
    />
  {:else}
    <div
      class="w-12 h-12 flex items-center justify-center bg-zinc-600 rounded-md"
    >
      <FileIcon size={12} class="text-muted-foreground" />
    </div>
  {/if}
  <div class="flex-grow overflow-hidden">
    <p class="text-sm text-white truncate">{file.name}</p>
    <p class="text-xs text-muted-foreground">
      {(file.size / 1024).toFixed(2)} KB
    </p>
  </div>
  <button
    onclick={() => onRemove(file)}
    class="absolute top-0 right-0 -mt-1 -mr-1 bg-card rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
    aria-label="Remove file"
  >
    <X size={10} class="text-white" />
  </button>
</div>
