<script lang="ts">
  interface Device {
    id: string;
    name: string;
    type: string;
    status: string;
  }

  let devices: Device[] = [
    { id: '1', name: 'My Desktop PC', type: 'Computer', status: 'Connected' },
    { id: '2', name: 'My Phone', type: 'Mobile', status: 'Connected' },
    { id: '3', name: 'Another Device', type: 'Tablet', status: 'Disconnected' },
  ];

  function disconnectDevice(deviceId: string) {
    devices = devices.map(device =>
      device.id === deviceId ? { ...device, status: 'Disconnected' } : device
    );
    console.log(`Device ${deviceId} disconnected.`);
  }
</script>

<h2 class="text-xl font-bold mb-4">Devices Settings</h2>

<div class="space-y-4">
  {#each devices as device (device.id)}
    <div class="flex items-center justify-between p-4 bg-card rounded-md shadow">
      <div>
        <h3 class="text-lg font-semibold">{device.name}</h3>
        <p class="text-sm text-muted-foreground">{device.type} - Status: {device.status}</p>
      </div>
      {#if device.status === 'Connected'}
        <button class="btn btn-error btn-sm" onclick={() => disconnectDevice(device.id)}>
          Disconnect
        </button>
      {:else}
        <button class="btn btn-sm btn-disabled" disabled>
          Disconnected
        </button>
      {/if}
    </div>
  {/each}

  {#if devices.length === 0}
    <p class="text-muted-foreground">No devices found.</p>
  {/if}
</div>