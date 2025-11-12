<script lang="ts">
  import { onMount } from "svelte";
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from "$lib/components/ui/avatar/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import { friendInvitesStore } from "$lib/features/friends/stores/friendInvitesStore";
  import { Check, Clock, Loader2, Search, UserPlus, UserX } from "@lucide/svelte";

  const store = friendInvitesStore;
  let searchQuery = $state("");

  onMount(() => {
    void store.initialize();
  });

  function formatRelativeTime(timestamp: string): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return "just now";
    }

    const diffMs = Date.now() - date.getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes <= 0) return "just now";
    if (minutes < 60) {
      return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    }

    const days = Math.floor(hours / 24);
    if (days < 7) {
      return `${days} day${days === 1 ? "" : "s"} ago`;
    }

    const weeks = Math.floor(days / 7);
    if (weeks < 5) {
      return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
    }

    const months = Math.floor(days / 30);
    if (months < 12) {
      return `${months} month${months === 1 ? "" : "s"} ago`;
    }

    const years = Math.floor(days / 365);
    return `${years} year${years === 1 ? "" : "s"} ago`;
  }

  function fallbackInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return "?";
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }

  $effect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length >= 2) {
      void store.search(trimmed);
    } else {
      void store.search("");
    }
  });
</script>

<div class="flex h-full flex-col bg-card/50 overflow-hidden">
  <ScrollArea class="flex-1 overflow-hidden">
    <div class="space-y-6 p-4">
      <section class="space-y-4">
    <div>
      <h1 class="text-xl font-semibold tracking-tight text-foreground">
        Find collaborators
      </h1>
      <p class="text-sm text-muted-foreground">
        Search across your recent peers or act on invitations people have sent you.
      </p>
    </div>

    <div class="relative">
      <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Search by name, handle, or ID"
        bind:value={searchQuery}
        class="pl-9"
        type="search"
      />
      {#if $store.searchLoading}
        <Loader2 class="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      {/if}
    </div>

    {#if searchQuery.trim().length >= 2}
      <Card class="border-border/70 bg-card/70">
        <CardHeader class="flex-row items-center justify-between gap-2">
          <div>
            <CardTitle class="text-base">Search results</CardTitle>
            <CardDescription>
              {#if $store.searchResults.length === 0}
                No matches yet. Try a different query.
              {:else}
                Suggestions based on known peers and directories.
              {/if}
            </CardDescription>
          </div>
        </CardHeader>
        {#if $store.searchResults.length > 0}
          <CardContent class="space-y-3">
            {#each $store.searchResults as result (result.user.id)}
              {@const user = result.user}
              <div
                class="flex flex-col gap-3 rounded-lg border border-border/70 bg-background/60 p-3 sm:flex-row sm:items-center"
              >
                <div class="flex items-center gap-3">
                  <Avatar class="size-10">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback>{fallbackInitials(user.name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p class="text-sm font-medium text-foreground">{user.name}</p>
                    <p class="text-xs text-muted-foreground">
                      {user.tag ? `@${user.tag}` : user.id}
                    </p>
                    {#if result.note}
                      <p class="mt-1 text-xs text-muted-foreground">{result.note}</p>
                    {/if}
                  </div>
                </div>
                <div class="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
                  <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {#if result.relationship === "friend"}
                      <Badge variant="secondary" class="bg-emerald-500/10 text-emerald-400">
                        <Check class="mr-1 size-3" />
                        Already friends
                      </Badge>
                    {:else if result.relationship === "incoming"}
                      <Badge variant="outline" class="border-primary/40 text-primary">
                        Awaiting your response
                      </Badge>
                    {:else if result.relationship === "recent"}
                      <Badge variant="outline" class="border-blue-400/50 text-blue-300">
                        Recently collaborated
                      </Badge>
                    {/if}
                    {#if typeof result.mutualFriends === "number"}
                      <span>{result.mutualFriends} mutual connections</span>
                    {/if}
                  </div>
                  <Button
                    class="w-full sm:w-auto"
                    variant={
                      result.relationship === "friend" || result.relationship === "incoming"
                        ? "outline"
                        : "default"
                    }
                    disabled={
                      result.relationship === "friend" ||
                      result.relationship === "incoming" ||
                      $store.sendingRequestIds.includes(user.id)
                    }
                    onclick={() => store.sendRequest(user.id)}
                  >
                    {#if $store.sendingRequestIds.includes(user.id)}
                      <Loader2 class="mr-2 size-4 animate-spin" />
                      Sending
                    {:else if result.relationship === "friend"}
                      <Check class="mr-2 size-4" />
                      Connected
                    {:else if result.relationship === "incoming"}
                      <Clock class="mr-2 size-4" />
                      Pending invite
                    {:else}
                      <UserPlus class="mr-2 size-4" />
                      Send request
                    {/if}
                  </Button>
                </div>
              </div>
            {/each}
          </CardContent>
        {/if}
      </Card>
    {/if}
      </section>
    </div>
  </ScrollArea>
</div>
