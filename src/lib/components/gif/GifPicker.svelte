<svelte:options runes={true} />

<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { GIF_CATEGORIES, GIF_MAP } from "./gifData";
  import type { GifCategory, GifEntry } from "./gifData";

  let {
    selectedCategoryId = $bindable<string | null>(),
  } = $props<{
    selectedCategoryId?: string | null;
  }>();

  const dispatch = createEventDispatcher<{
    select: { gif: GifEntry };
    categoryChange: GifCategory | null;
  }>();

  let favoriteGifIds = $state<Set<string>>(new Set());
  let lastDispatchedCategoryId = $state<string | null>(null);

  const selectedCategory = $derived(() => {
    if (!selectedCategoryId) return null;
    return GIF_CATEGORIES.find((category) => category.id === selectedCategoryId) ?? null;
  });

  const favoriteGifs = $derived(() =>
    Array.from(favoriteGifIds)
      .map((id) => GIF_MAP.get(id))
      .filter((gif): gif is GifEntry => Boolean(gif)),
  );

  const displayedGifs = $derived(() => {
    const category = selectedCategory();
    if (category?.id === "favorites") {
      return favoriteGifs();
    }
    return category?.gifs ?? [];
  });

  $effect(() => {
    const category = selectedCategory();
    if (selectedCategoryId !== lastDispatchedCategoryId) {
      dispatch("categoryChange", category);
      lastDispatchedCategoryId = selectedCategoryId;
    }
  });

  function handleGifSelection(gif: GifEntry) {
    dispatch("select", { gif });
  }

  function toggleFavorite(gif: GifEntry) {
    const updated = new Set(favoriteGifIds);
    if (updated.has(gif.id)) {
      updated.delete(gif.id);
    } else {
      updated.add(gif.id);
    }
    favoriteGifIds = updated;
  }
</script>

<div class="flex flex-1 flex-col min-h-0 overflow-y-auto pr-1">
  {#if !selectedCategory()}
    <div class="grid grid-cols-2 gap-3 justify-center">
      {#each GIF_CATEGORIES as category (category.id)}
        <button
          type="button"
          class="flex h-[110px] w-[230px] flex-col items-start justify-between rounded-2xl border border-white/10 bg-linear-to-br from-white/5 to-white/0 px-4 py-3 text-left transition hover:border-white/40"
          onclick={() => (selectedCategoryId = category.id)}
        >
          <div class="text-sm font-semibold text-white">{category.label}</div>
          {#if category.id !== "favorites"}
            <p class="text-xs text-white/60">
              {category.gifs.length} GIF{category.gifs.length === 1 ? "" : "s"}
            </p>
          {:else}
            <p class="text-xs text-white/60">
              Favorites you save show up here
            </p>
          {/if}
        </button>
      {/each}
    </div>
  {:else}
    <div class="flex flex-wrap gap-3">
    {#if selectedCategory()?.id === "favorites" && displayedGifs().length === 0}
        <p class="text-xs text-zinc-400">
          Favorite GIFs appear here after you add them from other categories.
        </p>
      {:else if displayedGifs().length === 0}
        <p class="text-xs text-zinc-400">
          There are no GIFs in this category yet.
        </p>
      {:else}
        {#each displayedGifs() as gif (gif.id)}
          <div class="group relative w-[230px]">
            <button
              type="button"
              class="group relative block w-full overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-0"
              onclick={() => handleGifSelection(gif)}
              aria-label={`Select ${gif.title}`}
            >
              <img
                src={gif.url}
                alt={gif.title}
                class="h-auto w-[230px] rounded-xl object-cover"
                loading="lazy"
                decoding="async"
              />
            </button>
            <button
              type="button"
              class="pointer-events-auto absolute right-2 top-2 rounded-full border border-white/30 bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white opacity-0 transition-opacity group-hover:opacity-100"
              onclick={() => toggleFavorite(gif)}
              aria-label={
                favoriteGifIds.has(gif.id)
                  ? "Remove from Favorites"
                  : "Add to Favorites"
              }
            >
              {favoriteGifIds.has(gif.id)
                ? "Remove from Favorites"
                : "Add to Favorites"}
            </button>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
