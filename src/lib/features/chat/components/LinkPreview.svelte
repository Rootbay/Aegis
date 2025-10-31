<svelte:options runes={true} />

<script lang="ts">
  import { onDestroy } from "svelte";

  import type { LinkPreviewMetadata } from "$lib/features/chat/utils/linkPreviews";
  import { getLinkPreviewMetadata } from "$lib/features/chat/utils/linkPreviews";
  import { settings } from "$lib/features/settings/stores/settings";

  let { url }: { url: string } = $props();

  const previewsEnabled = $derived($settings.enableLinkPreviews);

  let metadata = $state<LinkPreviewMetadata | null>(null);
  let status = $state<"idle" | "loading" | "loaded" | "error" | "disabled">(
    "idle",
  );
  let errorMessage = $state<string | null>(null);
  let destroyed = false;

  async function loadPreview(targetUrl: string, enabled: boolean) {
    if (!targetUrl || !enabled) {
      metadata = null;
      errorMessage = null;
      status = enabled ? "idle" : "disabled";
      return;
    }

    status = "loading";
    errorMessage = null;

    try {
      const result = await getLinkPreviewMetadata(targetUrl);
      if (destroyed) return;

      if (result) {
        metadata = result;
        status = "loaded";
      } else {
        metadata = null;
        status = "error";
        errorMessage = "Preview unavailable.";
      }
    } catch (error) {
      if (destroyed) return;
      metadata = null;
      status = "error";
      errorMessage =
        error instanceof Error ? error.message : "Unable to load preview.";
    }
  }

  $effect(() => {
    const enabled = previewsEnabled;
    const targetUrl = url;
    destroyed = false;
    void loadPreview(targetUrl, enabled);
  });

  onDestroy(() => {
    destroyed = true;
  });
</script>

{#if status === "loaded" && metadata}
  <a
    class="block rounded-lg border border-border bg-muted/50 p-3 text-left no-underline transition-colors hover:bg-muted"
    href={metadata.url ?? url}
    rel="noreferrer noopener"
    target="_blank"
  >
    <div class="flex gap-3">
      {#if metadata.imageUrl}
        <img
          alt={metadata.title ?? metadata.siteName ?? metadata.url ?? url}
          class="h-16 w-16 flex-shrink-0 rounded-md object-cover"
          loading="lazy"
          src={metadata.imageUrl}
        />
      {/if}
      <div class="min-w-0 space-y-1">
        {#if metadata.siteName}
          <p class="text-xs uppercase tracking-wide text-muted-foreground">
            {metadata.siteName}
          </p>
        {/if}
        <p class="text-sm font-semibold text-white line-clamp-2">
          {metadata.title ?? metadata.url ?? url}
        </p>
        {#if metadata.description}
          <p class="text-xs text-muted-foreground line-clamp-2">
            {metadata.description}
          </p>
        {/if}
      </div>
    </div>
  </a>
{:else if status === "loading"}
  <div
    class="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
  >
    Loading preview…
  </div>
{:else if status === "error" && errorMessage}
  <div
    class="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
  >
    {errorMessage}
  </div>
{/if}
