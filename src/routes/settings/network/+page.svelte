<script lang="ts">
  import { get } from "svelte/store";
  import { onMount } from "svelte";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Slider } from "$lib/components/ui/slider/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge";
  import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
  } from "$lib/components/ui/tooltip";
  import { toasts } from "$lib/stores/ToastStore";
  import { connectivityStore } from "$lib/stores/connectivityStore";
  import { relayStore } from "$lib/features/settings/stores/relayStore";
  import {
    settings,
    setEnableCrossDeviceSync,
    setPreferWifiDirect,
    setEnableBridgeMode,
    setShareMeshPresence,
    setEnableIntelligentMeshRouting,
    setResilientFileTransferEnabled,
    setRoutingUpdateIntervalSeconds,
    setRoutingQualityThreshold,
    setRoutingMaxHops,
  } from "$lib/features/settings/stores/settings";
  import type {
    RelayConfig,
    RelayScope,
    RelayStatus,
  } from "$lib/features/settings/models/relay";
  import MeshExplorerPanel from "$lib/features/mesh/components/MeshExplorerPanel.svelte";
  import ConnectivityBanner from "$lib/components/ConnectivityBanner.svelte";
  import { Info } from "@lucide/svelte";

  let enableCrossDeviceSync = $state(get(settings).enableCrossDeviceSync);
  let preferWifiDirect = $state(get(settings).preferWifiDirect);
  let enableBridgeMode = $state(get(settings).enableBridgeMode);
  let shareMeshPresence = $state(get(settings).shareMeshPresence);
  let enableIntelligentMeshRouting = $state(
    get(settings).enableIntelligentMeshRouting,
  );
  let enableResilientTransfers = $state(
    get(settings).enableResilientFileTransfer,
  );
  let routingUpdateInterval = $state(
    get(settings).aerpRouteUpdateIntervalSeconds,
  );
  let routingQualityThreshold = $state(get(settings).aerpMinRouteQuality);
  let routingMaxHops = $state(get(settings).aerpMaxHops);
  let currentGatewayStatus = $state(get(connectivityStore).gatewayStatus);
  let bridgeSuggested = $state(get(connectivityStore).bridgeSuggested);
  let togglingBridge = $state(false);
  let togglingPresence = $state(false);
  let relayLabel = $state("");
  let relayUrls = $state("");
  let relayScope = $state<RelayScope>("global");
  let relayUsername = $state("");
  let relayCredential = $state("");
  let relayServerIds = $state("");
  let savingRelay = $state(false);
  let deletingRelay = $state<Record<string, boolean>>({});
  let refreshingRelay = $state<Record<string, boolean>>({});
  const relays = $derived(() => $relayStore.relays);
  const relayLoading = $derived(() => $relayStore.loading);

  const connectivityStatusMessageStore = connectivityStore.statusMessage;
  const connectivityFallbackMessageStore = connectivityStore.fallbackMessage;
  const showConnectivityBridgePrompt = $derived(
    !$settings.enableBridgeMode && $connectivityStore.bridgeSuggested,
  );

  onMount(() => {
    void relayStore.initialize();
  });

  const relayStatusVariant = (status: RelayStatus) => {
    switch (status) {
      case "healthy":
        return "default" as const;
      case "degraded":
        return "secondary" as const;
      case "offline":
        return "destructive" as const;
      default:
        return "outline" as const;
    }
  };

  const relayStatusLabel = (status: RelayStatus) => {
    switch (status) {
      case "healthy":
        return "Healthy";
      case "degraded":
        return "Degraded";
      case "offline":
        return "Offline";
      default:
        return "Unknown";
    }
  };

  const relayScopeLabel = (scope: RelayScope) =>
    scope === "global" ? "Global" : "Server-specific";

  const parseList = (value: string) =>
    value
      .split(/[\s,]+/)
      .map((segment) => segment.trim())
      .filter(Boolean);

  const formatTimestamp = (value: string | null | undefined) => {
    if (!value) {
      return "—";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "—";
    }
    return date.toLocaleString();
  };

  async function handleAddRelay() {
    if (savingRelay) {
      return;
    }
    const label = relayLabel.trim();
    const urls = parseList(relayUrls);

    if (!label || urls.length === 0) {
      toasts.addToast(
        "Relay label and at least one URL are required.",
        "warning",
      );
      return;
    }

    const config: RelayConfig = {
      id: "",
      label,
      urls,
      username: relayUsername.trim() || undefined,
      credential: relayCredential.trim() || undefined,
      scope: relayScope,
      serverIds: parseList(relayServerIds),
    };

    savingRelay = true;
    try {
      const record = await relayStore.registerRelay(config);
      if (record) {
        relayLabel = "";
        relayUrls = "";
        relayUsername = "";
        relayCredential = "";
        relayServerIds = "";
        relayScope = "global";
        toasts.addToast(`Relay "${record.config.label}" saved.`, "success");
      }
    } finally {
      savingRelay = false;
    }
  }

  async function handleRemoveRelay(relayId: string, label: string) {
    if (deletingRelay[relayId]) {
      return;
    }
    deletingRelay = { ...deletingRelay, [relayId]: true };
    try {
      const removed = await relayStore.removeRelay(relayId);
      if (removed) {
        toasts.addToast(`Removed relay "${label}".`, "info");
      }
    } finally {
      deletingRelay = { ...deletingRelay, [relayId]: false };
    }
  }

  async function handleRefreshRelay(relayId: string, status: RelayStatus) {
    if (refreshingRelay[relayId]) {
      return;
    }
    refreshingRelay = { ...refreshingRelay, [relayId]: true };
    try {
      await relayStore.updateRelayHealth({ relayId, status });
    } finally {
      refreshingRelay = { ...refreshingRelay, [relayId]: false };
    }
  }

  async function handleReloadRelays() {
    await relayStore.refresh();
  }

  $effect(() => {
    const unsubscribe = settings.subscribe((value) => {
      enableCrossDeviceSync = value.enableCrossDeviceSync;
      preferWifiDirect = value.preferWifiDirect;
      enableBridgeMode = value.enableBridgeMode;
      shareMeshPresence = value.shareMeshPresence;
      enableIntelligentMeshRouting = value.enableIntelligentMeshRouting;
      enableResilientTransfers = value.enableResilientFileTransfer;
      routingUpdateInterval = value.aerpRouteUpdateIntervalSeconds;
      routingQualityThreshold = value.aerpMinRouteQuality;
      routingMaxHops = value.aerpMaxHops;
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

    if (current.aerpRouteUpdateIntervalSeconds !== routingUpdateInterval) {
      void setRoutingUpdateIntervalSeconds(routingUpdateInterval);
    }

    if (
      Math.abs(current.aerpMinRouteQuality - routingQualityThreshold) >
      Number.EPSILON
    ) {
      void setRoutingQualityThreshold(routingQualityThreshold);
    }

    if (current.aerpMaxHops !== routingMaxHops) {
      void setRoutingMaxHops(routingMaxHops);
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

  const bridgeStatusLabel = $derived(() => {
    if (currentGatewayStatus.forwarding) {
      return "Bridge active";
    }
    if (currentGatewayStatus.bridgeModeEnabled) {
      return "Bridge enabled";
    }
    if (bridgeSuggested) {
      return "Bridge requested";
    }
    return "Bridge off";
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

  async function handlePresenceToggle() {
    if (togglingPresence) {
      return;
    }

    togglingPresence = true;
    const desired = shareMeshPresence;

    try {
      await setShareMeshPresence(desired);
      toasts.addToast(
        desired
          ? "Sharing mesh presence. Nearby peers can discover you faster."
          : "Mesh presence hidden. Discovery may slow, but power use drops.",
        desired ? "success" : "info",
      );
    } catch (error) {
      console.error("Failed to update mesh presence sharing", error);
      shareMeshPresence = get(settings).shareMeshPresence;
      toasts.addToast(
        "Couldn't update mesh presence sharing. Please try again.",
        "error",
      );
    } finally {
      togglingPresence = false;
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

  <TooltipProvider delayDuration={150}>
    <section
      class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
    >
      <div class="mr-4 space-y-1">
        <div class="flex items-center gap-2">
          <Label
            for="share-mesh-presence"
            class="text-sm font-medium text-zinc-200"
          >
            Share mesh presence
          </Label>
          <Tooltip>
            <TooltipTrigger class="text-muted-foreground">
              <Info class="size-4" />
            </TooltipTrigger>
            <TooltipContent side="top">
              <p class="max-w-xs text-xs">
                Sharing presence improves discovery for nearby peers but may
                reveal when you're nearby and use a bit more power.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <p class="text-xs text-muted-foreground">
          Advertise your availability to the mesh for faster handshakes.
        </p>
      </div>
      <Switch
        id="share-mesh-presence"
        class="shrink-0"
        bind:checked={shareMeshPresence}
        aria-label="Toggle mesh presence sharing"
        disabled={togglingPresence}
        onCheckedChange={() => {
          void handlePresenceToggle();
        }}
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
        onCheckedChange={() => {
          void setPreferWifiDirect(preferWifiDirect);
        }}
      />
    </section>
  </TooltipProvider>

  <section
    class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="mr-4 space-y-1">
      <div class="flex items-center gap-2">
        <Badge
          variant={bridgeStatusTone() === "info" ? "default" : bridgeStatusTone()}
          class="rounded-full px-3 py-1 text-xs uppercase tracking-wide"
        >
          {bridgeStatusLabel()}
        </Badge>
        {#if bridgeSuggested}
          <Badge variant="outline" class="rounded-full px-3 py-1 text-xs uppercase">
            Requested by peers
          </Badge>
        {/if}
        <Tooltip>
          <TooltipTrigger class="text-muted-foreground">
            <Info class="size-4" />
          </TooltipTrigger>
          <TooltipContent side="top">
            <p class="max-w-xs text-xs">
              Bridging improves connectivity for isolated nodes but consumes more
              battery and may expose traffic metadata to your uplink.
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
      <p class="text-sm text-zinc-200">
        {#if currentGatewayStatus.forwarding}
          Acting as a bridge to the internet.
        {:else}
          Bridge mode
        {/if}
      </p>
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
      onCheckedChange={() => {
        void handleBridgeModeChange();
      }}
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

  <section
    class="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200">
          Route update cadence
        </Label>
        <p class="text-xs text-muted-foreground">
          Control how frequently AERP refreshes path scores.
        </p>
      </div>
      <span class="text-xs text-muted-foreground">{routingUpdateInterval}s</span
      >
    </div>
    <Slider
      type="single"
      min={2}
      max={60}
      step={1}
      bind:value={routingUpdateInterval}
      aria-label="Route update interval in seconds"
    />
  </section>

  <section
    class="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200">
          Minimum route quality
        </Label>
        <p class="text-xs text-muted-foreground">
          Paths below this reliability threshold will be ignored.
        </p>
      </div>
      <span class="text-xs text-muted-foreground">
        {Math.round(routingQualityThreshold * 100)}%
      </span>
    </div>
    <Slider
      type="single"
      min={0}
      max={1}
      step={0.05}
      bind:value={routingQualityThreshold}
      aria-label="Minimum acceptable route quality"
    />
  </section>

  <section
    class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="mr-4">
      <Label class="text-sm font-medium text-zinc-200" for="routing-max-hops">
        Maximum hops per route
      </Label>
      <p class="text-xs text-muted-foreground">
        Limit how far messages can travel across the mesh.
      </p>
    </div>
    <Input
      id="routing-max-hops"
      type="number"
      min={1}
      max={16}
      bind:value={routingMaxHops}
      aria-label="Maximum route hops"
      class="w-20"
    />
  </section>

  <section
    class="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6"
  >
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold text-zinc-100">Relay endpoints</h2>
        <p class="text-sm text-muted-foreground">
          Register mesh relays to provide connectivity for remote peers.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        class="gap-2"
        onclick={handleReloadRelays}
        disabled={relayLoading()}
        aria-label="Refresh relay list"
      >
        {relayLoading() ? "Refreshing…" : "Refresh"}
      </Button>
    </div>

    {#if relayLoading() && relays().length === 0}
      <div
        class="rounded-lg border border-dashed border-zinc-700/60 bg-zinc-900/70 px-4 py-8 text-sm text-muted-foreground"
      >
        Loading relay configuration…
      </div>
    {:else if relays().length === 0}
      <div
        class="rounded-lg border border-dashed border-zinc-700/60 bg-zinc-900/70 px-4 py-8 text-sm text-muted-foreground"
      >
        No relays configured yet. Add at least one to guarantee connectivity for
        peers behind strict NATs.
      </div>
    {:else}
      <div class="space-y-4">
        {#each relays() as relay (relay.config.id)}
          <div class="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-foreground">
                  {relay.config.label}
                </p>
                <p class="text-xs text-muted-foreground wrap-break-word">
                  {relay.config.urls.join(", ")}
                </p>
              </div>
              <Badge variant={relayStatusVariant(relay.health.status)}>
                {relayStatusLabel(relay.health.status)}
              </Badge>
            </div>
            <dl
              class="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3"
            >
              <div>
                <dt class="font-medium text-foreground">Scope</dt>
                <dd>{relayScopeLabel(relay.config.scope)}</dd>
              </div>
              <div>
                <dt class="font-medium text-foreground">Last health check</dt>
                <dd>{formatTimestamp(relay.health.lastCheckedAt)}</dd>
              </div>
              <div>
                <dt class="font-medium text-foreground">Latency</dt>
                <dd>
                  {relay.health.latencyMs !== null
                    ? `${relay.health.latencyMs} ms`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt class="font-medium text-foreground">Uptime</dt>
                <dd>
                  {relay.health.uptimePercent !== null
                    ? `${relay.health.uptimePercent.toFixed(1)}%`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt class="font-medium text-foreground">Servers</dt>
                <dd>
                  {relay.config.serverIds.length > 0
                    ? relay.config.serverIds.join(", ")
                    : "Global"}
                </dd>
              </div>
              <div>
                <dt class="font-medium text-foreground">Credentials</dt>
                <dd>
                  {relay.config.username
                    ? `Username: ${relay.config.username}`
                    : "None"}
                </dd>
              </div>
            </dl>
            {#if relay.health.error}
              <p class="mt-3 text-xs text-rose-400">
                {relay.health.error}
              </p>
            {/if}
            <div class="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                class="gap-1"
                onclick={() =>
                  handleRefreshRelay(relay.config.id, relay.health.status)}
                disabled={refreshingRelay[relay.config.id]}
              >
                {refreshingRelay[relay.config.id]
                  ? "Updating…"
                  : "Refresh health"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                class="gap-1"
                onclick={() =>
                  handleRemoveRelay(relay.config.id, relay.config.label)}
                disabled={deletingRelay[relay.config.id]}
              >
                {deletingRelay[relay.config.id] ? "Removing…" : "Remove"}
              </Button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <div class="border-t border-zinc-800 pt-6">
      <h3 class="text-base font-semibold text-zinc-100">Register new relay</h3>
      <p class="mt-1 text-xs text-muted-foreground">
        Separate multiple URLs or server IDs with commas or spaces.
      </p>
      <form
        class="mt-4 grid gap-4 sm:grid-cols-2"
        onsubmit={handleAddRelay}
      >
        <div class="sm:col-span-1">
          <Label
            for="relay-label"
            class="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Label
          </Label>
          <Input
            id="relay-label"
            placeholder="Campus relay"
            bind:value={relayLabel}
            required
          />
        </div>
        <div class="sm:col-span-1">
          <Label
            for="relay-scope"
            class="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Scope
          </Label>
          <select
            id="relay-scope"
            bind:value={relayScope}
            class="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/60"
          >
            <option value="global">Global</option>
            <option value="server">Server-specific</option>
          </select>
        </div>
        <div class="sm:col-span-2">
          <Label
            for="relay-urls"
            class="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Relay URLs
          </Label>
          <Input
            id="relay-urls"
            placeholder="turn:relay.example.com:3478 turn:backup.example.com:3478"
            bind:value={relayUrls}
            required
          />
        </div>
        <div>
          <Label
            for="relay-username"
            class="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Username (optional)
          </Label>
          <Input
            id="relay-username"
            placeholder="relay-user"
            bind:value={relayUsername}
          />
        </div>
        <div>
          <Label
            for="relay-credential"
            class="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Credential (optional)
          </Label>
          <Input
            id="relay-credential"
            type="password"
            placeholder="secret"
            bind:value={relayCredential}
          />
        </div>
        <div class="sm:col-span-2">
          <Label
            for="relay-servers"
            class="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Server IDs (optional)
          </Label>
          <Input
            id="relay-servers"
            placeholder="server-123 server-456"
            bind:value={relayServerIds}
            disabled={relayScope === "global"}
          />
        </div>
        <div class="sm:col-span-2 flex items-center gap-3">
          <Button type="submit" disabled={savingRelay}>
            {savingRelay ? "Saving…" : "Add relay"}
          </Button>
          <p class="text-xs text-muted-foreground">
            Stored securely in the desktop keychain.
          </p>
        </div>
      </form>
    </div>
  </section>

  <section
    id="mesh-explorer"
    class="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6"
  >
    <div>
      <h2 class="text-lg font-semibold text-zinc-100">Mesh Explorer</h2>
      <p class="text-sm text-muted-foreground">
        Inspect live mesh connectivity, peer presence, and relay health without
        leaving Settings.
      </p>
    </div>
    <div class="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/50">
      <ConnectivityBanner
        state={$connectivityStore}
        statusMessage={$connectivityStatusMessageStore}
        fallbackMessage={$connectivityFallbackMessageStore}
        showBridgePrompt={showConnectivityBridgePrompt}
      />
    </div>
    <MeshExplorerPanel />
  </section>
</div>
