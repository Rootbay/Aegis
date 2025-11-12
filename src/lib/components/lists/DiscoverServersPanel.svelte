<script lang="ts">
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from "$lib/components/ui/avatar";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { onMount } from "svelte";
  import { derived, get } from "svelte/store";
  import { activeTopic, normalizedSearch } from "$lib/features/discover/discoverPanelStore";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import type { Server } from "$lib/features/servers/models/Server";
  import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
  } from "$lib/components/ui/tooltip";
  import {
    BadgeCheck,
    Flame,
    Hash,
    ShieldCheck,
    Sparkles,
    Trophy,
    X,
  } from "@lucide/svelte";

  export type DiscoverPanelLayout = "full" | "compact";

  const { layout = "full" } = $props<{ layout?: DiscoverPanelLayout }>();

  const statusLabels = ["Verified", "Partner", "Official", "Top1", "Trending"] as const;
  type ServerStatus = (typeof statusLabels)[number];

  const statusIcons: Record<ServerStatus, typeof Hash> = {
    Verified: BadgeCheck,
    Partner: Sparkles,
    Official: ShieldCheck,
    Top1: Trophy,
    Trending: Flame,
  };

  const gradientPalettes = [
    "from-slate-950/80 via-indigo-950 to-sky-900/80",
    "from-emerald-900/70 via-teal-900 to-cyan-900/70",
    "from-purple-950 via-pink-900 to-orange-500/70",
    "from-slate-900 via-rose-900 to-violet-800/70",
    "from-slate-900 via-amber-900 to-amber-700/70",
    "from-slate-900 via-blue-900 to-indigo-900/70",
  ];

  const avatarPalettes = [
    "bg-slate-950 text-white",
    "bg-indigo-900 text-white",
    "bg-emerald-900 text-white",
    "bg-rose-900 text-white",
    "bg-amber-900 text-slate-900",
    "bg-cyan-900 text-white",
  ];

  function hashForIndex(value: string, mod: number) {
    let checksum = 0;
    for (let i = 0; i < value.length; i += 1) {
      checksum = (checksum * 31 + value.charCodeAt(i)) % mod;
    }
    return checksum;
  }

  function getBannerGradient(server: Server) {
    return gradientPalettes[
      hashForIndex(server.id ?? "default", gradientPalettes.length)
    ];
  }

  function getAvatarClasses(server: Server) {
    return avatarPalettes[
      hashForIndex(server.id ?? "default", avatarPalettes.length)
    ];
  }

  function resolveServerStatus(server: Server): ServerStatus {
    const count = server.members?.length ?? 0;
    if (count >= 400) {
      return "Top1";
    }
    if (count >= 250) {
      return "Partner";
    }
    if (count >= 120) {
      return "Trending";
    }
    if (server.description && /official/i.test(server.description)) {
      return "Official";
    }
    return "Verified";
  }

  type PreviewMessage = {
    id: string;
    author: string;
    text: string;
  };

  function buildPreviewMessages(server: Server): PreviewMessage[] {
    const channel = server.channels?.[0];
    const channelLabel = channel?.name ? `#${channel.name}` : "#general";
    const channelTopic =
      channel?.topic ?? `Warm updates across ${server.name}.`;
    const activeMembers = Math.max(
      1,
      Math.min(999, Math.floor((server.members?.length ?? 0) * 0.35) || 5),
    );
    return [
      {
        id: `${server.id}-welcome`,
        author: "Server Bot",
        text: `Welcome to ${server.name}! ${channelLabel} is open for every member.`,
      },
      {
        id: `${server.id}-channel`,
        author: channelLabel,
        text: channelTopic,
      },
      {
        id: `${server.id}-activity`,
        author: `${activeMembers} members online`,
        text: `Chat just dropped a new thread in ${channelLabel}.`,
      },
    ];
  }

  let previewServer = $state<Server | null>(null);
  let visibleCount = $state(6);

  const SCROLL_INCREMENT = 6;
  const SCROLL_BUFFER = 250;

  let displayedServers = derived(
    [serverStore, activeTopic, normalizedSearch],
    ([$serverState, $activeTopic, $normalizedSearch]) => {
      const normalizedTopic = $activeTopic.toLowerCase();
      return ($serverState.servers ?? [])
        .filter((server) => {
          const name = server.name?.toLowerCase() ?? "";
          const description = server.description?.toLowerCase() ?? "";
          const matchesTopic =
            normalizedTopic === "home" ||
            name.includes(normalizedTopic) ||
            description.includes(normalizedTopic);
          const matchesSearch =
            $normalizedSearch.length === 0 ||
            name.includes($normalizedSearch) ||
            server.id.toLowerCase().includes($normalizedSearch);
          return matchesTopic && matchesSearch;
        })
        .sort((a, b) => {
          const aMembers = a.members?.length ?? 0;
          const bMembers = b.members?.length ?? 0;
          return bMembers - aMembers;
        });
    },
  );

  let isCompact = $derived(() => layout === "compact");

  $effect(() => {
    get(activeTopic);
    get(normalizedSearch);
    visibleCount = SCROLL_INCREMENT;
  });

  function loadMoreServers() {
    const total = get(displayedServers).length;
    if (visibleCount >= total) {
      return;
    }
    visibleCount = Math.min(total, visibleCount + SCROLL_INCREMENT);
  }

  function handleScroll() {
    if (typeof window === "undefined") {
      return;
    }
    if (get(activeTopic) !== "Home") {
      return;
    }
    if (
      window.innerHeight + window.scrollY >=
      document.body.offsetHeight - SCROLL_BUFFER
    ) {
      loadMoreServers();
    }
  }

  onMount(() => {
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  });

  function handleCardToggle(server: Server) {
    previewServer = previewServer?.id === server.id ? null : server;
  }

  function handleCardKey(event: KeyboardEvent, server: Server) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCardToggle(server);
    }
  }

  let sectionClasses = $derived(() =>
    isCompact()
      ? "space-y-4 shadow w-full"
      : "mx-auto max-w-7xl w-full shadow-lg"
  );
