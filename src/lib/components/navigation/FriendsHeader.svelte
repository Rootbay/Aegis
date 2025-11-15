<svelte:options runes={true} />

<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import {
    Tabs,
    TabsList,
    TabsTrigger,
  } from "$lib/components/ui/tabs";
  import { UserRoundPlus } from "@lucide/svelte";

  let { tabs, activeTab, onTabSelect, onAddFriend } = $props<{
    tabs: readonly string[];
    activeTab: string;
    onTabSelect: (tab: string) => void;
    onAddFriend: () => void;
  }>();
</script>

<header
  class="h-[55px] border-b border-border px-4 pt-4 pb-2 flex items-center justify-start sticky top-0 z-10 bg-card"
>
  <div class="flex flex-wrap items-center gap-2">
    <Tabs
      value={activeTab}
      onValueChange={(value) => onTabSelect(value as string)}
      class="flex-1 min-w-[140px]"
    >
      <TabsList class="w-full gap-2 bg-transparent p-1">
        {#each tabs as tab (tab)}
          <TabsTrigger
            value={tab}
            class="px-3 py-1 text-sm font-semibold uppercase tracking-wide"
          >
            {tab}
          </TabsTrigger>
        {/each}
      </TabsList>
    </Tabs>
    <Button type="button" onclick={onAddFriend} class="cursor-pointer">
      <UserRoundPlus size={10} class="mr-2" />
      Add Friend
    </Button>
  </div>
</header>
