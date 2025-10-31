<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { SvelteMap, SvelteSet } from "svelte/reactivity";
  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button/index.js";
  import { toasts } from "$lib/stores/ToastStore";
  import {
    chatStore,
    type BackendGroupChat,
  } from "$lib/features/chat/stores/chatStore";
  import type {
    GroupModalOptions,
    GroupModalUser,
  } from "$lib/features/chat/utils/contextMenu";
  import GroupMemberPicker from "$lib/components/users/GroupMemberPicker.svelte";

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
  let isSubmitting = $state(false);
  // eslint-disable-next-line svelte/no-unnecessary-state-wrap
  let selectedUserIds = $state(new SvelteSet<string>());

  let defaultSelectionsApplied = false;

  function getAvailableUsers() {
    const map = new SvelteMap(allUsers.map((user) => [user.id, user] as const));
    for (const user of additionalUsers) {
      if (!map.has(user.id)) {
        map.set(user.id, user);
      }
    }
    return Array.from(map.values());
  }

  let selectedUsers = $derived(
    getAvailableUsers().filter((user) => selectedUserIds.has(user.id)),
  );

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

    <GroupMemberPicker
      users={getAvailableUsers()}
      {selectedUserIds}
      onToggleUser={toggleUserSelection}
    />

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
