<svelte:options runes={true} />

<script lang="ts">
  import { getContext } from "svelte";
  import { FRIENDS_LAYOUT_DATA_CONTEXT_KEY } from "$lib/contextKeys";
  import type { FriendsLayoutContext } from "$lib/contextTypes";
  import FriendItem from "$lib/components/lists/FriendItem.svelte";
  import type { Friend } from "$lib/features/friends/models/Friend";

  let { clazz = "", friends }: { clazz?: string; friends: Friend[] } = $props();
  const { activeTab } = getContext<FriendsLayoutContext>(
    FRIENDS_LAYOUT_DATA_CONTEXT_KEY,
  );

  type FriendsListHeader = { kind: "header"; status: string; count: number };
  type FriendsListItem = Friend | FriendsListHeader;

  const filteredFriends = $derived.by(() =>
    friends.filter((friend: Friend) => {
      switch (activeTab) {
        case "All":
          return friend.status !== "Blocked" && friend.status !== "Pending";
        case "Online":
          return friend.status === "Online";
        case "Blocked":
          return friend.status === "Blocked";
        case "Pending":
          return friend.status === "Pending";
        default:
          return true;
      }
    }),
  );

  const listItems = $derived.by(() => {
    const items: FriendsListItem[] = [];
    const groups: Record<string, Friend[]> = {
      Online: [],
      Offline: [],
      Blocked: [],
      Pending: [],
    };

    filteredFriends.forEach((friend) => {
      const bucket = groups[friend.status] ?? groups.Offline;
      bucket.push(friend);
    });

    for (const status of ["Online", "Offline", "Blocked", "Pending"]) {
      const friendsInGroup = groups[status];
      if (friendsInGroup.length > 0) {
        items.push({ kind: "header", status, count: friendsInGroup.length });
        items.push(...friendsInGroup);
      }
    }

    return items;
  });

  function isHeader(item: FriendsListItem): item is FriendsListHeader {
    return (item as FriendsListHeader).kind === "header";
  }
</script>

<div class="flex flex-col h-full w-full text-zinc-100 {clazz}">
  <div class="flex-grow overflow-y-auto px-4 pb-4">
    {#if listItems.length > 0}
      <ul class="space-y-2">
        {#each listItems as item (isHeader(item) ? `header-${item.status}` : `friend-${item.id}`)}
          {#if isHeader(item)}
            <li
              class="text-xs font-semibold uppercase text-muted-foreground mt-4 mb-2"
            >
              {item.status} - {item.count}
            </li>
          {:else}
            <li>
              <FriendItem friend={item} />
            </li>
          {/if}
        {/each}
      </ul>
    {:else if activeTab === "Pending"}
      <p class="text-muted-foreground text-center mt-8">
        No pending friend requests.
      </p>
    {:else}
      <p class="text-muted-foreground text-center mt-8">
        No friends to display in this category.
      </p>
    {/if}
  </div>
</div>
