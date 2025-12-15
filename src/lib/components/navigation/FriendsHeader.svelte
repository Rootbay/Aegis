<svelte:options runes={true} />

<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import {
    Tabs,
    TabsList,
    TabsTrigger,
  } from "$lib/components/ui/tabs";
  import { UserRoundPlus, Users } from "@lucide/svelte";

  let { tabs, activeTab, onTabSelect, onAddFriend } = $props<{
    tabs: readonly string[];
    activeTab: string;
    // eslint-disable-next-line no-unused-vars
    onTabSelect: (value: string) => void;
    onAddFriend: () => void;
  }>();
</script>

<header
  class="h-[55px] border-b border-border px-4 pt-4 pb-2 flex items-center justify-start sticky top-0 z-10 bg-card"
>
  <div class="flex flex-wrap items-center gap-2">
    <div class="flex items-center gap-2 text-sm font-semibold">
      <Users size={18} />
      <p class="m-0">
        Friends
      </p>
    </div>
    <span
      class="h-1.5 w-1.5 rounded-full bg-foreground/70"
      aria-hidden="true"
    ></span>
    <Tabs
      value={activeTab}
      onValueChange={(value) => onTabSelect(value as string)}
      class="flex-1 min-w-[140px]"
    >
      <TabsList class="w-full gap-2 bg-transparent">
        {#each tabs as tab (tab)}
          <TabsTrigger
            value={tab}
            class="px-3 py-1 text-sm font-semibold border-none cursor-pointer"
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
