<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';
  import { mdiFile, mdiFileImage, mdiFileDocument, mdiFileMusic, mdiFileVideo, mdiArchive, mdiClose } from '@mdi/js';

  export let file: File;
  export let onRemove: Function = () => {};
  $: void file;

  const fileTypeIcons: { [key: string]: string } = {
    'image': mdiFileImage,
    'pdf': mdiFileDocument,
    'audio': mdiFileMusic,
    'video': mdiFileVideo,
    'zip': mdiArchive,
    'rar': mdiArchive,
  };

  let icon = mdiFile;
  let imagePreviewUrl: string | null = null;

  if (file.type.startsWith('image/')) {
    icon = mdiFileImage;
    imagePreviewUrl = URL.createObjectURL(file);
  } else {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    for (const type in fileTypeIcons) {
      if (file.type.startsWith(type) || extension === type) {
        icon = fileTypeIcons[type];
        break;
      }
    }
  }
</script>

<div class="relative group bg-zinc-700 p-2 rounded-md flex items-center space-x-2">
  {#if imagePreviewUrl}
    <img src={imagePreviewUrl} alt={file.name} class="w-12 h-12 object-cover rounded-md" />
  {:else}
    <div class="w-12 h-12 flex items-center justify-center bg-zinc-600 rounded-md">
      <Icon data={icon} size="8" class="text-muted-foreground" />
    </div>
  {/if}
  <div class="flex-grow overflow-hidden">
    <p class="text-sm text-white truncate">{file.name}</p>
    <p class="text-xs text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</p>
  </div>
  <button
    onclick={() => onRemove(file)}
    class="absolute top-0 right-0 -mt-1 -mr-1 bg-card rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
    aria-label="Remove file"
  >
    <Icon data={mdiClose} size="4" class="text-white" />
  </button>
</div>
