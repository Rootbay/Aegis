<script lang="ts">
  import { Search } from "@lucide/svelte";
  import { Input } from "$lib/components/ui/input/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import type { GroupModalUser } from "$lib/features/chat/utils/contextMenu";
  import { Checkbox } from "$lib/components/ui/checkbox/index";

  type Props = {
    users?: GroupModalUser[];
    selectedUserIds: Set<string>;
    onToggleUser?: (userId: string) => void; // eslint-disable-line no-unused-vars
    emptyStateMessage?: string;
    searchPlaceholder?: string;
  };

  let {
    users = [],
    selectedUserIds,
    onToggleUser = () => {},
    emptyStateMessage = "No users found.",
    searchPlaceholder = "Search users...",
  }: Props = $props();

  let searchTerm = $state("");

  const filteredUsers = $derived.by(() => {
    const term = searchTerm.toLowerCase();
    if (!term) {
      return users;
    }
    return users.filter((user) => user.name.toLowerCase().includes(term));
  });

  const friendUsers = $derived.by(() =>
    filteredUsers.filter((user) => user.source === "friend"),
  );

  const pinnedFriends = $derived.by(() =>
    friendUsers.filter((user) => user.isPinned),
  );

  const unpinnedFriends = $derived.by(() =>
    friendUsers.filter((user) => !user.isPinned),
  );

  const recentDms = $derived.by(() =>
    filteredUsers.filter((user) => user.source === "recentDm"),
  );

  function handleToggle(userId: string) {
    onToggleUser?.(userId);
  }
</script>

<div class="space-y-4">
  <div class="relative">
    <Input
      type="text"
      placeholder={searchPlaceholder}
      bind:value={searchTerm}
      class="pl-9"
    />
    <Search
      size={14}
      class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
    />
  </div>

  <ScrollArea class="max-h-60 pr-1">
    <div class="space-y-4">
      {#if friendUsers.length > 0}
        <section class="space-y-2">
          <p class="text-xs font-semibold uppercase text-muted-foreground">
            Friends
          </p>
          <div class="space-y-3">
            {#if pinnedFriends.length > 0}
              <div class="space-y-1.5">
                <p class="text-xs font-semibold uppercase text-muted-foreground">
                  Pinned Friends
                </p>
                <div class="space-y-1.5">
                  {#each pinnedFriends as user (user.id)}
                    <label
                      class="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedUserIds.has(user.id)}
                        onchange={() => handleToggle(user.id)}
                        class="h-4 w-4"
                      />
                      <img
                        src={user.avatar}
                        alt={user.name}
                        class="h-8 w-8 rounded-full object-cover"
                      />
                      <span class="text-sm font-medium text-foreground"
                        >{user.name}</span
                      >
                    </label>
                  {/each}
                </div>
              </div>
            {/if}

            {#if unpinnedFriends.length > 0}
              <div class="space-y-1.5">
                {#each unpinnedFriends as user (user.id)}
                  <label
                    class="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedUserIds.has(user.id)}
                      onchange={() => handleToggle(user.id)}
                      class="h-4 w-4"
                    />
                    <img
                      src={user.avatar}
                      alt={user.name}
                      class="h-8 w-8 rounded-full object-cover"
                    />
                    <span class="text-sm font-medium text-foreground"
                      >{user.name}</span
                    >
                  </label>
                {/each}
              </div>
            {/if}
          </div>
        </section>
      {/if}

      {#if recentDms.length > 0}
        <section class="space-y-2">
          <p class="text-xs font-semibold uppercase text-muted-foreground">
            Recent DMs
          </p>
          <div class="space-y-1.5">
            {#each recentDms as user (user.id)}
              <label
                class="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted cursor-pointer"
              >
                <Checkbox
                  checked={selectedUserIds.has(user.id)}
                  onchange={() => handleToggle(user.id)}
                  class="h-4 w-4"
                />
                <img
                  src={user.avatar}
                  alt={user.name}
                  class="h-8 w-8 rounded-full object-cover"
                />
                <span class="text-sm font-medium text-foreground"
                  >{user.name}</span
                >
              </label>
            {/each}
          </div>
        </section>
      {/if}

      {#if filteredUsers.length === 0}
        <p class="text-center text-sm text-muted-foreground">
          {emptyStateMessage}
        </p>
      {/if}
    </div>
  </ScrollArea>
</div>
