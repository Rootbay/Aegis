<script lang="ts">
  import { Clock, Filter, ListChecks } from "@lucide/svelte";
  import { Avatar, AvatarImage, AvatarFallback } from "$lib/components/ui/avatar/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import { SvelteMap } from "svelte/reactivity";
  import type { User } from "$lib/features/auth/models/User";
  import type { ServerAuditLogEntry } from "$lib/features/servers/models/Server";

  export let entries: ServerAuditLogEntry[] = [];
  export let members: User[] = [];

  let query = $state("");

  const memberDirectory = $derived<SvelteMap<string, User>>(() => {
    const directory = new SvelteMap<string, User>();
    for (const member of members ?? []) {
      if (member?.id) {
        directory.set(member.id, member);
      }
    }
    return directory;
  });

  const normalizedEntries = $derived(
    Array.isArray(entries)
      ? [...entries].sort((a, b) => {
          const aTime = Date.parse(a.createdAt ?? "");
          const bTime = Date.parse(b.createdAt ?? "");
          const normalizedB = Number.isFinite(bTime) ? bTime : 0;
          const normalizedA = Number.isFinite(aTime) ? aTime : 0;
          return normalizedB - normalizedA;
        })
      : [],
  );

  const filteredEntries = $derived(() => {
    if (!query) {
      return normalizedEntries;
    }
    const lowerQuery = query.toLowerCase();
    return normalizedEntries.filter((entry) => {
      const actorName = lookupActor(entry).name.toLowerCase();
      return (
        actorName.includes(lowerQuery) ||
        entry.action.toLowerCase().includes(lowerQuery) ||
        (entry.target?.toLowerCase?.() ?? "").includes(lowerQuery)
      );
    });
  });

  function lookupActor(entry: ServerAuditLogEntry) {
    const actorId = entry.actorId;
    const known = actorId ? memberDirectory.get(actorId) : undefined;
    if (known) {
      return {
        name: known.name ?? `User-${known.id.slice(0, 4)}`,
        avatar: known.avatar,
      };
    }
    return {
      name: entry.actorName ?? `Unknown (${actorId ?? "user"})`,
      avatar: entry.actorAvatar,
    };
  }

  function formatTimestamp(dateString: string | undefined) {
    if (!dateString) {
      return "Unknown time";
    }
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) {
      return "Unknown time";
    }
    return parsed.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatAction(action: string) {
    if (!action) return "Unknown";
    return action
      .split(/[_-]/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
</script>

<div class="space-y-4">
  <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h4 class="text-base font-semibold text-white">Audit Log</h4>
      <p class="text-sm text-muted-foreground">
        Review recent configuration changes and moderation actions.
      </p>
    </div>
    <div class="relative w-full sm:w-64">
      <Input
        placeholder="Filter by user, action, or target"
        bind:value={query}
        class="pr-9"
      />
      <Filter class="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  </div>

  {#if filteredEntries.length > 0}
    <ScrollArea class="max-h-96">
      <ul class="space-y-3">
        {#each filteredEntries as entry (entry.id)}
          {@const actor = lookupActor(entry)}
          <li class="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <div class="flex items-start gap-3">
              <Avatar class="h-10 w-10 border border-zinc-800">
                {#if actor.avatar}
                  <AvatarImage src={actor.avatar} alt={actor.name} />
                {:else}
                  <AvatarFallback>{actor.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                {/if}
              </Avatar>
              <div class="flex-1 space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="text-sm font-semibold text-white">{actor.name}</p>
                  <Badge variant="secondary">{formatAction(entry.action)}</Badge>
                  {#if entry.target}
                    <Badge variant="outline">Target: {entry.target}</Badge>
                  {/if}
                </div>
                <p class="text-xs text-muted-foreground">
                  <Clock class="mr-1 inline h-3.5 w-3.5 align-middle" />
                  {formatTimestamp(entry.createdAt)}
                </p>
                {#if entry.metadata}
                  <div class="rounded-md border border-zinc-800/80 bg-zinc-900/60 p-3 text-xs text-muted-foreground">
                    <p class="mb-1 font-semibold text-white/80">Details</p>
                    <div class="grid gap-1 sm:grid-cols-2">
                      {#each Object.entries(entry.metadata) as [key, value] (`${entry.id}-${key}`)}
                        <div class="truncate">
                          <span class="font-medium text-white/80">{key}:</span>
                          <span class="ml-1 text-muted-foreground">
                            {typeof value === "string" || typeof value === "number"
                              ? value
                              : JSON.stringify(value)}
                          </span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          </li>
        {/each}
      </ul>
    </ScrollArea>
  {:else}
    <div class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 p-8 text-center text-muted-foreground">
      <ListChecks class="h-10 w-10" />
      <p class="text-sm font-medium text-white">No audit activity yet</p>
      <p class="text-sm">
        Configuration changes and moderation events will appear here as they occur.
      </p>
    </div>
  {/if}
</div>
