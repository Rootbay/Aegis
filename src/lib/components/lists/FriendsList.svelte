<svelte:options runes={true} />

<script lang="ts">
  import { getContext, onDestroy } from "svelte";
  import { FRIENDS_LAYOUT_DATA_CONTEXT_KEY } from "$lib/contextKeys";
  import type { FriendsLayoutContext } from "$lib/contextTypes";
  import FriendItem from "$lib/components/lists/FriendItem.svelte";
  import { friendStore } from "$lib/features/friends/stores/friendStore";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
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

  let friendStoreLoading = true;
  const unsubscribe = friendStore.subscribe(({ loading }) => {
    friendStoreLoading = loading;
  });
  onDestroy(() => unsubscribe());

  const loading = $derived.by(
    () =>
      props.loading ??
      friendsLayoutContext?.loading ??
      friendStoreLoading ??
      false,
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

    filteredFriends.forEach((friend: Friend) => {
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

  const widthPatterns = [
    { primary: "w-1/8", secondary: "w-1/3" },
    { primary: "w-3/16", secondary: "w-2/5" },
    { primary: "w-1/16", secondary: "w-5/12" },
    { primary: "w-2/16", secondary: "w-7/16" },
    { primary: "w-4/16", secondary: "w-3/8" },
  ];

  const skeletonRows = Array.from({ length: 5 }, (_, index) => ({
    id: index,
    ...widthPatterns[index % widthPatterns.length],
  }));
</script>

<div class="flex flex-col h-full w-full bg-card/50 text-zinc-100 {extraClass}">
  <div class="grow overflow-y-auto px-4 pb-4">
    {#if loading}
      <div class="space-y-3 pt-2" role="status" aria-live="polite">
        {#each skeletonRows as row (row.id)}
          <div class="flex items-center gap-3 rounded-lg px-2 py-1">
            <Skeleton class="h-10 w-10 rounded-full bg-muted-foreground/50" />
            <div class="flex-1 space-y-2">
              <Skeleton
                class={`h-4 ${row.primary} bg-muted-foreground/50`}
              />
              <Skeleton
                class={`h-3 ${row.secondary} bg-muted-foreground/30`}
              />
            </div>
          </div>
        {/each}
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
