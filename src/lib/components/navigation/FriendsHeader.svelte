<svelte:options runes={true} />

<script lang="ts">
  import { Button } from "$lib/components/ui/button";
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
    {#each tabs as tab (tab)}
      <button
        type="button"
        class="px-3 py-1 rounded-md text-sm font-medium cursor-pointer h-8"
        class:bg-muted={activeTab === tab}
        class:hover:bg-muted={activeTab !== tab}
        onclick={() => onTabSelect(tab)}
      >
        {tab}
      </button>
    {/each}
    <Button type="button" onclick={onAddFriend} class="cursor-pointer">
      <UserRoundPlus size={10} class="mr-2" />
      Add Friend
    </Button>
  </div>
</header>
