<svelte:options runes={true} />

<script lang="ts">
  import type { MessageEmbed } from "$lib/features/chat/models/Message";

  let { embed } = $props<{ embed: MessageEmbed }>();

  const host = $derived(() => {
    if (!embed?.url) return null;
    try {
      return new URL(embed.url).host;
    } catch {
      return null;
    }
  });

  const accentStyle = $derived(() =>
    embed?.accentColor
      ? `border-left-color: ${embed.accentColor}; border-left-width: 4px;`
      : undefined
  );
</script>

{#if embed}
  <div
    class="message-embed overflow-hidden rounded-lg border border-border bg-muted/40"
    style={accentStyle}
  >
    <div class="flex flex-col gap-2">
      <div class="flex items-start gap-3 p-3">
        {#if embed.thumbnailUrl}
          <img
            alt={embed.title ?? embed.siteName ?? host ?? "Embedded thumbnail"}
            class="h-16 w-16 shrink-0 rounded-md object-cover"
            loading="lazy"
            src={embed.thumbnailUrl}
          />
        {/if}
        <div class="min-w-0 space-y-1">
          {#if embed.provider?.name || embed.provider?.iconUrl || embed.siteName || host}
            <div class="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              {#if embed.provider?.iconUrl}
                <img
                  alt={embed.provider?.name ?? host ?? "Provider icon"}
                  class="h-4 w-4 rounded object-cover"
                  loading="lazy"
                  src={embed.provider.iconUrl}
                />
              {/if}
              <span class="truncate">
                {embed.provider?.name ?? embed.siteName ?? host ?? "Link"}
              </span>
            </div>
          {/if}
          {#if embed.title}
            {#if embed.url}
              <a
                class="block text-sm font-semibold text-white no-underline hover:underline"
                href={embed.url}
                rel="noreferrer noopener"
                target="_blank"
              >
                {embed.title}
              </a>
            {:else}
              <p class="text-sm font-semibold text-white">{embed.title}</p>
            {/if}
          {/if}
          {#if embed.description}
            <p class="text-xs text-muted-foreground whitespace-pre-line">
              {embed.description}
            </p>
          {/if}
          {#if !embed.title && embed.url}
            <a
              class="text-xs text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
              href={embed.url}
              rel="noreferrer noopener"
              target="_blank"
            >
              {embed.url}
            </a>
          {/if}
        </div>
      </div>
      {#if embed.imageUrl}
        <img
          alt={embed.title ?? embed.siteName ?? host ?? "Embedded media"}
          class="max-h-96 w-full object-cover"
          loading="lazy"
          src={embed.imageUrl}
        />
      {/if}
    </div>
  </div>
{/if}

