<svelte:options runes={true} />

<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Alert } from "$lib/components/ui/alert/alert.svelte";
  import AlertDescription from "$lib/components/ui/alert/alert-description.svelte";
  import { toasts } from "$lib/stores/ToastStore";
  import { setEnableBridgeMode } from "$lib/features/settings/stores/settings";
  import type { ConnectivityState } from "$lib/stores/connectivityStore";
  import { AlertTriangle, RadioTower, Wifi, WifiOff } from "@lucide/svelte";
  import { goto } from "$app/navigation";

  let {
    state,
    statusMessage,
    fallbackMessage,
    showBridgePrompt = false,
  } = $props<{
    state: ConnectivityState;
    statusMessage: string;
    fallbackMessage: string | null;
    showBridgePrompt?: boolean;
  }>();

  let enablingBridge = $state(false);
  let lastGatewayError = $state<string | null>(null);

  const gatewayStatus = $derived(() => state.gatewayStatus);

  const statusLabel = $derived(() => {
    switch (state.status) {
      case "online":
        return "Online";
      case "mesh-only":
        return "Mesh Only";
      case "offline":
        return "Offline";
      default:
        return "Connecting";
    }
  });

  const statusVariant = $derived(() => {
    switch (state.status) {
      case "online":
        return "default" as const;
      case "mesh-only":
        return "secondary" as const;
      case "offline":
        return "destructive" as const;
      default:
        return "outline" as const;
    }
  });

  const StatusIcon = $derived(() => {
    switch (state.status) {
      case "online":
        return Wifi;
      case "mesh-only":
        return RadioTower;
      case "offline":
        return WifiOff;
      default:
        return RadioTower;
    }
  });

  const meshSummary = $derived(() => {
    const parts = [
      `Mesh peers: ${state.meshPeers}`,
      `Total peers: ${state.totalPeers}`,
    ];
    if (state.activeRelayCount > 0) {
      parts.push(`Relays: ${state.activeRelayCount}`);
    }
    if (state.bestRouteQuality !== null) {
      parts.push(`Best route ${Math.round(state.bestRouteQuality * 100)}%`);
    }
    if (state.averageSuccessRate !== null) {
      parts.push(
        `Avg reliability ${Math.round(state.averageSuccessRate * 100)}%`,
      );
    }
    return parts.join(" • ");
  });

  const bridgeTone = $derived(() => {
    if (gatewayStatus().forwarding) {
      return "success" as const;
    }
    if (gatewayStatus().bridgeModeEnabled) {
      return gatewayStatus().lastError
        ? ("warning" as const)
        : ("info" as const);
    }
    if (state.bridgeSuggested) {
      return "warning" as const;
    }
    return null;
  });

  const bridgeMessage = $derived(() => {
    const tone = bridgeTone();
    const status = gatewayStatus();

    switch (tone) {
      case "success": {
        const peers = status.upstreamPeers;
        const label = peers === 1 ? "uplink" : "uplinks";
        return `Bridge Mode forwarding to ${peers} ${label}.`;
      }
      case "warning":
        if (status.bridgeModeEnabled && status.lastError) {
          return `Bridge Mode reconnecting: ${status.lastError}`;
        }
        return "Nearby devices are requesting an uplink.";
      case "info":
        if (status.bridgeModeEnabled) {
          return "Bridge Mode enabled. Establishing uplink…";
        }
        return null;
      default:
        return null;
    }
  });

  $effect(() => {
    const status = gatewayStatus();
    const error = status.lastError;
    if (status.bridgeModeEnabled && !status.forwarding && error) {
      if (error !== lastGatewayError) {
        toasts.addToast(`Bridge forwarding issue: ${error}`, "warning");
        lastGatewayError = error;
      }
    } else if (!error) {
      lastGatewayError = null;
    }
  });

  async function enableBridgeMode() {
    if (enablingBridge) {
      return;
    }
    enablingBridge = true;
    try {
      const status = await setEnableBridgeMode(true);
      if (status?.forwarding) {
        toasts.addToast(
          "Bridge Mode active. Traffic is now routed upstream.",
          "success",
        );
      } else if (status?.lastError) {
        toasts.addToast(
          `Bridge Mode enabled but encountered an uplink issue: ${status.lastError}`,
          "warning",
        );
      } else {
        toasts.addToast(
          "Bridge Mode enabled. Waiting for uplink peers…",
          "info",
        );
      }
    } catch (error) {
      console.error("Failed to enable Bridge Mode", error);
      toasts.addToast(
        "Failed to enable Bridge Mode. Check network settings for details.",
        "error",
      );
    } finally {
      enablingBridge = false;
    }
  }

  function openMeshExplorer() {
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    goto("/mesh");
  }
</script>

<div
  class="flex flex-col gap-2 border-b border-border/60 bg-background/80 px-4 py-3"
>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <Badge variant={statusVariant()} class="flex items-center gap-1">
        <svelte:component this={StatusIcon()} class="size-3" />
        {statusLabel()}
      </Badge>
      <span class="text-muted-foreground">{meshSummary()}</span>
      <Button
        size="sm"
        variant="ghost"
        class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        onclick={openMeshExplorer}
      >
        Open Mesh Explorer
      </Button>
    </div>
    <div class="flex items-center gap-2">
      {#if bridgeMessage()}
        <span
          class="text-xs"
          class:text-emerald-500={bridgeTone() === "success"}
          class:text-amber-500={bridgeTone() === "warning"}
          class:text-muted-foreground={bridgeTone() === "info"}
        >
          {bridgeMessage()}
        </span>
      {/if}
      {#if showBridgePrompt && !gatewayStatus().bridgeModeEnabled}
        <Button
          size="sm"
          variant="outline"
          onclick={enableBridgeMode}
          disabled={enablingBridge}
        >
          Enable Bridge Mode
        </Button>
      {/if}
    </div>
  </div>
  <p class="text-sm text-foreground">{statusMessage}</p>
</div>
{#if fallbackMessage}
  <Alert
    class="mx-4 mb-2 mt-2 border-amber-500/40 bg-amber-500/10 text-amber-600"
  >
    <AlertTriangle class="size-4" />
    <AlertDescription class="text-sm">{fallbackMessage}</AlertDescription>
  </Alert>
{/if}
