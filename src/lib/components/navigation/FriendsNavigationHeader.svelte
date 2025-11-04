<svelte:options runes={true} />

<script lang="ts">
  import FriendsHeader from "$lib/components/navigation/FriendsHeader.svelte";

  import { FRIENDS_NAVIGATION_TABS } from "./constants";

  let { activeTab, onTabSelect, onAddFriend } = $props<{
    activeTab: string;
    onTabSelect: (tab: string) => void;
    onAddFriend: () => void;
  }>();
</script>

<FriendsHeader
  tabs={FRIENDS_NAVIGATION_TABS}
  {activeTab}
  {onTabSelect}
  {onAddFriend}
/>
