<script lang="ts">
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Input } from "$lib/components/ui/input/index.js";

  let proxyEnabled = $state(false);
  let proxyUrl = $state("");
</script>

<h1 class="text-2xl font-semibold text-zinc-50">Network Settings</h1>

<div class="space-y-6">
  <div
    class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="mr-4">
      <Label for="enable-proxy" class="text-sm font-medium text-zinc-200">
        Enable proxy
      </Label>
      <p class="text-xs text-muted-foreground">
        Route traffic through a custom proxy service.
      </p>
    </div>
    <Switch
      id="enable-proxy"
      class="shrink-0"
      bind:checked={proxyEnabled}
      aria-label="Enable proxy"
    />
  </div>

  <div class="space-y-2 max-w-md">
    <Label for="proxy-url" class="text-sm font-medium text-zinc-200">
      Proxy URL
    </Label>
    <Input
      id="proxy-url"
      type="text"
      placeholder="https://proxy.example.com"
      bind:value={proxyUrl}
      disabled={!proxyEnabled}
    />
  </div>
</div>
