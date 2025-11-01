<script lang="ts">
  import { File, CircleCheck, CircleAlert, X, RotateCcw } from "@lucide/svelte";

  let {
    fileName,
    progress = 0,
    status = "queued",
    onCancel = () => {},
    onRetry = () => {},
  }: {
    fileName: string;
    progress?: number;
    status?: "downloading" | "completed" | "failed" | "queued";
    onCancel?: () => void;
    onRetry?: () => void;
  } = $props();

  const statusInfo = {
    downloading: { color: "bg-status-info", text: "Downloading..." },
    completed: { color: "bg-success", text: "Completed", icon: "circle-check" },
    failed: { color: "bg-destructive", text: "Failed", icon: "circle-alert" },
    queued: {
      color: "bg-base-500",
      text: "Queued for download",
      icon: "download",
    },
  };

  let currentStatus = $derived(statusInfo[status]);
</script>

<div class="bg-muted p-2 rounded-md flex items-center space-x-3">
  <div
    class="w-10 h-10 flex items-center justify-center bg-base-400 rounded-md shrink-0"
  >
    {#if status === "completed"}
      <CircleCheck size={12} class="text-success" />
    {:else if status === "failed"}
      <CircleAlert size={12} class="text-destructive" />
    {:else}
      <File size={12} class="text-muted-foreground" />
    {/if}
  </div>
  <div class="grow overflow-hidden">
    <p class="text-sm text-foreground truncate">{fileName}</p>
    <div class="flex items-center gap-2">
      <div class="w-full bg-base-400 rounded-full h-1.5">
        <div
          class="{currentStatus.color} h-1.5 rounded-full"
          style="width: {progress}%"
        ></div>
      </div>
      <p class="text-xs text-muted-foreground whitespace-nowrap">
        {progress.toFixed(0)}%
      </p>
    </div>
    <p class="text-xs text-muted-foreground">{currentStatus.text}</p>
  </div>
  <div class="flex items-center">
    {#if status === "downloading" || status === "queued"}
      <button
        onclick={onCancel}
        class="text-muted-foreground hover:text-foreground"
        aria-label="Cancel download"
      >
        <X size={12} />
      </button>
    {/if}
    {#if status === "failed"}
      <button
        onclick={onRetry}
        class="text-muted-foreground hover:text-foreground"
        aria-label="Retry download"
      >
        <RotateCcw size={12} />
      </button>
    {/if}
  </div>
</div>
