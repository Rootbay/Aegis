<script lang="ts">
  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogClose,
  } from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from "$lib/components/ui/avatar/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import {
    Plus,
    Check,
    Clock,
    Loader2,
    Search,
    Server as ServerIcon,
    ShieldCheck,
    UserX,
    Users,
    X,
  } from "@lucide/svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { v4 as uuidv4 } from "uuid";
  import { userStore } from "$lib/stores/userStore";
  import type { Server } from "$lib/features/servers/models/Server";
  import { serverInvitesStore } from "$lib/features/servers/stores/serverInvitesStore";

  type UnaryHandler<T> = (value: T) => void; // eslint-disable-line no-unused-vars

  type ServerManagementModalProps = {
    show?: boolean;
    onclose?: () => void;
    onserverCreated?: UnaryHandler<Server>;
    onserverJoined?: UnaryHandler<Server>;
  };

  let {
    show = $bindable(false),
    onclose,
    onserverCreated,
    onserverJoined,
  }: ServerManagementModalProps = $props();

  const invites = serverInvitesStore;

  let newServerName = $state("");
  let serverSearchQuery = $state("");
  let wasOpen = $state(show);

  let trimmedNewServerName = $derived(newServerName.trim());

  function closeModal() {
    show = false;
  }

  function formatRelativeTime(timestamp: string | undefined): string {
    if (!timestamp) return "recently";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "recently";
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes <= 0) return "just now";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }

  function fallbackInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }

  $effect(() => {
    if (show && !wasOpen) {
      void invites.initialize();
    }

    if (!show && wasOpen) {
      onclose?.();
    }

    wasOpen = show;
  });

  $effect(() => {
    const trimmed = serverSearchQuery.trim();
    if (!show) return;
    if (trimmed.length >= 2) {
      void invites.search(trimmed);
    } else {
      void invites.search("");
    }
  });

  async function handleCreateServer() {
    if (!trimmedNewServerName) return;
    if (!$userStore.me) {
      console.error("User not loaded, cannot create server.");
      return;
    }

    const newServer: Server = {
      id: uuidv4(),
      name: trimmedNewServerName,
      owner_id: $userStore.me.id,
      created_at: new Date().toISOString(),
      channels: [],
      categories: [],
      members: [],
      roles: [],
    };

    try {
      await invoke("create_server", { server: newServer });
      newServerName = "";
      closeModal();
      onserverCreated?.(newServer);
    } catch (error) {
      console.error("Failed to create server:", error);
    }
  }

  async function acceptInvite(inviteId: string) {
    const server = await invites.acceptInvite(inviteId);
    if (server) {
      onserverJoined?.(server);
      closeModal();
    }
  }

  async function declineInvite(inviteId: string) {
    await invites.declineInvite(inviteId);
  }

  async function joinServer(serverId: string) {
    const server = await invites.joinServer(serverId);
    if (server) {
      onserverJoined?.(server);
      closeModal();
    }
  }
</script>

