<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import type { Server } from "$lib/features/servers/models/Server";

  type UnaryHandler<T> = (value: T) => void; // eslint-disable-line no-unused-vars

  type Props = {
    server: Server;
    onupdateServer?: UnaryHandler<Server>;
  };

  let { server, onupdateServer }: Props = $props();

  let serverName = $state(server.name);
  let serverDescription = $state(server.description || "");

  function saveChanges() {
    onupdateServer?.({
      ...server,
      name: serverName,
      description: serverDescription,
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
      <Label for="serverName" class="text-sm font-medium text-zinc-300">
        Server Name
      </Label>
      <Input
        id="serverName"
        bind:value={serverName}
        class="bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500 focus-visible:border-indigo-500 focus-visible:ring-indigo-500"
        placeholder="Enter a server name"
      />
    </div>

    <div class="space-y-2">
      <Label
        for="serverDescription"
        class="text-sm font-medium text-zinc-300"
      >
        Server Description
      </Label>
      <Textarea
        id="serverDescription"
        bind:value={serverDescription}
        class="bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500 focus-visible:border-indigo-500 focus-visible:ring-indigo-500"
        placeholder="Write a short description for your server"
      />
    </div>

    <div class="pt-4 flex justify-end">
      <Button class="px-5 py-2.5" onclick={saveChanges}>
        Save Changes
      </Button>
    </div>
  </div>
</section>
