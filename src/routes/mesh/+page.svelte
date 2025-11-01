<svelte:options runes={true} />

<script lang="ts">
  import { connectivityStore } from "$lib/stores/connectivityStore";
  import { Badge } from "$lib/components/ui/badge";
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
  } from "$lib/components/ui/card";
  import { Separator } from "$lib/components/ui/separator";
  import { AlertTriangle, RadioTower, Wifi, WifiOff } from "@lucide/svelte";
  import MeshGraph from "./MeshGraph.svelte";
  import type { RelayStatus } from "$lib/features/settings/models/relay";

  const stateStore = connectivityStore;
  const statusMessageStore = connectivityStore.statusMessage;

  const peerList = $derived(() => $stateStore.peers);
  const linkList = $derived(() => $stateStore.links);
  const relayList = $derived(() => $stateStore.relays);

  const statusIcon = $derived(() => {
    switch ($stateStore.status) {
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

  const statusLabel = $derived(() => {
    switch ($stateStore.status) {
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
    switch ($stateStore.status) {
      case "online":
        return "default" as const;
      case "offline":
        return "destructive" as const;
      case "mesh-only":
        return "secondary" as const;
      default:
        return "outline" as const;
    }
  });

  const relayStatusVariant = (status: RelayStatus | undefined) => {
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

  const relayStatusLabel = (status: RelayStatus | undefined) => {
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
</script>

<div class="flex h-full flex-col overflow-y-auto">
  <div class="px-6 pb-4 pt-6">
    <h1 class="text-2xl font-semibold tracking-tight">Mesh Explorer</h1>
    <p class="mt-1 text-sm text-muted-foreground">
      Inspect live mesh connectivity, peer presence, and link health.
    </p>
  </div>
  <div class="flex-1 space-y-6 px-6 pb-8">
    <Card>
      <CardHeader class="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Current status</CardTitle>
          <CardDescription>{$statusMessageStore}</CardDescription>
        </div>
        <Badge variant={statusVariant()} class="flex items-center gap-1">
          <svelte:component this={statusIcon()} class="size-3" />
          {statusLabel()}
        </Badge>
      </CardHeader>
      <CardContent class="grid gap-4 md:grid-cols-3">
        <div class="rounded-lg border border-border/60 bg-muted/40 p-4 text-sm">
          <p class="text-muted-foreground">Mesh peers</p>
          <p class="mt-1 text-2xl font-semibold">{$stateStore.meshPeers}</p>
        </div>
        <div class="rounded-lg border border-border/60 bg-muted/40 p-4 text-sm">
          <p class="text-muted-foreground">Total reachable peers</p>
          <p class="mt-1 text-2xl font-semibold">{$stateStore.totalPeers}</p>
        </div>
        <div class="rounded-lg border border-border/60 bg-muted/40 p-4 text-sm">
          <p class="text-muted-foreground">Active relays</p>
          <p class="mt-1 text-2xl font-semibold">{$stateStore.activeRelayCount}</p>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Mesh topology</CardTitle>
        <CardDescription>
          Live graph of peers and the quality of the routes connecting them.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-3">
        <p class="text-sm text-muted-foreground">
          Node size reflects hop proximity while color intensity represents route quality or
          success rate. Link thickness indicates reported signal quality.
        </p>
        <MeshGraph peers={peerList()} links={linkList()} />
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Mesh peers</CardTitle>
        <CardDescription>
          Direct and relayed peers known to this device.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {#if peerList().length === 0}
          <div class="flex items-center gap-3 rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
            <AlertTriangle class="size-4" />
            No mesh peers detected. Devices will appear here when discovered.
          </div>
        {:else}
          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {#each peerList() as peer (peer.id)}
              <div class="rounded-lg border border-border/60 bg-background/80 p-4">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-sm font-medium text-foreground">{peer.label}</p>
                    <p class="text-xs text-muted-foreground">{peer.id}</p>
                  </div>
                  <Badge variant={peer.connection === "internet" ? "default" : peer.connection === "bridge" ? "secondary" : "outline"}>
                    {peer.connection === "self" ? "This device" : peer.connection === "internet" ? "Gateway" : peer.connection === "bridge" ? "Bridge" : "Mesh"}
                  </Badge>
                </div>
                <Separator class="my-3" />
                <dl class="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <dt class="font-medium text-foreground">Hop count</dt>
                    <dd>{peer.hopCount ?? "–"}</dd>
                  </div>
                  <div>
                    <dt class="font-medium text-foreground">Latency</dt>
                    <dd>{peer.latencyMs !== null ? `${peer.latencyMs} ms` : "–"}</dd>
                  </div>
                  <div>
                    <dt class="font-medium text-foreground">Last seen</dt>
                    <dd>{peer.lastSeen ? new Date(peer.lastSeen).toLocaleTimeString() : "–"}</dd>
                  </div>
                  <div>
                    <dt class="font-medium text-foreground">Via</dt>
                    <dd>{peer.via ?? "Direct"}</dd>
                  </div>
                  <div>
                    <dt class="font-medium text-foreground">Route quality</dt>
                    <dd>
                      {peer.routeQuality !== null
                        ? `${Math.round(peer.routeQuality * 100)}%`
                        : "–"}
                    </dd>
                  </div>
                  <div>
                    <dt class="font-medium text-foreground">Reliability</dt>
                    <dd>
                      {peer.successRate !== null
                        ? `${Math.round(peer.successRate * 100)}%`
                        : "–"}
                    </dd>
                  </div>
                </dl>
              </div>
            {/each}
          </div>
        {/if}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Relays</CardTitle>
        <CardDescription>
          Registered relay endpoints and their reported health.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {#if relayList().length === 0}
          <div class="flex items-center gap-3 rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
            <AlertTriangle class="size-4" />
            No relay telemetry reported yet.
          </div>
        {:else}
          <div class="space-y-3">
            {#each relayList() as relay (relay.id)}
              <div class="rounded-lg border border-border/60 bg-background/80 p-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-medium text-foreground">{relay.label}</p>
                    <p class="text-xs text-muted-foreground break-words">
                      {relay.urls.join(", ")}
                    </p>
                  </div>
                  <Badge variant={relayStatusVariant(relay.status)}>
                    {relayStatusLabel(relay.status)}
                  </Badge>
                </div>
                <dl class="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt class="font-medium text-foreground">Scope</dt>
                    <dd>{relay.scope === "global" ? "Global" : "Server-specific"}</dd>
                  </div>
                  <div>
                    <dt class="font-medium text-foreground">Last check</dt>
                    <dd>
                      {relay.lastCheckedAt
                        ? new Date(relay.lastCheckedAt).toLocaleString()
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt class="font-medium text-foreground">Latency</dt>
                    <dd>
                      {typeof relay.latencyMs === "number"
                        ? `${relay.latencyMs} ms`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt class="font-medium text-foreground">Uptime</dt>
                    <dd>
                      {typeof relay.uptimePercent === "number"
                        ? `${relay.uptimePercent.toFixed(1)}%`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt class="font-medium text-foreground">Credentials</dt>
                    <dd>{relay.hasCredential ? "Stored" : "None"}</dd>
                  </div>
                  <div>
                    <dt class="font-medium text-foreground">Servers</dt>
                    <dd>
                      {relay.serverIds.length > 0
                        ? relay.serverIds.join(", ")
                        : "Global"}
                    </dd>
                  </div>
                </dl>
                {#if relay.error}
                  <p class="mt-3 text-xs text-rose-400">{relay.error}</p>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Links</CardTitle>
        <CardDescription>Graph edges and their observed signal quality.</CardDescription>
      </CardHeader>
      <CardContent>
        {#if linkList().length === 0}
          <div class="flex items-center gap-3 rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
            <AlertTriangle class="size-4" />
            No active links reported.
          </div>
        {:else}
          <div class="overflow-hidden rounded-lg border border-border/60">
            <table class="min-w-full divide-y divide-border/60 text-sm">
              <thead class="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th class="px-4 py-2 text-left font-medium">Source</th>
                  <th class="px-4 py-2 text-left font-medium">Target</th>
                  <th class="px-4 py-2 text-left font-medium">Medium</th>
                  <th class="px-4 py-2 text-left font-medium">Quality</th>
                  <th class="px-4 py-2 text-left font-medium">Latency</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border/60 bg-background/80">
                {#each linkList() as link, index (link.source + link.target + index)}
                  <tr>
                    <td class="px-4 py-2 font-medium text-foreground">{link.source}</td>
                    <td class="px-4 py-2 text-foreground">{link.target}</td>
                    <td class="px-4 py-2 capitalize text-muted-foreground">{link.medium}</td>
                    <td class="px-4 py-2 text-muted-foreground">{link.quality !== null ? `${Math.round(link.quality * 100)}%` : "–"}</td>
                    <td class="px-4 py-2 text-muted-foreground">{link.latencyMs !== null ? `${Math.round(link.latencyMs)} ms` : "–"}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </CardContent>
    </Card>
  </div>
</div>
