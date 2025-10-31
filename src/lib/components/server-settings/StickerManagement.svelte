<script lang="ts">
  import { ImagePlus, Trash2, Sticker as StickerIcon } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import type { ServerSticker } from "$lib/features/servers/models/Server";

  export let stickers: ServerSticker[] = [];
  export let onupdate_setting: unknown = undefined;
  export let onbutton_click: unknown = undefined;

  const sortedStickers = $derived(
    Array.isArray(stickers)
      ? [...stickers].sort((a, b) => a.name.localeCompare(b.name))
      : [],
  );
  const canManage = $derived(typeof onupdate_setting === "function");

  function emitUpdate(payload: {
    id: string;
    property: string;
    value: unknown;
  }) {
    if (typeof onupdate_setting === "function") {
      Reflect.apply(onupdate_setting as CallableFunction, undefined, [payload]);
    }
  }

  function emitButton(payload: {
    id: string;
    context?: Record<string, unknown>;
  }) {
    if (typeof onbutton_click === "function") {
      Reflect.apply(onbutton_click as CallableFunction, undefined, [payload]);
    }
  }

  function formatDate(dateString?: string | null): string {
    if (!dateString) return "Unknown";
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return "Unknown";
    return parsed.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatSize(sizeKb?: number): string {
    if (!sizeKb || Number.isNaN(sizeKb)) {
      return "--";
    }
    if (sizeKb >= 1024) {
      return `${(sizeKb / 1024).toFixed(1)} MB`;
    }
    return `${Math.round(sizeKb)} KB`;
  }

  function handleRemove(stickerId: string) {
    if (!canManage) return;
    const filtered = sortedStickers.filter(
      (sticker) => sticker.id !== stickerId,
    );
    emitUpdate({
      id: "stickerManagement",
      property: "stickers",
      value: filtered,
    });
  }

  function handleUploadRequest() {
    emitButton({ id: "stickerUpload" });
  }
</script>

<div class="space-y-4">
  <div
    class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
  >
    <div>
      <h4 class="text-base font-semibold text-white">Custom Stickers</h4>
      <p class="text-sm text-muted-foreground">
        Share expressive stickers for voice chats, events, or celebrations.
      </p>
    </div>
    <Button onclick={handleUploadRequest} variant="secondary">
      <ImagePlus class="mr-2 h-4 w-4" /> Upload Sticker
    </Button>
  </div>

  {#if sortedStickers.length > 0}
    <div class="grid gap-4 sm:grid-cols-2">
      {#each sortedStickers as sticker (sticker.id)}
        <div
          class="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
        >
          <div class="flex items-start gap-3">
            <div
              class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-zinc-800 bg-zinc-900"
            >
              {#if sticker.previewUrl || sticker.url}
                <img
                  src={sticker.previewUrl ?? sticker.url}
                  alt={sticker.name}
                  class="h-full w-full object-cover"
                  loading="lazy"
                />
              {:else}
                <StickerIcon class="h-8 w-8 text-muted-foreground" />
              {/if}
            </div>
            <div class="flex-1 space-y-1">
              <p class="text-sm font-semibold text-white">{sticker.name}</p>
              {#if sticker.description}
                <p class="text-xs text-muted-foreground">
                  {sticker.description}
                </p>
              {/if}
              <p class="text-xs text-muted-foreground">
                Added {formatDate(sticker.createdAt)} · {formatSize(
                  sticker.sizeKb,
                )}
              </p>
            </div>
            {#if canManage}
              <Button
                variant="ghost"
                size="icon"
                class="text-muted-foreground hover:text-red-400"
                onclick={() => handleRemove(sticker.id)}
                title="Remove sticker"
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            {/if}
          </div>

          <div
            class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
          >
            <Badge variant="secondary"
              >{sticker.format?.toUpperCase() ?? "PNG"}</Badge
            >
            {#if sticker.tags?.length}
              {#each sticker.tags as tag (tag)}
                <span class="rounded bg-zinc-800/80 px-2 py-1">#{tag}</span>
              {/each}
            {/if}
            {#if sticker.uploadedBy}
              <span class="truncate">Uploaded by {sticker.uploadedBy}</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div
      class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 p-8 text-center text-muted-foreground"
    >
      <StickerIcon class="h-10 w-10" />
      <p class="text-sm font-medium text-white">No stickers yet</p>
      <p class="text-sm">
        Upload stickers to give members fun ways to react and participate.
      </p>
    </div>
  {/if}
</div>
