<svelte:options runes={true} />

<script lang="ts">
  import FriendsHeader from "$lib/components/navigation/FriendsHeader.svelte";

  import { FRIENDS_NAVIGATION_TABS } from "./constants";

  /* eslint-disable no-unused-vars */
  let { activeTab, onTabSelect, onAddFriend } = $props<{
    activeTab: string;
    onTabSelect: (_arg0: string) => void;
    onAddFriend: () => void;
  }>();
  /* eslint-enable no-unused-vars */
</script>

<FriendsHeader
  tabs={FRIENDS_NAVIGATION_TABS}
  {activeTab}
  {onTabSelect}
  {onAddFriend}
/>
