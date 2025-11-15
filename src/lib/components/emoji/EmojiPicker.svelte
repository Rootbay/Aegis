<svelte:options runes={true} />

<script lang="ts">
  import { onMount, tick } from "svelte";
  import { loadEmojiData, type EmojiLoadResult } from "./emojiData";
  import type { EmojiCategory, EmojiEntry } from "./types";
  import { createEventDispatcher } from "svelte";
  import type { Component } from "svelte";
  import {
    ChevronDown,
    Hash,
    Leaf,
    Music3,
    Smile,
    Sparkles,
    Users,
  } from "@lucide/svelte";
  import type { IconProps } from "@lucide/svelte";
  import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
  } from "$lib/components/ui/collapsible";
  import StatusPanel from "./StatusPanel.svelte";
  import { Button } from "$lib/components/ui/button/index";
  import { Separator } from "$lib/components/ui/separator/index";

  let {
    emojiCategories,
    fallbackUsed,
    searchTerm = "",
  } = $props<{
    emojiCategories?: EmojiCategory[] | null;
    fallbackUsed?: boolean | null;
    searchTerm?: string | null;
  }>();

  const dispatch = createEventDispatcher<{
    select: { emoji: string };
    close: void;
  }>();

  const GRID_COLUMNS = 8;

  let categories = $state<EmojiCategory[]>([]);
  let filteredCategories = $state<EmojiCategory[]>([]);
  let loading = $state(true);
  let fallbackActive = $state(false);
  let containerEl = $state<HTMLDivElement | null>(null);
  let emojiButtons: HTMLButtonElement[] = [];
  let previewEmoji = $state<EmojiEntry | null>(null);
  let hasLoadedDefaults = false;
  let defaultLoadPromise: Promise<void> | null = null;
  let lastProvidedCategories: EmojiCategory[] | null | undefined = undefined;
  let lastFallbackHint: boolean | null | undefined = undefined;

  const categoryAnchors: Record<string, HTMLElement> = {};
  type LucideIconComponent = Component<IconProps, {}, "">;
  const categoryIconKeywords: [string, LucideIconComponent][] = [
    ["smile", Smile],
    ["emotion", Smile],
    ["face", Smile],
    ["people", Users],
    ["person", Users],
    ["body", Users],
    ["nature", Leaf],
    ["animal", Leaf],
    ["plant", Leaf],
    ["symbol", Hash],
    ["star", Sparkles],
    ["sparkle", Sparkles],
    ["music", Music3],
    ["sound", Music3],
  ];

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
    const targetElement = event.target as HTMLElement | null;
    if (targetElement) {
      const tag = targetElement.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") {
        return;
      }
    }

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

  function categoryAnchor(
    node: HTMLElement,
    initialCategoryId: string | null | undefined,
  ) {
    let currentId = initialCategoryId;
    if (currentId) {
      categoryAnchors[currentId] = node;
    }

    return {
      update(nextId: string | null | undefined) {
        if (currentId && categoryAnchors[currentId] === node) {
          delete categoryAnchors[currentId];
        }
        currentId = nextId;
        if (currentId) {
          categoryAnchors[currentId] = node;
        }
      },
      destroy() {
        if (currentId && categoryAnchors[currentId] === node) {
          delete categoryAnchors[currentId];
        }
      },
    };
  }

  function scrollToCategory(categoryId: string) {
    const target = categoryAnchors[categoryId];
    if (!target || !containerEl) {
      return;
    }
    const targetRect = target.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    const offset =
      targetRect.top - containerRect.top + (containerEl.scrollTop ?? 0);
    containerEl.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
  }

  function getCategoryIcon(category: EmojiCategory): LucideIconComponent {
    const normalized = category.label?.toLowerCase() ?? "";
    for (const [keyword, Icon] of categoryIconKeywords) {
      if (normalized.includes(keyword)) {
        return Icon;
      }
    }
    return Sparkles;
  }

  function slugifyLabel(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function getEmojiRawName(emoji: EmojiEntry) {
    const base = getEmojiLabel(emoji);
    const slug = slugifyLabel(base);
    if (slug.length > 0) {
      return `:${slug}:`;
    }

    const codePoints = Array.from(emoji.value)
      .map((char) => char.codePointAt(0))
      .filter(Boolean)
      .map((point) => point!.toString(16).toUpperCase().padStart(4, "0"));
    return `:${codePoints.map((code) => `U${code}`).join("_") || emoji.value}:`;
  }

  function previewInResults(results: EmojiCategory[]) {
    if (!previewEmoji) {
      return false;
    }
    const value = getEmojiValue(previewEmoji);
    return results.some((category) =>
      category.emojis.some((emoji) => getEmojiValue(emoji) === value),
    );
  }

  async function applyFilteredCategories(
    source: EmojiCategory[],
    term: string,
  ) {
    const normalized = term.trim().toLowerCase();
    const nextCategories =
      normalized.length === 0
        ? source
        : source
            .map((category) => {
              const filtered = category.emojis.filter((emoji) => {
                const label = getEmojiLabel(emoji).toLowerCase();
                return label.includes(normalized) || getEmojiValue(emoji).includes(normalized);
              });
              if (!filtered.length) {
                return null;
              }
              return { ...category, emojis: filtered };
            })
            .filter((category): category is EmojiCategory => Boolean(category));

    filteredCategories = nextCategories;
    if (nextCategories.length === 0) {
      previewEmoji = null;
    } else if (!previewInResults(nextCategories)) {
      previewEmoji = nextCategories[0].emojis[0] ?? null;
    }
    await tick();
    refreshButtons();
    if (nextCategories.length > 0) {
      focusFirstButton();
    }
  }

  $effect(() => {
    const baseCategories = categories;
    const term = searchTerm ?? "";
    void applyFilteredCategories(baseCategories, term);
  });
</script>


{#if loading}
  <StatusPanel message="Loading emojis…" />
{:else}
  <div
    class="w-full h-full bg-zinc-900 shadow-lg flex flex-col min-h-0"
    role="dialog"
    aria-label="Emoji picker"
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
    {#if !loading && filteredCategories.length === 0}
      <div class="flex flex-1 items-center justify-center min-h-0">
        <StatusPanel
          message={
            (searchTerm ?? "").trim().length > 0
              ? "No emojis match your search."
              : "No emojis available."
          }
        />
      </div>
    {:else}
      <div class="flex flex-1 flex-col gap-0 min-h-0 h-full">
        <div class="flex flex-1 min-h-0 overflow-hidden bg-zinc-900 shadow-[0_10px_30px_rgba(15,23,42,0.4)]">
          <aside class="w-12 h-full bg-background p-2">
            <div class="flex h-full flex-col items-center rounded-2xl">
              {#if filteredCategories.length > 0}
                {@const recentCategory = filteredCategories[0]}
                {@const RecentIcon = getCategoryIcon(recentCategory)}
                <Button
                  variant="ghost"
                  class="flex h-8 w-8 items-center justify-center rounded-sm p-1 mb-2 transition"
                  aria-label={recentCategory.label}
                  title={recentCategory.label}
                  onclick={() => scrollToCategory(recentCategory.id)}
                >
                  <RecentIcon class="h-6 w-6 text-white" />
                </Button>
                {#if filteredCategories.length > 1}
                  <Separator class="my-1 w-full opacity-60" />
                  {#each filteredCategories.slice(1) as category (category.id)}
                    {@const CategoryIcon = getCategoryIcon(category)}
                    <Button
                      variant="ghost"
                      class="flex h-8 w-8 items-center justify-center rounded-sm p-1 mb-[2px] transition"
                      aria-label={category.label}
                      title={category.label}
                      onclick={() => scrollToCategory(category.id)}
                    >
                      <CategoryIcon class="h-6 w-6 text-white" />
                    </Button>
                  {/each}
                {/if}
              {/if}
            </div>
          </aside>
          <div class="flex flex-1 flex-col min-h-0">
            <section class="flex flex-1 flex-col bg-card px-4 py-4 pb-0 h-full min-h-0">
              <div
                class="flex-1 min-h-0 space-y-3 overflow-y-auto pr-1 emoji-scroll-area"
                bind:this={containerEl}
                role="presentation"
              >
                {#each filteredCategories as category (category.id)}
                  <Collapsible open class="space-y-2">
                    <CollapsibleTrigger
                      class="flex items-center justify-between text-xs font-semibold text-white/60 hover:text-white/80 transition cursor-pointer"
                      aria-controls={`${category.id}-content`}
                    >
                      <span class="truncate">{category.label}</span>
                      <ChevronDown class="h-4 w-4" />
                    </CollapsibleTrigger>
                    <CollapsibleContent id={`${category.id}-content`}>
                      <div use:categoryAnchor={category.id} class="space-y-2">
                        <ul
                          class="mt-2 grid grid-cols-[repeat(auto-fit,minmax(48px,1fr))] gap-0 p-0 m-0"
                          role="list"
                        >
                          {#each category.emojis as emoji, index (getEmojiKey(emoji, index))}
                            <li class="list-none">
                              <Button
                                variant="ghost"
                                class="flex h-12 w-12 items-center justify-center bg-transparent p-1 text-4xl transition"
                                data-emoji={getEmojiValue(emoji)}
                                aria-label={`React with ${getEmojiLabel(emoji)}`}
                                onmouseenter={() => (previewEmoji = emoji)}
                                onfocus={() => (previewEmoji = emoji)}
                                onclick={() => handleSelect(getEmojiValue(emoji))}
                              >
                                {#if emoji.type === "unicode"}
                                  <span class="flex h-10 w-10 items-center justify-center text-[40px] leading-10">
                                    {emoji.value}
                                  </span>
                                {:else}
                                  <img
                                    src={emoji.url}
                                    alt={getEmojiLabel(emoji)}
                                    class="h-10 w-10 object-contain"
                                    decoding="async"
                                    loading="lazy"
                                    data-animated={emoji.animated ? "true" : undefined}
                                  />
                                {/if}
                              </Button>
                            </li>
                          {/each}
                        </ul>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                {/each}
              </div>
            </section>
            <footer class="flex items-center gap-1 border-t border-white/10 bg-background px-4 py-2 text-white shrink-0">
              {#if previewEmoji}
                <span class="text-3xl">
                  {#if previewEmoji.type === "unicode"}
                    {previewEmoji.value}
                  {:else}
                    <img
                      src={previewEmoji.url}
                      alt={getEmojiLabel(previewEmoji)}
                      class="h-7 w-7 object-contain"
                    />
                  {/if}
                </span>
                <div class="flex flex-col min-w-0">
                  <p class="text-xs font-mono uppercase tracking-wide text-white/70">
                    {getEmojiRawName(previewEmoji)}
                  </p>
                </div>
              {/if}
            </footer>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .emoji-scroll-area {
    scrollbar-width: thin;
    scrollbar-color: rgba(248, 250, 252, 0.4) transparent;
  }

  .emoji-scroll-area::-webkit-scrollbar {
    width: 6px;
  }

  .emoji-scroll-area::-webkit-scrollbar-track {
    background: transparent;
  }

  .emoji-scroll-area::-webkit-scrollbar-thumb {
    background-color: rgba(248, 250, 252, 0.6);
    border-radius: 999px;
    border: 1px solid transparent;
  }

  .emoji-scroll-area:hover::-webkit-scrollbar-thumb {
    background-color: rgba(248, 250, 252, 0.8);
  }
</style>
