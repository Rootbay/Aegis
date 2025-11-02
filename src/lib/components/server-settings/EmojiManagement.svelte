<script lang="ts">
  import { UploadCloud, Trash2, SmilePlus } from "@lucide/svelte";
  import {
    Avatar,
    AvatarImage,
    AvatarFallback,
  } from "$lib/components/ui/avatar/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import type { ServerEmoji } from "$lib/features/servers/models/Server";

  interface Props {
    emojis?: ServerEmoji[];
    onupdate_setting?: unknown;
    onbutton_click?: unknown;
  }

  const {
    emojis = [],
    onupdate_setting = undefined,
    onbutton_click = undefined,
  }: Props = $props();

  const sortedEmojis = $derived(
    Array.isArray(emojis)
      ? [...emojis].sort((a, b) => a.name.localeCompare(b.name))
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

  function formatDate(dateString?: string): string {
    if (!dateString) {
      return "Unknown";
    }
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) {
      return "Unknown";
    }
    return parsed.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function getFallback(name: string): string {
    if (!name) return "?";
    const trimmed = name.trim();
    if (trimmed.length === 0) return "?";
    return trimmed.slice(0, 2).toUpperCase();
  }

  function handleRemove(emojiId: string) {
    if (!canManage) return;
    const filtered = sortedEmojis.filter((emoji) => emoji.id !== emojiId);
    emitUpdate({
      id: "emojiManagement",
      property: "emojis",
      value: filtered,
    });
  }

  function handleUploadRequest() {
    emitButton({ id: "emojiUpload" });
  }
</script>

<div class="space-y-4">
  <div
    class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
  >
    <div>
      <h4 class="text-base font-semibold text-white">Custom Emojis</h4>
      <p class="text-sm text-muted-foreground">
        Upload bespoke emoji to give your community extra personality.
      </p>
    </div>
    <Button onclick={handleUploadRequest} variant="secondary">
      <UploadCloud class="mr-2 h-4 w-4" /> Upload Emoji
    </Button>
  </div>

  {#if sortedEmojis.length > 0}
    <div class="grid gap-4 sm:grid-cols-2">
      {#each sortedEmojis as emoji (emoji.id)}
        <div
          class="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
        >
          <div class="flex items-center gap-3">
            <Avatar class="h-12 w-12 border border-zinc-800">
              {#if emoji.url}
                <AvatarImage src={emoji.url} alt={emoji.name} />
              {:else}
                <AvatarFallback>{getFallback(emoji.name)}</AvatarFallback>
              {/if}
            </Avatar>
            <div class="flex-1">
              <p class="text-sm font-semibold text-white">:{emoji.name}:</p>
              <p class="text-xs text-muted-foreground">
                Added {formatDate(emoji.createdAt)}
              </p>
            </div>
            {#if canManage}
              <Button
                variant="ghost"
                size="icon"
                class="text-muted-foreground hover:text-red-400"
                onclick={() => handleRemove(emoji.id)}
                title="Remove emoji"
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            {/if}
          </div>

          <div
            class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
          >
            {#if emoji.animated}
              <Badge variant="secondary">Animated</Badge>
            {/if}
            {#if emoji.available === false}
              <Badge variant="destructive">Disabled</Badge>
            {/if}
            {#if emoji.usageCount !== undefined}
              <span class="rounded bg-zinc-800/80 px-2 py-1">
                {emoji.usageCount} uses
              </span>
            {/if}
            {#if emoji.uploadedBy}
              <span class="truncate">Uploaded by {emoji.uploadedBy}</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div
      class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 p-8 text-center text-muted-foreground"
    >
      <SmilePlus class="h-10 w-10" />
      <p class="text-sm font-medium text-white">No emojis yet</p>
      <p class="text-sm">
        When you upload custom emoji, they will appear here for quick
        management.
      </p>
    </div>
  {/if}
</div>
