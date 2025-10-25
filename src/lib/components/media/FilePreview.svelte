<svelte:options runes={true} />

<script lang="ts">
  import {
    X,
    File as FileIcon,
    Download as DownloadIcon,
    Loader2,
  } from "@lucide/svelte";
  import { onDestroy } from "svelte";

  import { chatStore } from "$lib/features/chat/stores/chatStore";
  import type { AttachmentMeta } from "$lib/features/chat/models/Message";
  import { toasts } from "$lib/stores/ToastStore";

  type FileRemoveHandler = (file: File) => void;

  interface FilePreviewProps {
    variant?: "composer" | "message";
    file?: File | null;
    attachment?: AttachmentMeta | null;
    chatId?: string;
    messageId?: string;
    onRemove?: FileRemoveHandler;
    onOpen?: (url: string) => void;
  }

  let {
    variant = "composer",
    file = null,
    attachment = null,
    chatId = "",
    messageId = "",
    onRemove = () => {},
    onOpen = () => {},
  }: FilePreviewProps = $props();

  let localPreviewUrl = $state<string | null>(null);
  let previousPreviewUrl: string | null = null;

  const isComposer = $derived(variant === "composer");
  const isMessage = $derived(variant === "message");

  const isImage = $derived(() => {
    if (isComposer) {
      return file?.type?.startsWith("image/") ?? false;
    }
    return attachment?.type?.startsWith("image/") ?? false;
  });

  const displayUrl = $derived(() => {
    if (isComposer) {
      return localPreviewUrl;
    }
    return attachment?.objectUrl ?? null;
  });

  function updatePreview(source: File | null) {
    if (previousPreviewUrl) {
      URL.revokeObjectURL(previousPreviewUrl);
      previousPreviewUrl = null;
    }

    if (source && source.type.startsWith("image/")) {
      const url = URL.createObjectURL(source);
      localPreviewUrl = url;
      previousPreviewUrl = url;
    } else {
      localPreviewUrl = null;
    }
  }

  $effect(() => {
    if (isComposer) {
      updatePreview(file ?? null);
    } else {
      localPreviewUrl = null;
      if (previousPreviewUrl) {
        URL.revokeObjectURL(previousPreviewUrl);
        previousPreviewUrl = null;
      }
    }
  });

  onDestroy(() => {
    if (previousPreviewUrl) {
      URL.revokeObjectURL(previousPreviewUrl);
    }
  });

  function formatBytes(bytes?: number) {
    if (!bytes || Number.isNaN(bytes)) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  async function ensureAttachmentLoaded(): Promise<string | null> {
    if (!isMessage || !attachment) return null;
    if (!chatId || !messageId) {
      toasts.showErrorToast("Attachment cannot be loaded right now.");
      return null;
    }
    try {
      const url = await chatStore.loadAttachmentForMessage(
        chatId,
        messageId,
        attachment.id,
      );
      return url;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toasts.showErrorToast(`Failed to load ${attachment.name}: ${message}`);
      return null;
    }
  }

  async function handleOpen() {
    if (!attachment) return;
    if (attachment.objectUrl) {
      onOpen(attachment.objectUrl);
      return;
    }
    const url = await ensureAttachmentLoaded();
    if (url) {
      onOpen(url);
    }
  }

  function triggerDownload(url: string) {
    if (!attachment) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleDownload() {
    if (!attachment) return;
    if (attachment.objectUrl) {
      triggerDownload(attachment.objectUrl);
      return;
    }
    const url = await ensureAttachmentLoaded();
    if (url) {
      triggerDownload(url);
    }
  }
</script>

{#if isComposer && file}
  <div
    class="relative group bg-zinc-700 p-2 rounded-md flex items-center space-x-2"
  >
    {#if isImage && displayUrl}
      <img
        src={displayUrl}
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
        {formatBytes(file.size)}
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
{:else if isMessage && attachment}
  {#if isImage && displayUrl}
    <button
      class="max-w-xs rounded-lg overflow-hidden cursor-pointer block border border-zinc-700/60"
      onclick={handleOpen}
      oncontextmenu={(event) => {
        event.preventDefault();
        void handleOpen();
      }}
      aria-label={`Open attachment ${attachment.name}`}
    >
      <img
        src={displayUrl}
        alt={attachment.name}
        class="max-h-64 w-full object-contain bg-black/40"
      />
    </button>
  {:else if isImage}
    <div class="bg-muted/60 border border-muted/40 rounded-md p-3">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm text-white truncate">{attachment.name}</p>
          {#if attachment.loadError}
            <p class="text-xs text-destructive">
              Failed to load preview. {attachment.loadError}
            </p>
          {:else if attachment.isLoading}
            <p class="text-xs text-muted-foreground">Fetching preview...</p>
          {:else}
            <p class="text-xs text-muted-foreground">
              Preview not fetched yet.
            </p>
          {/if}
        </div>
        <button
          class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 text-sm"
          onclick={handleOpen}
          disabled={attachment.isLoading}
        >
          {#if attachment.isLoading}
            <Loader2 size={12} class="animate-spin" />
            Loading
          {:else}
            Load image
          {/if}
        </button>
      </div>
    </div>
  {:else}
    <div class="bg-muted/60 border border-muted/40 rounded-md p-3">
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 flex items-center justify-center bg-base-500 rounded-md flex-shrink-0"
        >
          <FileIcon size={12} class="text-muted-foreground" />
        </div>
        <div class="flex-grow overflow-hidden">
          <p class="text-sm text-white truncate">{attachment.name}</p>
          {#if attachment.size}
            <p class="text-xs text-muted-foreground">{formatBytes(attachment.size)}</p>
          {/if}
          {#if attachment.loadError}
            <p class="text-xs text-destructive">
              Download failed. {attachment.loadError}
            </p>
          {:else if attachment.isLoading}
            <p class="text-xs text-muted-foreground">Fetching attachment...</p>
          {:else if attachment.isLoaded && attachment.objectUrl}
            <p class="text-xs text-muted-foreground">Ready to download.</p>
          {:else}
            <p class="text-xs text-muted-foreground">Click to download.</p>
          {/if}
        </div>
        <button
          class="inline-flex items-center justify-center rounded-md bg-zinc-700 hover:bg-zinc-600 text-white p-2"
          onclick={handleDownload}
          disabled={attachment.isLoading}
          aria-label={`Download attachment ${attachment.name}`}
        >
          {#if attachment.isLoading}
            <Loader2 size={12} class="animate-spin" />
          {:else}
            <DownloadIcon size={12} />
          {/if}
        </button>
      </div>
    </div>
  {/if}
{/if}
