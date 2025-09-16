<script lang="ts">
  import type { Server } from '$lib/models/Server';

  type Props = {
    server: Server;
    onupdateServer?: (server: Server) => void;
  };

  let { server, onupdateServer }: Props = $props();

  let serverName = $state(server.name);
  let serverDescription = $state(server.description || '');

  function saveChanges() {
    onupdateServer?.({
      ...server,
      name: serverName,
      description: serverDescription
    });
  }
</script>

<section class="space-y-6">
  <header>
    <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
      Overview
    </h2>
    <p class="mt-1 text-sm text-zinc-500">
      Update your server’s basic details below.
    </p>
  </header>

  <div class="bg-zinc-800 rounded-2xl shadow p-6 space-y-5">
    <div class="space-y-2">
      <label for="serverName" class="block text-sm font-medium text-zinc-300">
        Server Name
      </label>
      <input
        type="text"
        id="serverName"
        bind:value={serverName}
        class="block w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white placeholder-zinc-500
               focus:border-indigo-500 focus:ring focus:ring-indigo-500 focus:ring-opacity-50"
        placeholder="Enter a server name"
      />
    </div>

    <div class="space-y-2">
      <label for="serverDescription" class="block text-sm font-medium text-zinc-300">
        Server Description
      </label>
      <textarea
        id="serverDescription"
        bind:value={serverDescription}
        rows="3"
        class="block w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white placeholder-zinc-500
               focus:border-indigo-500 focus:ring focus:ring-indigo-500 focus:ring-opacity-50 resize-none"
        placeholder="Write a short description for your server"
      ></textarea>
    </div>

    <div class="pt-4 flex justify-end">
      <button
        class="inline-flex items-center px-5 py-2.5 rounded-xl font-medium text-white bg-indigo-600 hover:bg-indigo-500 
               focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all"
        onclick={saveChanges}
      >
        Save Changes
      </button>
    </div>
  </div>
</section>
