<svelte:options runes={true} />

<script lang="ts">
  import type { MeshLink, MeshPeer } from "$lib/stores/connectivityStore";

  const { peers, links } = $props<{
    peers: MeshPeer[];
    links: MeshLink[];
  }>();

  type HoverState =
    | {
        type: "node";
        peer: MeshPeer;
        position: { x: number; y: number };
      }
    | {
        type: "edge";
        link: MeshLink & { sourceLabel?: string; targetLabel?: string };
        position: { x: number; y: number };
      }
    | null;

  let hovered = $state<HoverState>(null);

  let containerEl: HTMLDivElement | null = null;

  const dimensions = {
    width: 720,
    height: 480,
    padding: 60,
  };

  interface PositionedNode {
    peer: MeshPeer;
    x: number;
    y: number;
    radius: number;
    fill: string;
    stroke: string;
  }

  interface PositionedEdge {
    link: MeshLink;
    path: string;
    stroke: string;
    strokeWidth: number;
    midpoint: { x: number; y: number };
    sourceLabel?: string;
    targetLabel?: string;
  }

  const layout = $derived(() => {
    const peerData = peers ?? [];
    const linkData = links ?? [];

    if (peerData.length === 0) {
      return {
        nodes: [] as PositionedNode[],
        edges: [] as PositionedEdge[],
      };
    }

    const { width, height, padding } = dimensions;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - padding;
    const maxHop = peerData.reduce((acc, peer) => {
      if (peer.hopCount !== null && peer.hopCount > acc) {
        return peer.hopCount;
      }
      return acc;
    }, 0);

    const nodes = peerData.map((peer, index) => {
      const angle =
        peerData.length > 1
          ? (index / peerData.length) * Math.PI * 2 - Math.PI / 2
          : 0;
      const distance = peer.connection === "self" ? 0 : radius;
      const x = centerX + distance * Math.cos(angle);
      const y = centerY + distance * Math.sin(angle);
      const hop = peer.hopCount ?? maxHop;
      const hopScale = maxHop > 0 ? 1 - Math.min(hop, maxHop) / maxHop : 1;
      const routeQuality = peer.routeQuality ?? peer.successRate;
      const hue = routeQuality !== null ? 120 * (routeQuality ?? 0) : 210;
      const saturation = routeQuality !== null ? 70 : 20;
      const lightness = routeQuality !== null ? 40 + hopScale * 20 : 55;
      const radiusBase = 18;
      const radiusBonus = hopScale * 10;

      return {
        peer,
        x,
        y,
        radius: radiusBase + radiusBonus,
        fill: `hsl(${Math.round(hue)} ${saturation}% ${Math.round(lightness)}%)`,
        stroke:
          peer.connection === "self" ? "hsl(45 100% 50%)" : "hsl(210 20% 25%)",
      } satisfies PositionedNode;
    });

    const nodeMap = new Map(nodes.map((node) => [node.peer.id, node]));

    const edges = linkData
      .map((link) => {
        const source = nodeMap.get(link.source);
        const target = nodeMap.get(link.target);

        if (!source || !target) {
          return null;
        }

        const quality = link.quality ?? 0;
        const stroke =
          link.quality === null
            ? "hsl(215 12% 60%)"
            : `hsl(${Math.round(quality * 120)} 70% ${40 + (1 - quality) * 15}%)`;
        const strokeWidth = 2 + (link.quality ?? 0.5) * 2.5;
        const midpoint = {
          x: (source.x + target.x) / 2,
          y: (source.y + target.y) / 2,
        };

        return {
          link,
          path: `M ${source.x} ${source.y} L ${target.x} ${target.y}`,
          stroke,
          strokeWidth,
          midpoint,
          sourceLabel: source.peer.label,
          targetLabel: target.peer.label,
        } satisfies PositionedEdge;
      })
      .filter((edge): edge is PositionedEdge => edge !== null);

    return { nodes, edges };
  });

  function getRelativePosition(event: PointerEvent | MouseEvent) {
    if (!containerEl) {
      return { x: event.clientX, y: event.clientY };
    }

    const rect = containerEl.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function showNodePointerTooltip(event: PointerEvent, peer: MeshPeer) {
    hovered = {
      type: "node",
      peer,
      position: getRelativePosition(event),
    };
  }

  function showEdgePointerTooltip(event: PointerEvent, edge: PositionedEdge) {
    hovered = {
      type: "edge",
      link: {
        ...edge.link,
        sourceLabel: edge.sourceLabel,
        targetLabel: edge.targetLabel,
      },
      position: getRelativePosition(event),
    };
  }

  function showNodeFocusTooltip(element: SVGGElement, peer: MeshPeer) {
    if (!containerEl) {
      hovered = {
        type: "node",
        peer,
        position: { x: 12, y: 12 },
      };
      return;
    }

    const containerRect = containerEl.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    hovered = {
      type: "node",
      peer,
      position: {
        x: elementRect.left - containerRect.left + elementRect.width / 2,
        y: elementRect.top - containerRect.top + elementRect.height / 2,
      },
    };
  }

  function showEdgeFocusTooltip(element: SVGGElement, edge: PositionedEdge) {
    if (!containerEl) {
      hovered = {
        type: "edge",
        link: {
          ...edge.link,
          sourceLabel: edge.sourceLabel,
          targetLabel: edge.targetLabel,
        },
        position: { x: 12, y: 12 },
      };
      return;
    }

    const containerRect = containerEl.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    hovered = {
      type: "edge",
      link: {
        ...edge.link,
        sourceLabel: edge.sourceLabel,
        targetLabel: edge.targetLabel,
      },
      position: {
        x: elementRect.left - containerRect.left + elementRect.width / 2,
        y: elementRect.top - containerRect.top + elementRect.height / 2,
      },
    };
  }

  function clearTooltip() {
    hovered = null;
  }
</script>

<div
  class="relative h-112 w-full overflow-hidden rounded-lg border border-border/60 bg-muted/20"
  bind:this={containerEl}
  role="application"
  aria-label="Mesh connectivity graph"
>
  {#if layout().nodes.length === 0}
    <div
      class="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground"
    >
      No peers available for visualization.
    </div>
  {:else}
    <svg
      class="size-full"
      viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="self-node" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="hsl(48 100% 85%)" />
          <stop offset="100%" stop-color="hsl(48 100% 65%)" />
        </radialGradient>
      </defs>
      <g class="stroke-border/50">
        {#each layout().edges as edge (edge.link.source + edge.link.target)}
          <g
            tabindex="-1"
            onpointerenter={(event) => showEdgePointerTooltip(event, edge)}
            onpointerleave={clearTooltip}
            onfocus={(event) =>
              showEdgeFocusTooltip(event.currentTarget as SVGGElement, edge)}
            onblur={clearTooltip}
          >
            <path
              d={edge.path}
              fill="none"
              stroke={edge.stroke}
              stroke-width={edge.strokeWidth}
              stroke-linecap="round"
              class="transition-colors duration-150"
            />
          </g>
        {/each}
      </g>

      <g>
        {#each layout().nodes as node (node.peer.id)}
          <g
            tabindex="-1"
            class="cursor-pointer focus:outline-none"
            onpointerenter={(event) => showNodePointerTooltip(event, node.peer)}
            onpointerleave={clearTooltip}
            onfocus={(event) =>
              showNodeFocusTooltip(
                event.currentTarget as SVGGElement,
                node.peer,
              )}
            onblur={clearTooltip}
          >
            <circle
              cx={node.x}
              cy={node.y}
              r={node.radius}
              fill={node.peer.connection === "self"
                ? "url(#self-node)"
                : node.fill}
              stroke={node.stroke}
              stroke-width="3"
              class="transition-transform duration-150 hover:scale-105 focus:scale-105"
            />
            <text
              x={node.x}
              y={node.y + node.radius + 18}
              text-anchor="middle"
              class="fill-muted-foreground text-xs"
            >
              {node.peer.label}
            </text>
          </g>
        {/each}
      </g>
    </svg>
  {/if}

  {#if hovered}
    {@const hover = hovered!}
    <div
      class="pointer-events-none absolute z-10 max-w-xs rounded-md border border-border/60 bg-background/95 p-3 text-xs shadow-md"
      style={`left: ${Math.min(Math.max(hover.position.x + 12, 12), (containerEl?.clientWidth ?? 0) - 12)}px; top: ${Math.min(Math.max(hover.position.y + 12, 12), (containerEl?.clientHeight ?? 0) - 12)}px;`}
    >
      {#if hover.type === "node"}
        <p class="font-medium text-foreground">{hover.peer.label}</p>
        <p class="text-[0.7rem] text-muted-foreground">{hover.peer.id}</p>
        <div class="mt-2 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">Hop count</span>
            <span class="font-medium text-foreground"
              >{hover.peer.hopCount ?? "–"}</span
            >
          </div>
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">Route quality</span>
            <span class="font-medium text-foreground">
              {hover.peer.routeQuality !== null
                ? `${Math.round((hover.peer.routeQuality ?? 0) * 100)}%`
                : "–"}
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">Success rate</span>
            <span class="font-medium text-foreground">
              {hover.peer.successRate !== null
                ? `${Math.round((hover.peer.successRate ?? 0) * 100)}%`
                : "–"}
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">Latency</span>
            <span class="font-medium text-foreground"
              >{hover.peer.latencyMs !== null
                ? `${hover.peer.latencyMs} ms`
                : "–"}</span
            >
          </div>
        </div>
      {:else if hover.type === "edge"}
        <p class="font-medium text-foreground">
          Link: {hover.link.sourceLabel ?? hover.link.source} →
          {hover.link.targetLabel ?? hover.link.target}
        </p>
        <div class="mt-2 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">Quality</span>
            <span class="font-medium text-foreground">
              {hover.link.quality !== null
                ? `${Math.round((hover.link.quality ?? 0) * 100)}%`
                : "–"}
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">Medium</span>
            <span class="font-medium capitalize text-foreground"
              >{hover.link.medium}</span
            >
          </div>
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">Latency</span>
            <span class="font-medium text-foreground">
              {hover.link.latencyMs !== null
                ? `${Math.round(hover.link.latencyMs ?? 0)} ms`
                : "–"}
            </span>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
