<script lang="ts">
  import { Search } from "@lucide/svelte";
  import { invoke } from "@tauri-apps/api/core";
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
  import { toasts } from "$lib/stores/ToastStore";
  import {
    chatStore,
    type BackendGroupChat,
  } from "$lib/features/chat/stores/chatStore";
  import type {
    GroupModalOptions,
    GroupModalUser,
  } from "$lib/features/chat/utils/contextMenu";

  type Props = {
    onclose: () => void;
    allUsers: GroupModalUser[];
    preselectedUserIds?: GroupModalOptions["preselectedUserIds"];
    additionalUsers?: GroupModalUser[];
  };

  let {
    onclose,
    allUsers,
    preselectedUserIds = [],
    additionalUsers = [],
  }: Props = $props();

  let open = $state(true);
  let searchTerm = $state("");
  let isSubmitting = $state(false);
  // eslint-disable-next-line svelte/no-unnecessary-state-wrap
  let selectedUserIds = $state(new SvelteSet<string>());

  let defaultSelectionsApplied = false;

  function getAvailableUsers() {
    const map = new Map(allUsers.map((user) => [user.id, user] as const));
    for (const user of additionalUsers) {
      if (!map.has(user.id)) {
        map.set(user.id, user);
      }
    }
    return Array.from(map.values());
  }

  let filteredUsers = $derived(
    getAvailableUsers().filter((user) =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase()),
    ),
  );

  let selectedUsers = $derived(
    getAvailableUsers().filter((user) => selectedUserIds.has(user.id)),
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

  function computeGroupName() {
    if (selectedUsers.length === 0) {
      return "New Group";
    }
    if (selectedUsers.length === 1) {
      return `${selectedUsers[0].name} & You`;
    }
    if (selectedUsers.length === 2) {
      return `${selectedUsers[0].name}, ${selectedUsers[1].name}`;
    }
    const primary = selectedUsers
      .slice(0, 2)
      .map((user) => user.name)
      .join(", ");
    return `${primary} +${selectedUsers.length - 2}`;
  }

  $effect(() => {
    if (!defaultSelectionsApplied && preselectedUserIds.length > 0) {
      const next = new SvelteSet(selectedUserIds);
      for (const id of preselectedUserIds) {
        next.add(id);
      }
      selectedUserIds = next;
      defaultSelectionsApplied = true;
    }
  });

  async function createGroup() {
    if (selectedUserIds.size === 0 || isSubmitting) {
      return;
    }
    const memberIds = Array.from(selectedUserIds);
    const proposedName = computeGroupName();
    isSubmitting = true;
    try {
      const payload = await invoke<
        BackendGroupChat & {
          ownerId?: string;
          owner_id?: string;
          createdAt?: string;
          created_at?: string;
          memberIds?: string[];
          member_ids?: string[];
        }
      >("create_group_dm", {
        memberIds,
        member_ids: memberIds,
        name: proposedName,
      });

      const summary = chatStore.handleGroupChatCreated({
        id: payload.id,
        name: payload.name ?? proposedName,
        owner_id: payload.owner_id ?? payload.ownerId ?? undefined,
        created_at: payload.created_at ?? payload.createdAt ?? undefined,
        member_ids: payload.member_ids ?? payload.memberIds ?? [...memberIds],
      });

      await chatStore.setActiveChat(summary.id, "group", undefined, {
        forceRefresh: true,
      });

      toasts.addToast("Group created.", "success");
      open = false;
    } catch (error) {
      console.error("Failed to create group", error);
      toasts.addToast("Failed to create group.", "error");
    } finally {
      isSubmitting = false;
    }
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
        disabled={selectedUserIds.size === 0 || isSubmitting}
      >
        {isSubmitting ? "Creating..." : "Create Group"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
