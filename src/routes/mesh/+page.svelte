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

  const stateStore = connectivityStore;
  const statusMessageStore = connectivityStore.statusMessage;

  const peerList = $derived(() => $stateStore.peers);
  const linkList = $derived(() => $stateStore.links);

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
          <{statusIcon()} class="size-3" />
          {statusLabel()}
        </Badge>
      </CardHeader>
      <CardContent class="grid gap-4 md:grid-cols-2">
        <div class="rounded-lg border border-border/60 bg-muted/40 p-4 text-sm">
          <p class="text-muted-foreground">Mesh peers</p>
          <p class="mt-1 text-2xl font-semibold">{$stateStore.meshPeers}</p>
        </div>
        <div class="rounded-lg border border-border/60 bg-muted/40 p-4 text-sm">
          <p class="text-muted-foreground">Total reachable peers</p>
          <p class="mt-1 text-2xl font-semibold">{$stateStore.totalPeers}</p>
        </div>
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
                </dl>
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
                </tr>
              </thead>
              <tbody class="divide-y divide-border/60 bg-background/80">
                {#each linkList() as link, index (link.source + link.target + index)}
                  <tr>
                    <td class="px-4 py-2 font-medium text-foreground">{link.source}</td>
                    <td class="px-4 py-2 text-foreground">{link.target}</td>
                    <td class="px-4 py-2 capitalize text-muted-foreground">{link.medium}</td>
                    <td class="px-4 py-2 text-muted-foreground">{link.quality !== null ? `${Math.round(link.quality * 100)}%` : "–"}</td>
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
