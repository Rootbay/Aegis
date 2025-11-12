<svelte:options runes={true} />

<script lang="ts">
  import { Input } from "$lib/components/ui/input/index.js";
  import { Search } from "@lucide/svelte";
  import {
    activeTopic,
    searchTerm,
    topics,
  } from "$lib/features/discover/discoverPanelStore";
</script>

<header class="relative border-b border-border/70 px-4 pt-4">
  <div class="flex items-end justify-between gap-4">
    <div class="flex flex-1 flex-wrap items-end gap-3 overflow-x-auto">
      {#each topics as topic}
        <button
          type="button"
          class={`transition-colors duration-200 text-sm font-semibold capitalize pb-5 border-b-2 cursor-pointer ${
            $activeTopic === topic
              ? "border-white text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground/80"
          } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2`}
          onclick={() => activeTopic.set(topic)}
        >
          {topic === "Home" ? "Home" : topic}
        </button>
      {/each}
    </div>

    <div class="flex shrink-0 items-center gap-3 w-full max-w-sm mb-4">
      <div class="relative w-full">
        <Search
          size={16}
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          class="pl-9 w-full"
          placeholder="Search by server name or ID"
          bind:value={$searchTerm}
        />
      </div>
    </div>
  </div>
</header>