</script>

<section class={sectionClasses}>
  <div class="space-y-4">
    {#if previewServer}
      {@const previewChannels = [...(previewServer.channels ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))}
      {@const previewMessages = buildPreviewMessages(previewServer)}
      {@const previewTopic = previewServer.categories?.[0]?.name ?? "Community"}
      <section class="rounded-2xl border border-border/70 bg-background/40 p-6 shadow-sm">
        <div class="flex flex-col gap-6 lg:flex-row">
          <div class="flex-1 space-y-5">
            <div class="flex items-center justify-between gap-3">
              <div class="space-y-1">
                <p class="text-xs uppercase tracking-[0.5em] text-muted-foreground">
                  Server preview
                </p>
                <h3 class="text-lg font-semibold text-foreground">{previewServer.name}</h3>
                <Badge variant="secondary" class="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
                  {previewTopic}
                </Badge>
                <p class="text-sm text-muted-foreground">
                  {previewServer.description ?? "No description provided for this community yet."}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="h-8 w-8 p-0"
                onclick={() => (previewServer = null)}
                aria-label="Close preview"
              >
                <X class="h-4 w-4" />
              </Button>
            </div>
            <div class="rounded-2xl border border-border/60 bg-muted/30 p-4">
              <p class="text-xs uppercase tracking-[0.4em] text-muted-foreground">Channels</p>
              <ul class="mt-3 space-y-2 text-sm text-foreground">
                {#if previewChannels.length > 0}
                  {#each previewChannels.slice(0, 5) as channel}
                    <li class="flex items-center justify-between">
                      <span class="text-muted-foreground/80">#{channel.name}</span>
                      <span class="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                        {channel.channel_type}
                      </span>
                    </li>
                  {/each}
                  {#if previewChannels.length > 5}
                    <li class="text-xs text-muted-foreground">
                      +{previewChannels.length - 5} more channels
                    </li>
                  {/if}
                {:else}
                  <li class="text-sm text-muted-foreground">No channels available yet.</li>
                {/if}
              </ul>
            </div>
            <div class="rounded-2xl border border-border/60 bg-muted/30 p-4">
              <p class="text-xs uppercase tracking-[0.4em] text-muted-foreground">Members</p>
              <p class="mt-2 text-sm font-semibold text-foreground">
                {previewServer.members?.length ?? 0} members invited
              </p>
              <p class="text-xs text-muted-foreground">
                Public community · Open chats
              </p>
            </div>
          </div>
          <div class="flex-1 space-y-4">
            <div class="rounded-2xl border border-border/60 bg-muted/30 p-4">
              <p class="text-xs uppercase tracking-[0.4em] text-muted-foreground">Chat view</p>
              <div class="mt-3 space-y-3">
                {#each previewMessages as message}
                  <div class="rounded-xl bg-background/60 p-3 shadow-inner">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                      {message.author}
                    </p>
                    <p class="text-sm text-foreground leading-relaxed">{message.text}</p>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        </div>
      </section>
    {/if}

    {#if $displayedServers.length === 0}
      <div class="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
        Nothing matches yet. Try another filter.
      </div>
    {:else}
      <TooltipProvider>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] justify-center gap-4">
        {#each $displayedServers.slice(0, visibleCount) as server (server.id)}
          {@const serverStatus = resolveServerStatus(server)}
          {@const StatusIcon = statusIcons[serverStatus] ?? Hash}
          {@const channelCount = server.channels?.length ?? 0}
          {@const memberCount = server.members?.length ?? 0}
          {@const primaryCategory = server.categories?.[0]?.name ?? ($activeTopic === "Home" ? "Community" : $activeTopic)}
          {@const avatarClasses = getAvatarClasses(server)}
          {@const bannerGradient = getBannerGradient(server)}
          <button
            class="relative flex h-80 w-full flex-col justify-between rounded-2xl border border-border/70 bg-background/70 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg active:scale-[0.99] cursor-pointer text-left data-[previewed=true]:ring-2 data-[previewed=true]:ring-indigo-500/60"
            data-previewed={previewServer?.id === server.id}
            onclick={() => handleCardToggle(server)}
            onkeydown={(event) => handleCardKey(event, server)}
          >
            <div class="absolute left-5 top-28 z-10">
              <div class="rounded-2xl bg-background/70 p-0.5 shadow-lg">
                <Avatar
                  class={`flex h-16 w-16 items-center justify-center rounded-xl border-2 border-background/70 ${avatarClasses}`}
                >
                  {#if server.iconUrl}
                    <AvatarImage src={server.iconUrl} alt={`${server.name} avatar`} />
                  {/if}
                  <AvatarFallback class="uppercase">{server.name[0] ?? "?"}</AvatarFallback>
                </Avatar>
              </div>
            </div>
            <div class="relative h-[150px] w-full overflow-hidden rounded-t-2xl">
              {#if server.iconUrl}
                <div
                  class="absolute inset-0 bg-cover bg-center"
                  style={`background-image: url('${server.iconUrl}')`}
                ></div>
              {:else}
                <div class={`absolute inset-0 bg-linear-to-br ${bannerGradient}`}></div>
              {/if}
              <div class="absolute inset-0 bg-linear-to-b from-black/10 via-transparent to-transparent"></div>
            </div>
            <div class="flex flex-1 flex-col justify-between gap-4 px-4 pb-4 pt-10 pl-4">
              <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger>
                      <StatusIcon class="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {serverStatus}
                    </TooltipContent>
                  </Tooltip>
                  <h2 class="text-base font-semibold text-foreground">{server.name}</h2>
                </div>
                <Badge variant="secondary" class="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  {primaryCategory}
                </Badge>
                <p class="text-sm text-muted-foreground">
                  {server.description ?? "No description yet."}
                </p>
              </div>
              <div class="flex flex-wrap items-center gap-4 text-[12px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                <span class="text-foreground">{channelCount} channels</span>
                <span class="text-foreground">{memberCount} members</span>
              </div>
            </div>
          </button>
        {/each}
        </div>
      </TooltipProvider>
      {#if visibleCount < $displayedServers.length}
        <p class="text-center text-xs text-muted-foreground">
          Scroll down to load more servers.
        </p>
      {/if}
    {/if}
  </div>
</section>
