<script lang="ts">
  import { Search, X } from "@lucide/svelte";
  import { SvelteSet } from "svelte/reactivity";
  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
  } from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";

  type Props = {
    onclose: () => void;
    allUsers: {
      id: string;
      name: string;
      avatar: string;
      isFriend: boolean;
      isPinned: boolean;
    }[];
  };

  let { onclose, allUsers }: Props = $props();

  let open = $state(true);
  let searchTerm = $state("");
  // eslint-disable-next-line svelte/no-unnecessary-state-wrap
  let selectedUserIds = $state(new SvelteSet<string>());

  let filteredUsers = $derived(
    allUsers.filter((user) =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase()),
    ),
  );

  let pinnedFriends = $derived(
    filteredUsers.filter((user) => user.isFriend && user.isPinned),
  );

  let otherUsers = $derived(filteredUsers.filter((user) => !user.isPinned));

  function toggleUserSelection(userId: string) {
    const next = new SvelteSet(selectedUserIds);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    selectedUserIds = next;
  }

  function createGroup() {
    const selectedUsers = allUsers.filter((user) =>
      selectedUserIds.has(user.id),
    );
    console.log("Creating group with users:", selectedUsers);
    open = false;
  }

  $effect(() => {
    if (!open) {
      onclose();
    }
  });
</script>

<Dialog bind:open>
  <DialogContent class="sm:max-w-sm">
    <DialogHeader class="text-left">
      <DialogTitle>Create New Group</DialogTitle>
      <DialogDescription>
        Select friends to start a new group conversation.
      </DialogDescription>
    </DialogHeader>

    <div class="space-y-4">
      <div class="relative">
        <Input
          type="text"
          placeholder="Search users..."
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
                      onchange={() => toggleUserSelection(user.id)}
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
                      onchange={() => toggleUserSelection(user.id)}
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
              No users found.
            </p>
          {/if}
        </div>
      </ScrollArea>
    </div>

    <DialogFooter>
      <Button
        class="w-full"
        onclick={createGroup}
        disabled={selectedUserIds.size === 0}
      >
        Create Group
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
