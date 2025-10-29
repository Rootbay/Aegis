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

  let enableReadReceipts = $state(false);

  $effect(() => {
    const stored = server?.settings?.enableReadReceipts;
    const normalized = stored === true;
    if (enableReadReceipts !== normalized) {
      enableReadReceipts = normalized;
    }
  });

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
      <p id="read-receipts-description" class="text-sm text-gray-400">
        If enabled, members can see if their messages have been read. This is
        reciprocal.
      </p>
    </div>
    <div class="flex items-center gap-2">
      <Label class="sr-only" for="read-receipts">Enable Read Receipts</Label>
      <Switch
        id="read-receipts"
        aria-describedby="read-receipts-description"
        bind:checked={enableReadReceipts}
      />
    </div>
  </div>

  <Button class="font-semibold" onclick={saveChanges}>Save Changes</Button>
</div>
