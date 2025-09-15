<script lang="ts">
  import type { Server } from '$lib/models/Server';

  import Overview from './server-settings/Overview.svelte';
  import Moderation from './server-settings/Moderation.svelte';
  import Privacy from './server-settings/Privacy.svelte';
  import Roles from './server-settings/Roles.svelte';
  import UserManagement from './server-settings/UserManagement.svelte';
  import DeleteServer from './server-settings/DeleteServer.svelte';

  export let show = false;
  export let server: Server | null = null;
  export let onClose: () => void;
  export let onUpdateServer: (server: Server) => void;
  export let onDeleteServer: (server: Server) => void;

  let activeTab = 'overview';

  function close() {
    show = false;
    onClose();
  }
</script>

<style lang="postcss">
  .custom-scrollbar::-webkit-scrollbar {
    width: 8px;
  }

  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: transparent;
    border-radius: 4px;
    border: 2px solid transparent;
  }

  .custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background-color: theme('colors.zinc.700');
  }

  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: theme('colors.zinc.600');
  }
</style>

{#if show && server}
  <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[10002]">
    <div class="bg-zinc-900 text-white rounded-lg shadow-2xl w-full max-w-4xl h-[80vh] flex">
      <aside class="w-64 bg-card p-4 rounded-l-lg flex flex-col">
        <h2 class="text-lg font-bold mb-6">{server.name} Settings</h2>
        <div class="flex-grow overflow-y-auto custom-scrollbar pr-2">
          <nav class="space-y-2">
            <button class="w-full text-left px-3 py-2 rounded {activeTab === 'overview' ? 'bg-indigo-600' : 'hover:bg-zinc-700'}" on:click={() => activeTab = 'overview'}>Overview</button>
            <button class="w-full text-left px-3 py-2 rounded {activeTab === 'moderation' ? 'bg-indigo-600' : 'hover:bg-zinc-700'}" on:click={() => activeTab = 'moderation'}>Moderation</button>
            <button class="w-full text-left px-3 py-2 rounded {activeTab === 'privacy' ? 'bg-indigo-600' : 'hover:bg-zinc-700'}" on:click={() => activeTab = 'privacy'}>Privacy</button>
            <button class="w-full text-left px-3 py-2 rounded {activeTab === 'roles' ? 'bg-indigo-600' : 'hover:bg-zinc-700'}" on:click={() => activeTab = 'roles'}>Roles</button>
            <button class="w-full text-left px-3 py-2 rounded {activeTab === 'user_management' ? 'bg-indigo-600' : 'hover:bg-zinc-700'}" on:click={() => activeTab = 'user_management'}>User Management</button>
            <div class="border-t border-zinc-700 my-2"></div>
            <button class="w-full text-left px-3 py-2 rounded text-red-400 hover:bg-red-600 hover:text-white {activeTab === 'delete' ? 'bg-red-600 text-white' : ''}" on:click={() => activeTab = 'delete'}>Delete Server</button>
          </nav>
        </div>
        <div class="mt-auto">
            <button class="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded" on:click={close}>
                Close
            </button>
        </div>
      </aside>

      <main class="flex-1 p-8 overflow-y-auto">
        {#if activeTab === 'overview'}
          <Overview {server} onUpdateServer={onUpdateServer} />
        {:else if activeTab === 'moderation'}
          <Moderation {server} onUpdateServer={onUpdateServer} />
        {:else if activeTab === 'privacy'}
          <Privacy {server} onUpdateServer={onUpdateServer} />
        {:else if activeTab === 'roles'}
          <Roles {server} />
        {:else if activeTab === 'user_management'}
          <UserManagement {server} />
        {:else if activeTab === 'delete'}
          <DeleteServer {server} onDeleteServer={onDeleteServer} on:close={close} />
        {/if}
      </main>
    </div>
  </div>
{/if}
