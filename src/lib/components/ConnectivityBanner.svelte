<svelte:options runes={true} />

<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Alert } from "$lib/components/ui/alert/alert.svelte";
  import AlertDescription from "$lib/components/ui/alert/alert-description.svelte";
  import { toasts } from "$lib/stores/ToastStore";
  import { updateAppSetting } from "$lib/features/settings/stores/settings";
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
    const meshPart = `Mesh peers: ${state.meshPeers}`;
    const totalPart = `Total peers: ${state.totalPeers}`;
    return `${meshPart} • ${totalPart}`;
  });

  const bridgeMessage = $derived(() =>
    state.bridgeSuggested
      ? "Nearby devices are requesting an uplink."
      : null,
  );

  function enableBridgeMode() {
    updateAppSetting("enableBridgeMode", true);
    toasts.addToast("Bridge Mode enabled. Nearby peers can route through you.", "success");
  }

  function openMeshExplorer() {
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    goto("/mesh");
  }
</script>

<div class="flex flex-col gap-2 border-b border-border/60 bg-background/80 px-4 py-3">
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
        <span class="text-xs text-amber-500">{bridgeMessage()}</span>
      {/if}
      {#if showBridgePrompt}
        <Button size="sm" variant="outline" onclick={enableBridgeMode}>
          Enable Bridge Mode
        </Button>
      {/if}
    </div>
  </div>
  <p class="text-sm text-foreground">{statusMessage}</p>
</div>
{#if fallbackMessage}
  <Alert class="mx-4 mb-2 mt-2 border-amber-500/40 bg-amber-500/10 text-amber-600">
    <AlertTriangle class="size-4" />
    <AlertDescription class="text-sm">{fallbackMessage}</AlertDescription>
  </Alert>
{/if}
