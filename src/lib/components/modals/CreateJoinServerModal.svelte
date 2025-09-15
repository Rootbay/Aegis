<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { X, ArrowLeft, Upload } from '@lucide/svelte';
  import { serverStore } from '$lib/data/stores/serverStore';
  import { userStore } from '$lib/data/stores/userStore';
  import type { Server } from '$lib/models/Server';

  export let onclose: () => void;

  let inviteLink: string = '';
  let modalView: 'main' | 'joinLink' | 'createServer' = 'main';
  let serverName: string = '';
  let serverIcon: File | null = null;
  let serverIconPreview: string | null = null;

  async function joinServer() {
    console.log('Joining server with link:', inviteLink);
    if (!$userStore.me) {
      console.error("User not loaded yet, cannot join server.");
      return;
    }
    try {
      const serverIdToJoin = inviteLink;
      await invoke('join_server', { serverId: serverIdToJoin, userId: $userStore.me.id });

      const newServer = {
        id: serverIdToJoin,
        name: `Joined Server (${serverIdToJoin})`,
        iconUrl: 'https://api.dicebear.com/8.x/bottts-neutral/svg?seed=' + encodeURIComponent(serverIdToJoin),
        owner_id: 'unknown',
        members: [$userStore.me],
        channels: []
      };
      serverStore.addServer(newServer);
      serverStore.setActiveServer(newServer.id);
      onclose();
    } catch (error) {
      console.error('Failed to join server:', error);
    }
  }

  async function createNewServer() {
      if (!$userStore.me) {
          console.error("User not loaded, cannot create a server.");
          return;
      }
      try {
        const newServerId = `server-${Date.now()}`;

        const serverForBackend = {
          id: newServerId,
          name: serverName,
          owner_id: $userStore.me.id,
          created_at: new Date().toISOString(),
          channels: [],
          members: [],
        };
        
        const createdServer: Server = await invoke('create_server', { server: serverForBackend });

        const newServerForStore: Server = {
          ...createdServer,
          iconUrl: serverIconPreview || 'https://api.dicebear.com/8.x/bottts-neutral/svg?seed=' + encodeURIComponent(createdServer.name),
        };

        serverStore.addServer(newServerForStore);
        serverStore.setActiveServer(newServerForStore.id);
        
        onclose();
      } catch (error) {
        console.error('Failed to create server:', error);
      }
  }

  function handleIconUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      serverIcon = target.files[0];
      serverIconPreview = URL.createObjectURL(serverIcon);
    }
  }

  const templates = [
    { id: 'template-1', name: 'Gaming Community' },
    { id: 'template-2', name: 'Study Group' },
    { id: 'template-3', name: 'Local Meetup' },
    { id: 'template-4', name: 'Development Team' },
    { id: 'template-5', name: 'Family & Friends' },
    { id: 'template-6', name: 'Project Collaboration' },
    { id: 'template-7', name: 'Book Club' },
    { id: 'template-8', name: 'Fitness Group' },
    { id: 'template-9', name: 'Travel Buddies' },
    { id: 'template-10', name: 'Art & Design' },
  ];
</script>

