<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';
  import { mdiClose, mdiPlus, mdiLogin } from '@mdi/js';
  import { invoke } from '@tauri-apps/api/core';
  import { v4 as uuidv4 } from 'uuid';
  import { userStore } from '$lib/data/stores/userStore';
  import type { Server } from '$lib/models/Server';

  export let show: boolean = false;
  export let onClose: () => void;
  export let onServerCreated: (server: Server) => void;
  export let onServerJoined: (serverId: string) => void;

  let newServerName = '';
  let joinServerId = '';

  function closeModal() {
    show = false;
    onClose();
  }

  async function handleCreateServer() {
    if (!newServerName.trim()) return;

    const newServer: Server = {
      id: uuidv4(),
      name: newServerName,
      owner_id: $userStore.me.id,
      created_at: new Date().toISOString(),
      channels: [],
      members: [],
    };

    try {
      await invoke('create_server', { server: newServer });
      console.log('Server created:', newServer);
      newServerName = '';
      closeModal();
      onServerCreated(newServer);
    } catch (error) {
      console.error('Failed to create server:', error);
    }
  }

  async function handleJoinServer() {
    if (!joinServerId.trim()) return;

    try {
      await invoke('send_server_invite', { serverId: joinServerId, userId: $userStore.me.id });
      console.log('Joined server:', joinServerId);
      joinServerId = '';
      closeModal();
      onServerJoined(joinServerId);
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
          <Icon data={mdiClose} size="6" />
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
          <Icon data={mdiPlus} size="6" clazz="mr-2" /> Create Server
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
          <Icon data={mdiLogin} size="6" clazz="mr-2" /> Join Server
        </button>
      </div>
    </div>
  </div>
{/if}
