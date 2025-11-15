<svelte:options runes={true} />

<script lang="ts">
  import { Input } from "$lib/components/ui/input/index.js";
  import {
    Tabs,
    TabsList,
    TabsTrigger,
  } from "$lib/components/ui/tabs";
  import { Search } from "@lucide/svelte";
  import {
    activeTopic,
    searchTerm,
    topics,
  } from "$lib/features/discover/discoverPanelStore";
  import type { DiscoverPanelTopic } from "$lib/features/discover/discoverPanelStore";
</script>

<header class="relative border-b border-border/70 px-4 pt-4">
  <div class="flex items-top justify-between gap-4">
    <div class="flex flex-1 flex-wrap gap-3 overflow-x-auto min-w-0">
      <Tabs
        value={$activeTopic}
        onValueChange={(value) =>
          activeTopic.set(value as DiscoverPanelTopic)
        }
        class="w-full"
      >
        <TabsList class="flex w-full flex-wrap gap-2 bg-transparent">
          {#each topics as topic}
            <TabsTrigger
              value={topic}
              class="px-3 py-1 text-sm font-semibold cursor-pointer"
            >
              {topic === "Home" ? "Home" : topic}
            </TabsTrigger>
          {/each}
        </TabsList>
      </Tabs>
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
