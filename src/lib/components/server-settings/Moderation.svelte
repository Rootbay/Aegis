<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import type { Server } from "$lib/features/servers/models/Server";

  type UnaryHandler<T> = (value: T) => void; // eslint-disable-line no-unused-vars

  type Props = {
    server: Server;
    onupdateServer?: UnaryHandler<Server>;
  };

  let { server, onupdateServer }: Props = $props();

  let transparentEdits = $state(false);
  let deletedMessageDisplay = $state<"ghost" | "tombstone">("ghost");

  function saveChanges() {
    const settings = {
      transparentEdits,
      deletedMessageDisplay,
    };
    onupdateServer?.({ ...server, settings });
  }
</script>

<h2 class="text-left text-[12px] font-bold px-[10px] py-[6px] uppercase">
  Moderation Settings
</h2>
<div class="space-y-6">
  <div class="flex items-center justify-between p-4 bg-card rounded-lg">
    <div>
      <h3 class="font-medium">Transparent Message Edits</h3>
      <p id="transparent-edits-description" class="text-sm text-gray-400">
        Allows server admins to view the edit history of messages.
      </p>
    </div>
    <div class="flex items-center gap-2">
      <Label class="sr-only" for="transparent-edits">
        Transparent Message Edits
      </Label>
      <Switch
        id="transparent-edits"
        aria-describedby="transparent-edits-description"
        bind:checked={transparentEdits}
      />
    </div>
  </div>

  <div>
    <h3 class="font-medium mb-2">Deleted Message Display</h3>
    <div class="bg-card p-4 rounded-lg space-y-2">
      <label class="flex items-center">
        <input
          type="radio"
          bind:group={deletedMessageDisplay}
          value="ghost"
          class="form-radio h-4 w-4 text-indigo-600"
        />
        <span class="ml-3">See nothing (The Ghost)</span>
      </label>
      <label class="flex items-center">
        <input
          type="radio"
          bind:group={deletedMessageDisplay}
          value="tombstone"
          class="form-radio h-4 w-4 text-indigo-600"
        />
        <span class="ml-3">See "message deleted" notice (The Tombstone)</span>
      </label>
    </div>
  </div>

  <Button class="font-semibold" onclick={saveChanges}>Save Changes</Button>
</div>
