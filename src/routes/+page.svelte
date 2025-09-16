<script lang="ts">
  import { getContext } from 'svelte';
  import FriendsList from '$lib/components/lists/FriendsList.svelte';
  import { FRIENDS_LAYOUT_DATA_CONTEXT_KEY } from '$lib/data/contextKeys';
  import type { FriendsLayoutContext } from '$lib/data/contextTypes';

  const { friends } = getContext<FriendsLayoutContext>(FRIENDS_LAYOUT_DATA_CONTEXT_KEY);
</script>

<FriendsList friends={friends} />

