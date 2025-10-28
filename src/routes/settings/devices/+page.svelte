<script lang="ts">
  import { get } from "svelte/store";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import {
    settings,
    type TrustedDevice,
    upsertTrustedDevice,
    revokeTrustedDevice,
    removeTrustedDevice,
  } from "$lib/features/settings/stores/settings";
  import { toasts } from "$lib/stores/ToastStore";

  let trustedDevices = $state<TrustedDevice[]>(get(settings).trustedDevices);
  let newDeviceName = $state("");
  let newDevicePlatform = $state("");

  $effect(() => {
    const unsubscribe = settings.subscribe((value) => {
      trustedDevices = value.trustedDevices;
    });

    return () => unsubscribe();
  });

  function createDeviceId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return `device-${crypto.randomUUID()}`;
    }
    return `device-${Math.random().toString(36).slice(2, 10)}`;
  }

  function registerDevice(event: Event) {
    event.preventDefault();
    const name = newDeviceName.trim();
    if (!name) {
      toasts.addToast("Device name is required.", "error");
      return;
    }
    const platform = newDevicePlatform.trim() || "Unknown";
    const device: TrustedDevice = {
      id: createDeviceId(),
      name,
      platform,
      lastSeen: new Date().toISOString(),
      active: true,
    };
    upsertTrustedDevice(device);
    toasts.addToast(`${name} registered as a trusted device.`, "success");
    newDeviceName = "";
    newDevicePlatform = "";
  }

  function disableDevice(device: TrustedDevice) {
    if (!device.active) return;
    revokeTrustedDevice(device.id);
    toasts.addToast(`${device.name} access revoked.`, "info");
  }

  function forgetDevice(device: TrustedDevice) {
    removeTrustedDevice(device.id);
    toasts.addToast(`${device.name} removed from trusted list.`, "info");
  }
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-semibold text-zinc-50">Trusted devices</h1>
    <p class="text-sm text-muted-foreground">
      Manage which hardware can unlock your encrypted profile without an extra
      challenge.
    </p>
  </div>

  <form
    class="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
    onsubmit={registerDevice}
  >
    <div class="grid gap-3 md:grid-cols-2">
      <div class="space-y-1">
        <Label class="text-sm font-medium text-zinc-200">Device name</Label>
        <Input
          placeholder="Raspberry Pi relay"
          bind:value={newDeviceName}
          required
          aria-label="Device name"
        />
      </div>
      <div class="space-y-1">
        <Label class="text-sm font-medium text-zinc-200">Platform</Label>
        <Input
          placeholder="Linux"
          bind:value={newDevicePlatform}
          aria-label="Device platform"
        />
      </div>
    </div>
    <Button type="submit">Authorize device</Button>
  </form>

  <section class="space-y-3">
    {#if trustedDevices.length === 0}
      <p class="text-sm text-muted-foreground">
        No trusted devices yet. Register one above to allow seamless sign-ins.
      </p>
    {:else}
      {#each trustedDevices as device (device.id)}
        <div
          class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
        >
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-lg font-semibold text-zinc-100">{device.name}</h2>
              <Badge variant={device.active ? "secondary" : "outline"}>
                {device.active ? "Trusted" : "Revoked"}
              </Badge>
            </div>
            <p class="text-xs text-muted-foreground">
              {device.platform} · Last seen {new Date(
                device.lastSeen,
              ).toLocaleString()}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onclick={() => disableDevice(device)}
              disabled={!device.active}
            >
              Revoke
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onclick={() => forgetDevice(device)}
            >
              Forget
            </Button>
          </div>
        </div>
      {/each}
    {/if}
  </section>
</div>