<div class="fixed inset-0 flex items-center justify-center z-50">
  <div class="bg-card p-8 rounded-lg shadow-lg w-full max-w-md relative">
    <button class="absolute top-4 right-4 text-muted-foreground hover:text-white cursor-pointer" onclick={onclose}>
      <X size={15} />
    </button>
    
    {#if modalView === 'main'}
      <h2 class="text-2xl font-bold mb-6 text-white">Create or Join Server</h2>
      <div class="space-y-4">
        <div class="space-y-3 max-h-80 overflow-y-auto pr-2">
          <button
            class="w-full bg-cyan-600 text-white py-3 rounded-md hover:bg-cyan-500 transition-colors font-semibold cursor-pointer mb-4"
            onclick={() => modalView = 'createServer'}
          >
            Create New Server
          </button>
          <h3 class="text-lg font-semibold mb-4 text-white">Server Templates</h3>
          {#each templates as template (template.id)}
            <div class="bg-zinc-700 p-4 rounded-md border border-zinc-600 hover:border-cyan-500 transition-colors cursor-pointer">
              <h4 class="font-semibold text-white">{template.name}</h4>
            </div>
          {/each}
        </div>

        <button
          class="w-full bg-zinc-700 text-white py-3 rounded-md hover:bg-zinc-600 transition-colors font-semibold cursor-pointer mt-4"
          onclick={() => (modalView = 'joinLink')}
        >
          Join with Link
        </button>
      </div>
    {:else if modalView === 'joinLink'}
      <h2 class="text-2xl font-bold mb-6 text-white">Join a Server</h2>
      <div class="space-y-4">
        <div>
          <label for="inviteLink" class="block text-sm font-medium text-zinc-300 mb-2">Enter Invite Link</label>
          <input
            type="text"
            id="inviteLink"
            bind:value={inviteLink}
            placeholder="e.g., aegis.chat/inv/aegis-community"
            class="w-full bg-zinc-700 border border-zinc-600 rounded-md px-4 py-2 text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
        <div class="text-sm text-muted-foreground space-y-1">
          <p>Invites should look like</p>
          <p><span class="font-mono">XyZ1aB7c</span></p>
          <p><span class="font-mono">https://aegis.com/inv/XyZ1aB7c</span></p>
          <p><span class="font-mono">https://aegis.com/inv/gaming-community</span></p>
        </div>
      </div>

      <div class="flex justify-between mt-8">
        <button
          class="flex items-center text-muted-foreground hover:text-white transition-colors cursor-pointer"
          onclick={() => (modalView = 'main')}
        >
          <ArrowLeft size={12} class="mr-2" />
          Back
        </button>
        <button
          class="bg-cyan-600 text-white py-2 px-4 rounded-md hover:bg-cyan-500 transition-colors font-semibold cursor-pointer"
          onclick={joinServer}
          disabled={!inviteLink.trim()}
        >
          Join
        </button>
      </div>
    {:else if modalView === 'createServer'}
      <h2 class="text-2xl font-bold mb-6 text-white">Create Your Server</h2>
      <div class="space-y-6">
        <div class="flex flex-col items-center">
          <label for="serverIcon" class="w-24 h-24 rounded-full bg-zinc-700 flex items-center justify-center cursor-pointer hover:bg-zinc-600 border-2 border-dashed border-zinc-500">
            {#if serverIconPreview}
              <img src={serverIconPreview} alt="Server Icon Preview" class="w-full h-full rounded-full object-cover">
            {:else}
              <Upload size={15} />
            {/if}
          </label>
          <input type="file" id="serverIcon" class="hidden" accept="image/*" onchange={handleIconUpload}>
          <span class="text-sm text-muted-foreground mt-2">Upload Icon</span>
        </div>
        <div>
          <label for="serverName" class="block text-sm font-medium text-zinc-300 mb-2">Server Name</label>
          <input
            type="text"
            id="serverName"
            bind:value={serverName}
            placeholder="My Awesome Server"
            class="w-full bg-zinc-700 border border-zinc-600 rounded-md px-4 py-2 text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      </div>

      <div class="flex justify-between mt-8">
        <button
          class="flex items-center text-muted-foreground hover:text-white transition-colors cursor-pointer"
          onclick={() => (modalView = 'main')}
        >
          <ArrowLeft size={12} class="mr-2" />
          Back
        </button>
        <button
          class="bg-cyan-600 text-white py-2 px-4 rounded-md hover:bg-cyan-500 transition-colors font-semibold cursor-pointer"
          onclick={createNewServer}
          disabled={!serverName.trim()}
        >
          Create
        </button>
      </div>
    {/if}
  </div>
</div>
