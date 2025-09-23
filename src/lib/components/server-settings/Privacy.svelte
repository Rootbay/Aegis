<script lang="ts">
  import type { Server } from "$lib/features/servers/models/Server";

  type UnaryHandler<T> = (value: T) => void; // eslint-disable-line no-unused-vars

  type Props = {
    server: Server;
    onupdateServer?: UnaryHandler<Server>;
  };

  let { server, onupdateServer }: Props = $props();

  let enableReadReceipts = $state(false);

  function saveChanges() {
    const settings = {
      enableReadReceipts,
    };
    onupdateServer?.({ ...server, settings });
  }
</script>

<h2 class="text-left text-[12px] font-bold px-[10px] py-[6px] uppercase">
  Privacy Settings
</h2>
<div class="space-y-6">
  <div class="flex items-center justify-between p-4 bg-card rounded-lg">
    <div>
      <h3 class="font-medium">Enable Read Receipts</h3>
      <p class="text-sm text-gray-400">
        If enabled, members can see if their messages have been read. This is
        reciprocal.
      </p>
    </div>
    <input
      type="checkbox"
      bind:checked={enableReadReceipts}
      class="form-checkbox h-5 w-5 text-indigo-600"
    />
  </div>

  <button
    class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded"
    onclick={saveChanges}
  >
    Save Changes
  </button>
</div>
