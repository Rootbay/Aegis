<script lang="ts">
  import { Plus, CirclePlus, X } from '@lucide/svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { v4 as uuidv4 } from 'uuid';
  import { userStore } from '$lib/stores/userStore';
  import type { Server } from '$lib/models/Server';

  type UnaryHandler<T> = (value: T) => void; // eslint-disable-line no-unused-vars

  type ServerManagementModalProps = {
    show?: boolean;
    onclose?: () => void;
    onserverCreated?: UnaryHandler<Server>;
    onserverJoined?: UnaryHandler<string>;
  };

  let {
    show = $bindable(false),
    onclose,
    onserverCreated,
    onserverJoined
  }: ServerManagementModalProps = $props();

  let newServerName = $state('');
  let joinServerId = $state('');

  function closeModal() {
    show = false;
    onclose?.();
  }

  async function handleCreateServer() {
    if (!newServerName.trim()) return;
    if (!$userStore.me) {
      console.error('User not loaded, cannot create server.');
      return;
    }

    const newServer: Server = {
      id: uuidv4(),
      name: newServerName,
      owner_id: $userStore.me.id,
      created_at: new Date().toISOString(),
      channels: [],
      members: [],
      roles: [],
    };

    try {
      await invoke('create_server', { server: newServer });
      console.log('Server created:', newServer);
      newServerName = '';
      closeModal();
      onserverCreated?.(newServer);
    } catch (error) {
      console.error('Failed to create server:', error);
    }
  }

  async function handleJoinServer() {
    const trimmedServerId = joinServerId.trim();
    if (!trimmedServerId) return;
    if (!$userStore.me) {
      console.error('User not loaded, cannot join server.');
      return;
    }

    try {
      await invoke('send_server_invite', { server_id: trimmedServerId, user_id: $userStore.me.id });
      console.log('Joined server:', trimmedServerId);
      joinServerId = '';
      closeModal();
      onserverJoined?.(trimmedServerId);
    } catch (error) {
      console.error('Failed to join server:', error);
    }
  }
</script>

{#if show}
  <div role="button" tabindex="0" class="fixed inset-0 flex items-center justify-center z-50" style="background-color: rgba(0, 0, 0, 0.5);" onclick={closeModal} onkeydown={(e) => e.key === 'Enter' && closeModal()}>
    <div role="button" tabindex="0" class="bg-card p-6 rounded-lg shadow-lg w-11/12 max-w-md" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Enter' && e.stopPropagation()}>
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold">Server Management</h2>
        <button onclick={closeModal} class="text-muted-foreground hover:text-white">
          <X size={12} />
        </button>
      </div>

      <div class="mb-6">
        <h3 class="text-lg font-semibold mb-2">Create New Server</h3>
        <input
          type="text"
          placeholder="Server Name"
          class="w-full bg-zinc-700 border border-zinc-600 rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-2"
          bind:value={newServerName}
        />
        <button
          class="w-full bg-cyan-600 text-white rounded-md px-4 py-2 flex items-center justify-center hover:bg-cyan-500"
          onclick={handleCreateServer}
        >
          <Plus size={10} class="mr-2" /> Create Server
        </button>
      </div>

      <div>
        <h3 class="text-lg font-semibold mb-2">Join Existing Server</h3>
        <input
          type="text"
          placeholder="Server ID"
          class="w-full bg-zinc-700 border border-zinc-600 rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-2"
          bind:value={joinServerId}
        />
        <button
          class="w-full bg-green-600 text-white rounded-md px-4 py-2 flex items-center justify-center hover:bg-green-500"
          onclick={handleJoinServer}
        >
          <CirclePlus size={10} class="mr-2" /> Join Server
        </button>
      </div>
    </div>
  </div>
{/if}


