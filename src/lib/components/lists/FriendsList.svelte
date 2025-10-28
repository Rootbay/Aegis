<svelte:options runes={true} />

<script lang="ts">
  import { getContext } from "svelte";
  import { FRIENDS_LAYOUT_DATA_CONTEXT_KEY } from "$lib/contextKeys";
  import type { FriendsLayoutContext } from "$lib/contextTypes";
  import FriendItem from "$lib/components/lists/FriendItem.svelte";
  import type { Friend } from "$lib/features/friends/models/Friend";

  const friendsLayoutContext = getContext<FriendsLayoutContext | undefined>(
    FRIENDS_LAYOUT_DATA_CONTEXT_KEY,
  );

  const props = $props<{
    clazz?: string;
    friends?: Friend[];
    loading?: boolean;
    activeTab?: string;
  }>();

  const extraClass = $derived.by(() => props.clazz ?? "");
  const friendsList = $derived.by(
    () => props.friends ?? friendsLayoutContext?.friends ?? [],
  );

  const loading = $derived.by(
    () => props.loading ?? friendsLayoutContext?.loading ?? false,
  );

  const activeTab = $derived.by(
    () => props.activeTab ?? friendsLayoutContext?.activeTab ?? "All",
  );

  type FriendsListHeader = { kind: "header"; status: string; count: number };
  type FriendsListItem = Friend | FriendsListHeader;

  const filteredFriends = $derived.by(() =>
    friendsList.filter((friend: Friend) => {
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

<div class="flex flex-col h-full w-full text-zinc-100 {extraClass}">
  <div class="flex-grow overflow-y-auto px-4 pb-4">
    {#if loading}
      <div class="flex justify-center mt-8" role="status" aria-live="polite">
        <span class="sr-only">Loading friends…</span>
        <div
          class="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
          data-testid="friends-loading-indicator"
          aria-hidden="true"
        ></div>
      </div>
    {:else if listItems.length > 0}
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
