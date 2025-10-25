<svelte:options runes={true} />

<script lang="ts">
  import { setContext } from "svelte";
  import FriendsList from "../FriendsList.svelte";
  import { FRIENDS_LAYOUT_DATA_CONTEXT_KEY } from "$lib/contextKeys";
  import type { FriendsLayoutContext } from "$lib/contextTypes";
  import type { Friend } from "$lib/features/friends/models/Friend";

  let {
    friends = [],
    loading = false,
    activeTab = "All",
  }: {
    friends?: Friend[];
    loading?: boolean;
    activeTab?: string;
  } = $props();

  const context: FriendsLayoutContext = {
    get friends() {
      return friends;
    },
    get activeTab() {
      return activeTab;
    },
    get loading() {
      return loading;
    },
  };

  setContext(FRIENDS_LAYOUT_DATA_CONTEXT_KEY, context);
</script>

<FriendsList {friends} {loading} {activeTab} />
