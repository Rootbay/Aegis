<svelte:options runes={true} />

<script lang="ts">
  import { onMount, tick } from "svelte";
  import { loadEmojiData, type EmojiLoadResult } from "./emojiData";
  import type { EmojiCategory, EmojiEntry } from "./types";
  import { createEventDispatcher } from "svelte";

  let { emojiCategories, fallbackUsed } = $props<{
    emojiCategories?: EmojiCategory[] | null;
    fallbackUsed?: boolean | null;
  }>();

  const dispatch = createEventDispatcher<{
    select: { emoji: string };
    close: void;
  }>();

  const GRID_COLUMNS = 8;

  let categories = $state<EmojiCategory[]>([]);
  let loading = $state(true);
  let fallbackActive = $state(false);
  let containerEl = $state<HTMLDivElement | null>(null);
  let emojiButtons: HTMLButtonElement[] = [];
  let hasLoadedDefaults = false;
  let defaultLoadPromise: Promise<void> | null = null;
  let lastProvidedCategories: EmojiCategory[] | null | undefined = undefined;
  let lastFallbackHint: boolean | null | undefined = undefined;

  onMount(() => {
    void ensureCategories();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dispatch("close");
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  });

  $effect(() => {
    void ensureCategories();
  });

  async function ensureCategories() {
    const provided = emojiCategories;
    const fallbackHint = fallbackUsed ?? false;

    if (provided != null) {
      const shouldApply =
        provided !== lastProvidedCategories ||
        fallbackHint !== (lastFallbackHint ?? false);

      if (shouldApply) {
        lastProvidedCategories = provided;
        lastFallbackHint = fallbackHint;
        await applyCategories(provided, fallbackHint);
      }
      return;
    }

    lastProvidedCategories = null;
    lastFallbackHint = fallbackHint;
    await loadDefaultCategories();
  }

  async function loadDefaultCategories() {
    if (hasLoadedDefaults) return;
    if (defaultLoadPromise) {
      await defaultLoadPromise;
      return;
    }

    loading = true;
    defaultLoadPromise = (async () => {
      const result: EmojiLoadResult = await loadEmojiData();
      hasLoadedDefaults = true;
      await applyCategories(result.categories, result.usedFallback);
    })();

    try {
      await defaultLoadPromise;
    } finally {
      defaultLoadPromise = null;
    }
  }

  async function applyCategories(
    next: EmojiCategory[] | null | undefined,
    fallback: boolean,
  ) {
    categories = Array.isArray(next) ? next : [];
    fallbackActive = fallback;
    loading = false;

    await tick();
    refreshButtons();
    focusFirstButton();
  }

  function refreshButtons() {
    emojiButtons = containerEl
      ? Array.from(
          containerEl.querySelectorAll<HTMLButtonElement>("button[data-emoji]"),
        )
      : [];
  }

  function focusFirstButton() {
    emojiButtons[0]?.focus();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!emojiButtons.length) refreshButtons();

    if (event.key === "Escape") {
      event.preventDefault();
      dispatch("close");
      return;
    }

    if (!emojiButtons.length) return;

    const active = document.activeElement as HTMLButtonElement | null;
    const currentIndex = active ? emojiButtons.indexOf(active) : -1;

    if (currentIndex === -1) {
      focusFirstButton();
      return;
    }

    let nextIndex = currentIndex;

    switch (event.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % emojiButtons.length;
        break;
      case "ArrowLeft":
        nextIndex =
          (currentIndex - 1 + emojiButtons.length) % emojiButtons.length;
        break;
      case "ArrowDown":
        nextIndex = Math.min(
          currentIndex + GRID_COLUMNS,
          emojiButtons.length - 1,
        );
        break;
      case "ArrowUp":
        nextIndex = Math.max(currentIndex - GRID_COLUMNS, 0);
        break;
      case "Home": {
        const rowStart = Math.floor(currentIndex / GRID_COLUMNS) * GRID_COLUMNS;
        nextIndex = rowStart;
        break;
      }
      case "End": {
        const rowStart = Math.floor(currentIndex / GRID_COLUMNS) * GRID_COLUMNS;
        nextIndex = Math.min(
          rowStart + GRID_COLUMNS - 1,
          emojiButtons.length - 1,
        );
        break;
      }
      default:
        return;
    }

    event.preventDefault();
    emojiButtons[nextIndex]?.focus();
  }

  function handleSelect(emoji: string) {
    dispatch("select", { emoji });
  }

  function getEmojiKey(emoji: EmojiEntry, index: number): string {
    switch (emoji.type) {
      case "unicode":
        return `${emoji.value}-${index}`;
      case "custom":
      case "sticker":
        return `${emoji.type}-${emoji.id}-${index}`;
      default:
        return `${index}`;
    }
  }

  function getEmojiLabel(emoji: EmojiEntry): string {
    if (emoji.label && emoji.label.trim().length > 0) return emoji.label;
    if (emoji.type === "custom" || emoji.type === "sticker") return emoji.name;
    return emoji.value;
  }

  function getEmojiValue(emoji: EmojiEntry): string {
    return emoji.value;
  }
</script>


{#if loading}
  <div
    class="w-64 rounded-lg border border-white/10 bg-zinc-800 p-3 text-sm text-white/80 shadow-lg"
    role="dialog"
    aria-label="Emoji picker"
  >
    Loading emojis…
  </div>
{:else if categories.length === 0}
  <div
    class="w-64 rounded-lg border border-white/10 bg-zinc-800 p-3 text-sm text-white/80 shadow-lg"
    role="dialog"
    aria-label="Emoji picker"
  >
    No emojis available.
  </div>
{:else}
  <div
    class="w-64 rounded-lg border border-white/10 bg-zinc-800 p-3 shadow-lg"
    role="dialog"
    aria-label="Emoji picker"
    bind:this={containerEl}
    tabindex="-1"
    onkeydown={(event) => {
      event.stopPropagation();
      handleKeydown(event);
    }}
    onclick={(event) => event.stopPropagation()}
  >
    {#if fallbackActive}
      <p class="mb-2 text-xs text-white/60">Showing limited emoji list.</p>
    {/if}
    <div class="max-h-64 space-y-3 overflow-y-auto pr-1">
      {#each categories as category (category.id)}
        <section>
          <p
            class="text-xs font-semibold uppercase tracking-wide text-white/60"
          >
            {category.label}
          </p>
          <div class="mt-2 grid grid-cols-8 gap-1">
            {#each category.emojis as emoji, index (getEmojiKey(emoji, index))}
              <button
                type="button"
                class="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-700 text-xl transition focus-visible:outline focus-visible:outline-cyan-500 hover:bg-zinc-600"
                data-emoji={getEmojiValue(emoji)}
                aria-label={`React with ${getEmojiLabel(emoji)}`}
                onclick={() => handleSelect(getEmojiValue(emoji))}
              >
                {#if emoji.type === "unicode"}
                  {emoji.value}
                {:else}
                  <img
                    src={emoji.url}
                    alt={getEmojiLabel(emoji)}
                    class="h-7 w-7 object-contain"
                    decoding="async"
                    loading="lazy"
                    data-animated={emoji.animated ? "true" : undefined}
                  />
                {/if}
              </button>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  </div>
{/if}
