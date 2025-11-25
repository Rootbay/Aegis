<svelte:options runes={true} />

<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
  } from "$lib/components/ui/tooltip";
  import type { ConnectivityBindings } from "$lib/layout/app/types";
  import { settings } from "$lib/features/settings/stores/settings";
  import { Bolt, RadioTower, Shield, Wifi, WifiOff } from "@lucide/svelte";

  let { connectivity }: { connectivity: ConnectivityBindings } = $props();

  type StatusMeta = {
    label: string;
    icon: typeof Wifi | typeof RadioTower | typeof WifiOff;
    tone: "default" | "secondary" | "destructive" | "outline";
    description: string;
  };

  const STATUS_META: Record<string, StatusMeta> = {
    online: {
      label: "Online",
      icon: Wifi,
      tone: "default",
      description: "Using internet relays for reachability.",
    },
    "mesh-only": {
      label: "Mesh only",
      icon: RadioTower,
      tone: "secondary",
      description: "Connected via nearby mesh peers.",
    },
    offline: {
      label: "Offline",
      icon: WifiOff,
      tone: "destructive",
      description: "No peers reachable yet.",
    },
    initializing: {
      label: "Connecting",
      icon: RadioTower,
      tone: "outline",
      description: "Negotiating transports…",
    },
  } satisfies Record<string, StatusMeta>;

  const connectivityState = connectivity.state;
  const connectivityStatusMessage = connectivity.statusMessage;

  const state = $derived(() => $connectivityState);
  const statusMessage = $derived(() => $connectivityStatusMessage);
  const statusMeta = $derived(() => {
    const current = state();
    return STATUS_META[current.status] ?? STATUS_META.initializing;
  });

  const meshSummary = $derived(() => {
    const current = state();
    const peersLabel = `${current.meshPeers} mesh / ${current.totalPeers} total peers`;
    const relayLabel =
      current.activeRelayCount > 0
        ? `${current.activeRelayCount} relay${current.activeRelayCount === 1 ? "" : "s"}`
        : null;
    return [peersLabel, relayLabel].filter(Boolean).join(" | ");
  });

  const bridgeBadge = $derived(() => {
    const current = state();
    if (current.gatewayStatus.forwarding) {
      const peers = current.gatewayStatus.upstreamPeers;
      const label = peers === 1 ? "uplink" : "uplinks";
      return `Bridge active (${peers} ${label})`;
    }
    if (current.gatewayStatus.bridgeModeEnabled) {
      return "Bridge enabled";
    }
    if (current.bridgeSuggested) {
      return "Bridge requested";
    }
    return null;
  });

  const presenceSharing = $derived(() => $settings.shareMeshPresence);
</script>

<TooltipProvider delayDuration={150}>
  <div class="flex flex-col gap-2 border-b border-border/60 bg-muted/40 px-4 py-2">
    <div class="flex flex-wrap items-center gap-2">
      {@const meta = statusMeta()}
      {@const StatusIcon = meta.icon}
      <Badge variant={meta.tone} class="flex items-center gap-1">
        <StatusIcon class="size-3" />
        {meta.label}
      </Badge>
      {#if bridgeBadge()}
        <Badge variant="secondary" class="flex items-center gap-1">
          <Bolt class="size-3" />
          {bridgeBadge()}
        </Badge>
      {/if}
      <Tooltip>
        <TooltipTrigger class="text-xs text-muted-foreground">{meshSummary()}</TooltipTrigger>
        <TooltipContent side="bottom">
          <p class="max-w-xs text-sm text-foreground">
            {meta.description}
          </p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger class="flex items-center gap-1 text-xs text-muted-foreground">
          <Shield class="size-3" />
          {presenceSharing() ? "Sharing presence" : "Presence hidden"}
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p class="max-w-xs text-sm text-foreground">
            {presenceSharing()
              ? "Peers can discover you faster on the mesh."
              : "Discovery is limited to save power and protect privacy."}
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
    <p class="text-xs text-muted-foreground">{statusMessage()}</p>
  </div>
</TooltipProvider>
