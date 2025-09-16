<script lang="ts">
  import type { Server } from '$lib/models/Server';

  type Props = {
    server: Server;
    ondeleteServer?: (server: Server) => void;
  };

  let { server, ondeleteServer }: Props = $props();

  function handleDelete() {
    if (
      confirm(`Are you sure you want to delete the server "${server.name}"? This action cannot be undone.`)
    ) {
      ondeleteServer?.(server);
    }
  }
</script>

<h2 class="text-left text-[12px] font-bold px-[10px] py-[6px] uppercase">Delete Server</h2>
<div class="bg-card p-4 rounded-lg">
  <p class="text-gray-300 mb-4">This is a permanent action. Once you delete the server, it cannot be recovered.</p>
  <button class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded" onclick={handleDelete}>
    Delete Server
  </button>
</div>