<Dialog bind:open={show}>
  <DialogContent class="sm:max-w-2xl">
    <DialogHeader class="text-left">
      <DialogTitle>Server management</DialogTitle>
      <DialogDescription>
        Launch a new space or act on invitations shared with you by your teams.
      </DialogDescription>
    </DialogHeader>

    <div class="space-y-6">
      <section class="space-y-4 rounded-md border border-border/70 bg-card/70 p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <h3 class="text-sm font-semibold text-foreground">Create a new server</h3>
            <p class="text-xs text-muted-foreground">
              Spin up a fresh coordination space for your mesh peers.
            </p>
          </div>
          <ShieldCheck class="size-5 text-primary" />
        </div>

        <div class="space-y-2">
          <Label for="server-name">Server name</Label>
          <Input
            id="server-name"
            type="text"
            placeholder="Mesh Observability"
            bind:value={newServerName}
          />
        </div>

        <Button
          class="w-full"
          type="button"
          disabled={!trimmedNewServerName}
          onclick={handleCreateServer}
        >
          <Plus class="mr-2 size-4" />
          Create server
        </Button>
      </section>

      <section class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-foreground">Pending invites</h3>
          <Badge variant="outline" class="border-border/60 text-xs text-muted-foreground">
            {$invites.pendingInvites.length} open
          </Badge>
        </div>

        {#if $invites.loading}
          <div class="flex items-center gap-3 rounded-md border border-border/70 bg-card/60 p-4 text-sm text-muted-foreground">
            <Loader2 class="size-4 animate-spin" />
            Loading invites…
          </div>
        {:else if $invites.pendingInvites.length === 0}
          <Card class="border-dashed border-border/70 bg-card/50">
            <CardContent class="py-8 text-center text-sm text-muted-foreground">
              No active invites right now. They'll appear here when teammates share them.
            </CardContent>
          </Card>
        {:else}
          <div class="space-y-3">
            {#each $invites.pendingInvites as invite (invite.id)}
              <Card class="border-border/70 bg-card/70">
                <CardContent class="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div class="flex items-start gap-3">
                    <Avatar class="size-12">
                      <AvatarImage src={invite.server.icon} alt={invite.server.name} />
                      <AvatarFallback>{fallbackInitials(invite.server.name)}</AvatarFallback>
                    </Avatar>
                    <div class="space-y-1">
                      <CardTitle class="text-base font-semibold text-foreground">
                        {invite.server.name}
                      </CardTitle>
                      <CardDescription class="text-xs leading-5 text-muted-foreground">
                        {invite.note ?? invite.server.description ?? "No description provided."}
                      </CardDescription>
                      <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span class="inline-flex items-center gap-1">
                          <Users class="size-3" />
                          {invite.server.memberCount} members
                        </span>
                        <span class="inline-flex items-center gap-1">
                          <Clock class="size-3" />
                          {formatRelativeTime(invite.invitedAt)}
                        </span>
                        <span class="inline-flex items-center gap-1">
                          <ServerIcon class="size-3" />
                          Invited by {invite.invitedBy.name}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="secondary"
                      class="sm:w-32"
                      disabled={$invites.respondingInviteIds.includes(invite.id)}
                      onclick={() => declineInvite(invite.id)}
                    >
                      {#if $invites.respondingInviteIds.includes(invite.id)}
                        <Loader2 class="mr-2 size-4 animate-spin" />
                        Working
                      {:else}
                        <UserX class="mr-2 size-4" />
                        Dismiss
                      {/if}
                    </Button>
                    <Button
                      class="sm:w-32"
                      disabled={$invites.respondingInviteIds.includes(invite.id)}
                      onclick={() => acceptInvite(invite.id)}
                    >
                      {#if $invites.respondingInviteIds.includes(invite.id)}
                        <Loader2 class="mr-2 size-4 animate-spin" />
                        Joining
                      {:else}
                        <Check class="mr-2 size-4" />
                        Join server
                      {/if}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            {/each}
          </div>
        {/if}
      </section>

      <Separator class="bg-border/60" />

      <section class="space-y-4">
        <div class="space-y-1">
          <h3 class="text-sm font-semibold text-foreground">Discover servers</h3>
          <p class="text-xs text-muted-foreground">
            Search open directories or revisit communities you've recently collaborated with.
          </p>
        </div>

        <div class="relative">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by server name or ID"
            bind:value={serverSearchQuery}
            class="pl-9"
          />
          {#if $invites.searchLoading}
            <Loader2 class="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          {/if}
        </div>

        {#if serverSearchQuery.trim().length >= 2}
          <Card class="border-border/70 bg-card/70">
            <CardHeader>
              <CardTitle class="text-base">Search results</CardTitle>
              <CardDescription>
                {#if $invites.searchResults.length === 0}
                  Nothing matched your search just yet.
                {:else}
                  Servers that match your query.
                {/if}
              </CardDescription>
            </CardHeader>
            {#if $invites.searchResults.length > 0}
              <CardContent class="space-y-3">
                {#each $invites.searchResults as result (result.server.id)}
                  <div class="flex flex-col gap-3 rounded-md border border-border/70 bg-background/60 p-3 sm:flex-row sm:items-center">
                    <div class="flex items-start gap-3">
                      <Avatar class="size-12">
                        <AvatarImage src={result.server.icon} alt={result.server.name} />
                        <AvatarFallback>{fallbackInitials(result.server.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p class="text-sm font-medium text-foreground">{result.server.name}</p>
                        <p class="text-xs text-muted-foreground">
                          {result.server.description ?? "No description provided."}
                        </p>
                        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span class="inline-flex items-center gap-1">
                            <Users class="size-3" />
                            {result.server.memberCount} members
                          </span>
                          <span class="inline-flex items-center gap-1">
                            <Clock class="size-3" />
                            Active {formatRelativeTime(result.server.lastActiveAt)}
                          </span>
                          {#if typeof result.server.mutualFriends === "number"}
                            <span>{result.server.mutualFriends} mutual connections</span>
                          {/if}
                        </div>
                        {#if result.server.tags?.length}
                          <div class="mt-2 flex flex-wrap gap-2">
                            {#each result.server.tags.slice(0, 4) as tag (tag)}
                              <Badge variant="secondary" class="bg-primary/10 text-xs text-primary">
                                #{tag}
                              </Badge>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    </div>
                    <Button
                      class="w-full sm:w-auto"
                      variant={result.membership === "joined" ? "outline" : "default"}
                      disabled={
                        result.membership === "joined" ||
                        $invites.joiningServerIds.includes(result.server.id)
                      }
                      onclick={() => joinServer(result.server.id)}
                    >
                      {#if $invites.joiningServerIds.includes(result.server.id)}
                        <Loader2 class="mr-2 size-4 animate-spin" />
                        Joining
                      {:else if result.membership === "joined"}
                        <Check class="mr-2 size-4" />
                        Joined
                      {:else}
                        <Plus class="mr-2 size-4" />
                        Join server
                      {/if}
                    </Button>
                  </div>
                {/each}
              </CardContent>
            {/if}
          </Card>
        {/if}

        {#if $invites.recentServers.length > 0}
          <div class="space-y-3">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Recently active
            </h4>
            <div class="space-y-3">
              {#each $invites.recentServers as entry (entry.server.id)}
                <Card class="border-border/70 bg-card/70">
                  <CardContent class="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div class="flex items-start gap-3">
                      <Avatar class="size-12">
                        <AvatarImage src={entry.server.icon} alt={entry.server.name} />
                        <AvatarFallback>{fallbackInitials(entry.server.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p class="text-sm font-medium text-foreground">{entry.server.name}</p>
                        <p class="text-xs text-muted-foreground">
                          {entry.note ?? entry.server.description ?? "No description provided."}
                        </p>
                        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span class="inline-flex items-center gap-1">
                            <Users class="size-3" />
                            {entry.server.memberCount} members
                          </span>
                          <span class="inline-flex items-center gap-1">
                            <Clock class="size-3" />
                            Active {formatRelativeTime(entry.server.lastActiveAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant={entry.membership === "joined" ? "outline" : "secondary"}
                      class="w-full sm:w-auto"
                      disabled={
                        entry.membership === "joined" ||
                        $invites.joiningServerIds.includes(entry.server.id)
                      }
                      onclick={() => joinServer(entry.server.id)}
                    >
                      {#if entry.membership === "joined"}
                        <Check class="mr-2 size-4" />
                        Joined
                      {:else if $invites.joiningServerIds.includes(entry.server.id)}
                        <Loader2 class="mr-2 size-4 animate-spin" />
                        Joining
                      {:else}
                        <Plus class="mr-2 size-4" />
                        Join again
                      {/if}
                    </Button>
                  </CardContent>
                </Card>
              {/each}
            </div>
          </div>
        {/if}
      </section>
    </div>

    <DialogClose
      class="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus:outline-none"
      onclick={closeModal}
    >
      <span class="sr-only">Close</span>
      <X class="h-4 w-4" />
    </DialogClose>
  </DialogContent>
</Dialog>
