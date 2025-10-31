<svelte:options runes={true} />

<script lang="ts">
  import { onMount, tick } from "svelte";
  import { createEventDispatcher } from "svelte";

  import { loadEmojiData } from "./emojiData";
  import type { EmojiCategory, EmojiLoadResult } from "./emojiData";

  const dispatch = createEventDispatcher<{
    select: { emoji: string };
    close: void;
  }>();

  const GRID_COLUMNS = 8;

  let categories = $state<EmojiCategory[]>([]);
  let loading = $state(true);
  let usedFallback = $state(false);
  let containerEl = $state<HTMLDivElement | null>(null);
  let emojiButtons: HTMLButtonElement[] = [];

  onMount(() => {
    void initialize();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dispatch("close");
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  });

  async function initialize() {
    const result: EmojiLoadResult = await loadEmojiData();
    categories = result.categories;
    usedFallback = result.usedFallback;
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
    if (!emojiButtons.length) {
      refreshButtons();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      dispatch("close");
      return;
    }

    if (!emojiButtons.length) {
      return;
    }

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
        nextIndex = (currentIndex - 1 + emojiButtons.length) % emojiButtons.length;
        break;
      case "ArrowDown":
        nextIndex = Math.min(currentIndex + GRID_COLUMNS, emojiButtons.length - 1);
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
        nextIndex = Math.min(rowStart + GRID_COLUMNS - 1, emojiButtons.length - 1);
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
    {#if usedFallback}
      <p class="mb-2 text-xs text-white/60">Showing limited emoji list.</p>
    {/if}
    <div class="max-h-64 space-y-3 overflow-y-auto pr-1">
      {#each categories as category (category.id)}
        <section>
          <p class="text-xs font-semibold uppercase tracking-wide text-white/60">
            {category.label}
          </p>
          <div class="mt-2 grid grid-cols-8 gap-1">
            {#each category.emojis as emoji, index (emoji + index)}
              <button
                type="button"
                class="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-700 text-xl transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 hover:bg-zinc-600"
                data-emoji={emoji}
                aria-label={`React with ${emoji}`}
                onclick={() => handleSelect(emoji)}
              >
                {emoji}
              </button>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  </div>
{/if}
