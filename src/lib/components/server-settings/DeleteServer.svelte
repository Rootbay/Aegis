<script lang="ts">
  import type { Server } from '$lib/models/Server';

  export let server: Server;
  export let onDeleteServer: (server: Server) => void;

  function deleteServer() {
    if (confirm(`Are you sure you want to delete the server "${server.name}"? This action cannot be undone.`)) {
      onDeleteServer(server);
    }
  }
</script>

<h2 class="text-left text-[12px] font-bold px-[10px] py-[6px] uppercase">Delete Server</h2>

<div class="bg-card p-4 rounded-lg">
  <p class="text-gray-300 mb-4">This is a permanent action. Once you delete the server, it cannot be recovered.</p>
  <button class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded" on:click={deleteServer}>
    Delete Server
  </button>
</div>
