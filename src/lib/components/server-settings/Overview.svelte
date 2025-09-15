<script lang="ts">
  import type { Server } from '$lib/models/Server';

  export let server: Server;
  export let onUpdateServer: (server: Server) => void;

  let serverName = server.name;
  let serverDescription = server.description || '';

  function saveChanges() {
    onUpdateServer({ ...server, name: serverName, description: serverDescription });
  }
</script>

<h2 class="text-left text-[12px] font-bold px-[10px] py-[6px] uppercase">Overview</h2>

<div class="space-y-6">
  <div>
    <label for="serverName" class="block text-sm font-medium text-gray-300">Server Name</label>
    <input
      type="text"
      id="serverName"
      bind:value={serverName}
      class="mt-1 block w-full rounded-md bg-zinc-700 border-transparent text-white focus:border-indigo-500 focus:ring-indigo-500"
    />
  </div>
  <div>
    <label for="serverDescription" class="block text-sm font-medium text-gray-300">Server Description</label>
    <textarea
      id="serverDescription"
      bind:value={serverDescription}
      rows="3"
      class="mt-1 block w-full rounded-md bg-zinc-700 border-transparent text-white focus:border-indigo-500 focus:ring-indigo-500"
    ></textarea>
  </div>
  <button class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded" onclick={saveChanges}>
    Save Changes
  </button>
</div>
