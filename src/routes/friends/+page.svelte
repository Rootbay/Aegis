<script lang="ts">
  import FriendsList from "$lib/components/lists/FriendsList.svelte";
  import { friendStore } from "$lib/features/friends/stores/friendStore";
  import type { Friend } from "$lib/features/friends/models/Friend";

  let friends: Friend[] = [];
  let loading = true;

  $: ({ friends, loading } = $friendStore);
</script>

<FriendsList {friends} {loading} />
