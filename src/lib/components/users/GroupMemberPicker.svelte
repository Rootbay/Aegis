<script lang="ts">
  import { Search } from "@lucide/svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { Input } from "$lib/components/ui/input/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import type { GroupModalUser } from "$lib/features/chat/utils/contextMenu";

  type Props = {
    users?: GroupModalUser[];
    selectedUserIds: SvelteSet<string>;
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

  const pinnedFriends = $derived.by(() =>
    filteredUsers.filter((user) => user.isFriend && user.isPinned),
  );

  const otherUsers = $derived.by(() =>
    filteredUsers.filter((user) => !user.isPinned),
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
      {#if pinnedFriends.length > 0}
        <section class="space-y-2">
          <p class="text-xs font-semibold uppercase text-muted-foreground">
            Pinned Friends
          </p>
          <div class="space-y-1.5">
            {#each pinnedFriends as user (user.id)}
              <label
                class="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedUserIds.has(user.id)}
                  onchange={() => handleToggle(user.id)}
                  class="h-4 w-4 rounded border-border bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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

      {#if otherUsers.length > 0}
        <section class="space-y-2">
          <p class="text-xs font-semibold uppercase text-muted-foreground">
            Other Users
          </p>
          <div class="space-y-1.5">
            {#each otherUsers as user (user.id)}
              <label
                class="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedUserIds.has(user.id)}
                  onchange={() => handleToggle(user.id)}
                  class="h-4 w-4 rounded border-border bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
