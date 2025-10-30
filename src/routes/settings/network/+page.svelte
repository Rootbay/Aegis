<script lang="ts">
  import { get } from "svelte/store";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { toasts } from "$lib/stores/ToastStore";
  import { connectivityStore } from "$lib/stores/connectivityStore";
  import {
    settings,
    setEnableCrossDeviceSync,
    setPreferWifiDirect,
    setEnableBridgeMode,
    setEnableIntelligentMeshRouting,
    setResilientFileTransferEnabled,
  } from "$lib/features/settings/stores/settings";

  let enableCrossDeviceSync = $state(get(settings).enableCrossDeviceSync);
  let preferWifiDirect = $state(get(settings).preferWifiDirect);
  let enableBridgeMode = $state(get(settings).enableBridgeMode);
  let enableIntelligentMeshRouting = $state(
    get(settings).enableIntelligentMeshRouting,
  );
  let enableResilientTransfers = $state(
    get(settings).enableResilientFileTransfer,
  );
  let currentGatewayStatus = $state(get(connectivityStore).gatewayStatus);
  let bridgeSuggested = $state(get(connectivityStore).bridgeSuggested);
  let togglingBridge = $state(false);

  $effect(() => {
    const unsubscribe = settings.subscribe((value) => {
      enableCrossDeviceSync = value.enableCrossDeviceSync;
      preferWifiDirect = value.preferWifiDirect;
      enableBridgeMode = value.enableBridgeMode;
      enableIntelligentMeshRouting = value.enableIntelligentMeshRouting;
      enableResilientTransfers = value.enableResilientFileTransfer;
    });

    return () => unsubscribe();
  });

  $effect(() => {
    const current = get(settings);

    if (current.enableCrossDeviceSync !== enableCrossDeviceSync) {
      setEnableCrossDeviceSync(enableCrossDeviceSync);
    }

    if (current.preferWifiDirect !== preferWifiDirect) {
      void setPreferWifiDirect(preferWifiDirect);
    }

    if (current.enableIntelligentMeshRouting !== enableIntelligentMeshRouting) {
      void setEnableIntelligentMeshRouting(enableIntelligentMeshRouting);
    }

    if (current.enableResilientFileTransfer !== enableResilientTransfers) {
      setResilientFileTransferEnabled(enableResilientTransfers);
    }
  });

  $effect(() => {
    const unsubscribe = connectivityStore.subscribe((value) => {
      currentGatewayStatus = value.gatewayStatus;
      bridgeSuggested = value.bridgeSuggested;
    });

    return () => unsubscribe();
  });

  const bridgeStatusTone = $derived(() => {
    if (currentGatewayStatus.forwarding) {
      return "success" as const;
    }
    if (currentGatewayStatus.bridgeModeEnabled) {
      return currentGatewayStatus.lastError
        ? ("warning" as const)
        : ("info" as const);
    }
    if (bridgeSuggested) {
      return "warning" as const;
    }
    return "info" as const;
  });

  const bridgeStatusDescription = $derived(() => {
    if (currentGatewayStatus.forwarding) {
      const peers = currentGatewayStatus.upstreamPeers;
      const label = peers === 1 ? "uplink" : "uplinks";
      return `Forwarding traffic to ${peers} ${label}.`;
    }

    if (currentGatewayStatus.bridgeModeEnabled) {
      return currentGatewayStatus.lastError
        ? `Enabled, reconnecting (${currentGatewayStatus.lastError}).`
        : "Enabled. Searching for uplink peers…";
    }

    return bridgeSuggested
      ? "Disabled. Nearby peers are requesting an uplink."
      : "Allow this device to bridge isolated mesh clusters together.";
  });

  const bridgeLastDial = $derived(() => {
    const attempt = currentGatewayStatus.lastDialAttempt;
    if (!attempt) {
      return null;
    }
    const date = new Date(attempt);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toLocaleString();
  });

  async function handleBridgeModeChange() {
    if (togglingBridge) {
      return;
    }
    togglingBridge = true;
    const desired = enableBridgeMode;
    try {
      const status = await setEnableBridgeMode(desired);
      if (status) {
        enableBridgeMode = status.bridgeModeEnabled;
        if (status.lastError && !status.forwarding) {
          toasts.addToast(
            `Bridge Mode enabled but encountered an uplink issue: ${status.lastError}`,
            "warning",
          );
        }
      }
    } catch (error) {
      console.error("Failed to update Bridge Mode", error);
      enableBridgeMode = get(settings).enableBridgeMode;
      toasts.addToast(
        "Failed to update Bridge Mode. Please try again.",
        "error",
      );
    } finally {
      togglingBridge = false;
    }
  }
