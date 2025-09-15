<script lang="ts">
  import { getContext } from 'svelte';
  import { FRIENDS_LAYOUT_DATA_CONTEXT_KEY } from '$lib/data/contextKeys';
  import FriendItem from '../FriendItem.svelte';
  import EmptyStateMessage from '$lib/components/ui/EmptyStateMessage.svelte';
  import type { Friend } from '$lib/models/Friend';
  import VirtualList from '@humanspeak/svelte-virtual-list';

  let { clazz = '', friends = [] } = $props<{ clazz?: string; friends: Friend[] }>();

  const { activeTab } = getContext(FRIENDS_LAYOUT_DATA_CONTEXT_KEY);

  let filteredFriends = $derived(friends.filter(friend => {
    switch (activeTab) {
      case 'All':
        return friend.status !== 'Blocked' && friend.status !== 'Pending';
      case 'Online':
        return friend.status === 'Online';
      case 'Blocked':
        return friend.status === 'Blocked';
      case 'Pending':
        return friend.status === 'Pending';
      default:
        return false;
    }
  }));

  let virtualListItems = $derived(() => {
    const items: Array<Friend | { type: 'header', status: string, count: number }> = [];
    const groups: Record<string, Friend[]> = {
      Online: [],
      Offline: [],
      Blocked: [],
      Pending: [],
    };
    filteredFriends.forEach(friend => {
      if (groups[friend.status]) {
        groups[friend.status].push(friend);
      }
    });

    for (const status of ['Online', 'Offline', 'Blocked', 'Pending']) {
      const friendsInGroup = groups[status];
      if (friendsInGroup.length > 0) {
        items.push({ type: 'header', status: status, count: friendsInGroup.length });
        items.push(...friendsInGroup);
      }
    }
    return items;
  });

  function getItemHeight(item: Friend | { type: 'header', status: string, count: number }) {
    if (item.type === 'header') {
      return 40;
    } else {
      return 60;
    }
  }
</script>

<div class="flex flex-col h-full w-full bg-zinc-900 text-zinc-100 {clazz}">
  <div class="flex-grow overflow-y-auto px-4 pb-4">
    {#if virtualListItems.length > 0}
      <VirtualList items={virtualListItems} itemHeight={getItemHeight}>
        {#each virtualListItems as item (item.type === 'header' ? item.status : item.id)}
          {#if item.type === 'header'}
            <h2 class="text-xs font-semibold uppercase text-muted-foreground mt-4 mb-2">{item.status} - {item.count}</h2>
          {:else}
            <li>
              <FriendItem friend={item} />
            </li>
          {/if}
        {/each}
      </VirtualList>
    {:else}
      <EmptyStateMessage {activeTab} />
    {/if}
  </div>
</div>