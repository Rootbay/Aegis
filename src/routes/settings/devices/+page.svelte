<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";

  interface Device {
    id: string;
    name: string;
    type: string;
    status: string;
  }

  let devices = $state<Device[]>([
    { id: "1", name: "My Desktop PC", type: "Computer", status: "Connected" },
    { id: "2", name: "My Phone", type: "Mobile", status: "Connected" },
    { id: "3", name: "Another Device", type: "Tablet", status: "Disconnected" },
  ]);

  function disconnectDevice(deviceId: string) {
    devices = devices.map((device) =>
      device.id === deviceId ? { ...device, status: "Disconnected" } : device,
    );
    console.log(`Device ${deviceId} disconnected.`);
  }
</script>

<h2 class="text-2xl font-semibold text-zinc-50 mb-4">Devices Settings</h2>

<div class="space-y-4">
  {#each devices as device (device.id)}
    <div
      class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
    >
      <div>
        <h3 class="text-lg font-semibold text-zinc-100">{device.name}</h3>
        <p class="text-sm text-muted-foreground">
          {device.type} · Status: {device.status}
        </p>
      </div>
      {#if device.status === "Connected"}
        <Button
          variant="destructive"
          size="sm"
          on:click={() => disconnectDevice(device.id)}
        >
          Disconnect
        </Button>
      {:else}
        <Button variant="outline" size="sm" disabled>Disconnected</Button>
      {/if}
    </div>
  {/each}

  {#if devices.length === 0}
    <p class="text-sm text-muted-foreground">No devices found.</p>
  {/if}
</div>
