<script lang="ts">
  import { getContext } from 'svelte';
  import FriendsList from '$lib/components/lists/FriendsList.svelte';
  import { FRIENDS_LAYOUT_DATA_CONTEXT_KEY } from '$lib/data/contextKeys';

  const { friends } = getContext(FRIENDS_LAYOUT_DATA_CONTEXT_KEY);
</script>

<FriendsList friends={friends} />
