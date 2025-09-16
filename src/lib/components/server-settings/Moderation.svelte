<script lang="ts">
  import type { Server } from '$lib/models/Server';

  export let server: Server;

  export let onupdateServer: ((server: Server) => void) | undefined = undefined;

  let transparentEdits = false;
  let deletedMessageDisplay: 'ghost' | 'tombstone' = 'ghost';

  function saveChanges() {
    const settings = {
      transparentEdits,
      deletedMessageDisplay,
    };
    onupdateServer?.({ ...server, settings });
  }
</script>




<h2 class="text-left text-[12px] font-bold px-[10px] py-[6px] uppercase">Moderation Settings</h2>

<div class="space-y-6">
  <div class="flex items-center justify-between p-4 bg-card rounded-lg">
    <div>
        <h3 class="font-medium">Transparent Message Edits</h3>
        <p class="text-sm text-gray-400">Allows server admins to view the edit history of messages.</p>
    </div>
    <input type="checkbox" bind:checked={transparentEdits} class="form-checkbox h-5 w-5 text-indigo-600" />
  </div>

  <div>
    <h3 class="font-medium mb-2">Deleted Message Display</h3>
    <div class="bg-card p-4 rounded-lg space-y-2">
      <label class="flex items-center">
        <input type="radio" bind:group={deletedMessageDisplay} value="ghost" class="form-radio h-4 w-4 text-indigo-600" />
        <span class="ml-3">See nothing (The Ghost)</span>
      </label>
      <label class="flex items-center">
        <input type="radio" bind:group={deletedMessageDisplay} value="tombstone" class="form-radio h-4 w-4 text-indigo-600" />
        <span class="ml-3">See "message deleted" notice (The Tombstone)</span>
      </label>
    </div>
  </div>

  <button class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded" onclick={saveChanges}>
    Save Changes
  </button>
</div>






