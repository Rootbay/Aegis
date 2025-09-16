<script lang="ts">
  import { Search, X } from '@lucide/svelte';
  import { SvelteSet } from 'svelte/reactivity';

  type Props = {
    onclose: () => void;
    allUsers: { id: string; name: string; avatar: string; isFriend: boolean; isPinned: boolean }[];
  };

  let { onclose, allUsers }: Props = $props();

  let searchTerm = $state('');
  let selectedUserIds = $state(new SvelteSet<string>());

  let filteredUsers = $derived(
    allUsers.filter(user =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  let pinnedFriends = $derived(
    filteredUsers.filter(user => user.isFriend && user.isPinned)
  );

  let otherUsers = $derived(
    filteredUsers.filter(user => !user.isPinned)
  );

  function toggleUserSelection(userId: string) {
    if (selectedUserIds.has(userId)) {
      selectedUserIds.delete(userId);
    } else {
      selectedUserIds.add(userId);
    }
    selectedUserIds = new SvelteSet(selectedUserIds);
  }

  function createGroup() {
    const selectedUsers = allUsers.filter(user => selectedUserIds.has(user.id));
    console.log('Creating group with users:', selectedUsers);
    onclose();
  }
</script>

<div class="fixed inset-0 flex items-center justify-center z-50">
  <div class="bg-card p-6 rounded-lg shadow-lg w-full max-w-sm relative">
    <button class="absolute top-3 right-3 text-muted-foreground hover:text-white cursor-pointer" onclick={onclose}>
      <X size={15} />
    </button>
    <h2 class="text-xl font-bold mb-4 text-white">Create New Group</h2>

    <div class="relative mb-4">
      <input
        type="text"
        placeholder="Search users..."
        bind:value={searchTerm}
        class="w-full bg-zinc-700 border border-zinc-600 rounded-md pl-12 pr-4 py-2 text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
      />
      <div class="absolute left-4 inset-y-0 flex items-center">
        <Search size={12} class="text-muted-foreground" />
      </div>
    </div>

    <div class="max-h-60 overflow-y-auto pr-2 space-y-4">
      {#if pinnedFriends.length > 0}
        <h3 class="text-sm font-semibold text-muted-foreground uppercase">Pinned Friends</h3>
        <div class="space-y-2">
          {#each pinnedFriends as user (user.id)}
            <label class="flex items-center p-2 rounded-md hover:bg-zinc-700 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={selectedUserIds.has(user.id)}
                onchange={() => toggleUserSelection(user.id)}
                class="form-checkbox h-4 w-4 text-cyan-600 rounded border-zinc-500 focus:ring-cyan-500 bg-zinc-900"
              />
              <img src={user.avatar} alt={user.name} class="w-8 h-8 rounded-full ml-3 mr-3" />
              <span class="text-white font-medium">{user.name}</span>
            </label>
          {/each}
        </div>
      {/if}

      {#if otherUsers.length > 0}
        <h3 class="text-sm font-semibold text-muted-foreground uppercase">Other Users</h3>
        <div class="space-y-2">
          {#each otherUsers as user (user.id)}
            <label class="flex items-center p-2 rounded-md hover:bg-zinc-700 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={selectedUserIds.has(user.id)}
                onchange={() => toggleUserSelection(user.id)}
                class="form-checkbox h-4 w-4 text-cyan-600 rounded border-zinc-500 focus:ring-cyan-500 bg-zinc-900"
              />
              <img src={user.avatar} alt={user.name} class="w-8 h-8 rounded-full ml-3 mr-3" />
              <span class="text-white font-medium">{user.name}</span>
            </label>
          {/each}
        </div>
      {/if}

      {#if filteredUsers.length === 0}
        <p class="text-center text-zinc-500">No users found.</p>
      {/if}
    </div>

    <button
        class="w-full bg-cyan-600 text-white py-2 rounded-md hover:bg-cyan-500 transition-colors font-semibold cursor-pointer mt-6"
        onclick={createGroup}
        disabled={selectedUserIds.size === 0}
      >
      Create Group
    </button>
  </div>
</div>
