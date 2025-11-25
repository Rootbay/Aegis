<svelte:options runes={true} />

<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Alert, AlertDescription } from "$lib/components/ui/alert/index.js";
  import { toasts } from "$lib/stores/ToastStore";
  import { setEnableBridgeMode } from "$lib/features/settings/stores/settings";
  import type {
    ConnectivityState,
    ConnectivityStatus,
  } from "$lib/stores/connectivityStore";
  import { TriangleAlert, RadioTower, Wifi, WifiOff } from "@lucide/svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";

  let {
    state: connectivityState,
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

  const gatewayStatus = $derived(() => connectivityState.gatewayStatus);

  type StatusMeta = {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: typeof Wifi | typeof RadioTower | typeof WifiOff;
  };

  const STATUS_META: Record<ConnectivityStatus, StatusMeta> = {
    online: { label: "Online", variant: "default", icon: Wifi },
    "mesh-only": {
      label: "Mesh Only",
      variant: "secondary",
      icon: RadioTower,
    },
    offline: { label: "Offline", variant: "destructive", icon: WifiOff },
    initializing: { label: "Connecting", variant: "outline", icon: RadioTower },
  };

  const statusInfo = $derived(() => {
    const status = connectivityState.status as ConnectivityStatus;
    return STATUS_META[status] ?? STATUS_META.initializing;
  });

  const meshSummary = $derived(() => {
    const parts = [
      `Mesh peers: ${connectivityState.meshPeers}`,
      `Total peers: ${connectivityState.totalPeers}`,
    ];
    if (connectivityState.activeRelayCount > 0) {
      parts.push(`Relays: ${connectivityState.activeRelayCount}`);
    }
    if (connectivityState.bestRouteQuality !== null) {
      parts.push(
        `Best route ${Math.round(connectivityState.bestRouteQuality * 100)}%`,
      );
    }
    if (connectivityState.averageSuccessRate !== null) {
      parts.push(
        `Avg reliability ${Math.round(
          connectivityState.averageSuccessRate * 100,
        )}%`,
      );
    }
    return parts.join(" · ");
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
    if (connectivityState.bridgeSuggested) {
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
    const meshExplorerUrl = `${resolve("/settings/network")}#mesh-explorer` as Parameters<
      typeof goto
    >[0];
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    void goto(meshExplorerUrl);
  }
</script>

<div
  class="flex flex-col gap-2 border-b border-border/60 bg-background/80 px-4 py-3"
>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex flex-wrap items-center gap-3 text-sm">
      {#if statusInfo()}
        {@const { icon: StatusIcon, label, variant } = statusInfo()}
        <Badge variant={variant} class="flex items-center gap-1">
          <StatusIcon class="size-3" />
          {label}
        </Badge>
      {/if}
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
    <TriangleAlert class="size-4" />
    <AlertDescription class="text-sm">{fallbackMessage}</AlertDescription>
  </Alert>
{/if}
