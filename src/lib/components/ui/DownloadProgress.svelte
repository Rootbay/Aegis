<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';
  import { mdiFile, mdiCheckCircle, mdiAlertCircle, mdiDownload, mdiClose } from '@mdi/js';

  export let fileName: string;
  export let progress: number = 0;
  export let status: 'downloading' | 'completed' | 'failed' | 'queued' = 'queued';
  export let onCancel: () => void = () => {};
  export let onRetry: () => void = () => {};

  const statusInfo = {
    downloading: { color: 'bg-status-info', text: 'Downloading...' },
    completed: { color: 'bg-success', text: 'Completed', icon: mdiCheckCircle },
    failed: { color: 'bg-destructive', text: 'Failed', icon: mdiAlertCircle },
    queued: { color: 'bg-base-500', text: 'Queued for download', icon: mdiDownload },
  };

  let currentStatus = statusInfo[status];
  $: currentStatus = statusInfo[status];
</script>

<div class="bg-muted p-2 rounded-md flex items-center space-x-3">
  <div class="w-10 h-10 flex items-center justify-center bg-base-400 rounded-md flex-shrink-0">
    {#if status === 'completed'}
      <Icon data={mdiCheckCircle} size="8" class="text-success" />
    {:else if status === 'failed'}
      <Icon data={mdiAlertCircle} size="8" class="text-destructive" />
    {:else}
      <Icon data={mdiFile} size="8" class="text-muted-foreground" />
    {/if}
  </div>
  <div class="flex-grow overflow-hidden">
    <p class="text-sm text-foreground truncate">{fileName}</p>
    <div class="flex items-center gap-2">
      <div class="w-full bg-base-400 rounded-full h-1.5">
        <div class="{currentStatus.color} h-1.5 rounded-full" style="width: {progress}%"></div>
      </div>
      <p class="text-xs text-muted-foreground whitespace-nowrap">{progress.toFixed(0)}%</p>
    </div>
    <p class="text-xs text-muted-foreground">{currentStatus.text}</p>
  </div>
  <div class="flex items-center">
    {#if status === 'downloading' || status === 'queued'}
      <button onclick={onCancel} class="text-muted-foreground hover:text-foreground" aria-label="Cancel download">
        <Icon data={mdiClose} size="5" />
      </button>
    {/if}
    {#if status === 'failed'}
      <button onclick={onRetry} class="text-muted-foreground hover:text-foreground" aria-label="Retry download">
        <Icon data={mdiDownload} size="5" />
      </button>
    {/if}
  </div>
</div>