</script>

<h1 class="text-2xl font-semibold text-zinc-50">Network Settings</h1>

<div class="space-y-6">
  <section
    class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="mr-4">
      <Label
        for="enable-cross-device-sync"
        class="text-sm font-medium text-zinc-200"
      >
        Enable cross-device sync
      </Label>
      <p class="text-xs text-muted-foreground">
        Seamlessly keep messages and preferences aligned across devices.
      </p>
    </div>
    <Switch
      id="enable-cross-device-sync"
      class="shrink-0"
      bind:checked={enableCrossDeviceSync}
      aria-label="Toggle cross-device sync"
    />
  </section>

  <section
    class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="mr-4">
      <Label for="prefer-wifi-direct" class="text-sm font-medium text-zinc-200">
        Prefer Wi-Fi Direct
      </Label>
      <p class="text-xs text-muted-foreground">
        Establish faster peer-to-peer links when available.
      </p>
    </div>
    <Switch
      id="prefer-wifi-direct"
      class="shrink-0"
      bind:checked={preferWifiDirect}
      aria-label="Toggle Wi-Fi Direct preference"
    />
  </section>

  <section
    class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="mr-4">
      <Label for="enable-bridge-mode" class="text-sm font-medium text-zinc-200">
        Enable bridge mode
      </Label>
      <p
        class="text-xs"
        class:text-emerald-500={bridgeStatusTone() === "success"}
        class:text-amber-500={bridgeStatusTone() === "warning"}
        class:text-muted-foreground={bridgeStatusTone() === "info"}
      >
        {bridgeStatusDescription()}
      </p>
      {#if currentGatewayStatus.lastError && currentGatewayStatus.bridgeModeEnabled}
        <p class="text-xs text-amber-500">
          Last error: {currentGatewayStatus.lastError}
        </p>
      {/if}
      {#if bridgeLastDial()}
        <p class="text-xs text-muted-foreground">
          Last dial attempt: {bridgeLastDial()}
        </p>
      {/if}
    </div>
    <Switch
      id="enable-bridge-mode"
      class="shrink-0"
      bind:checked={enableBridgeMode}
      aria-label="Toggle bridge mode"
      disabled={togglingBridge}
      on:change={handleBridgeModeChange}
    />
  </section>

  <section
    class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="mr-4">
      <Label
        for="enable-intelligent-routing"
        class="text-sm font-medium text-zinc-200"
      >
        Enable intelligent mesh routing
      </Label>
      <p class="text-xs text-muted-foreground">
        Dynamically optimize paths based on signal strength and latency.
      </p>
    </div>
    <Switch
      id="enable-intelligent-routing"
      class="shrink-0"
      bind:checked={enableIntelligentMeshRouting}
      aria-label="Toggle intelligent mesh routing"
    />
  </section>

  <section
    class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="mr-4">
      <Label
        for="enable-resilient-transfer"
        class="text-sm font-medium text-zinc-200"
      >
        Resilient file transfer
      </Label>
      <p class="text-xs text-muted-foreground">
        Maintain transfers across intermittent connections with auto-resume.
      </p>
    </div>
    <Switch
      id="enable-resilient-transfer"
      class="shrink-0"
      bind:checked={enableResilientTransfers}
      aria-label="Toggle resilient file transfer"
    />
  </section>
</div>
