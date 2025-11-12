<script lang="ts">
  import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogClose,
  } from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import {
    Gamepad2,
    Users,
    BookOpenCheck,
    Palette,
    Music3,
    Coffee,
    ArrowRight,
    X,
    Plus,
    Pen,
  } from "@lucide/svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { v4 as uuidv4 } from "uuid";
  import { userStore } from "$lib/stores/userStore";
  import type { Server } from "$lib/features/servers/models/Server";
  import { serverInvitesStore } from "$lib/features/servers/stores/serverInvitesStore";

  type UnaryHandler<T> = (value: T) => void;

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

  const templateOptions: {
    id: string;
    label: string;
    Icon: typeof Gamepad2;
  }[] = [
    { id: "gaming", label: "Gaming", Icon: Gamepad2 },
    { id: "friends", label: "Friends", Icon: Users },
    { id: "study", label: "Study Group", Icon: BookOpenCheck },
    { id: "art", label: "Art Collective", Icon: Palette },
    { id: "music", label: "Music Lounge", Icon: Music3 },
    { id: "hangout", label: "Casual Hangout", Icon: Coffee },
  ];

  const invites = serverInvitesStore;

  let newServerName = $state("");
  let serverSearchQuery = $state("");
  let joinMode = $state(false);
  let wasOpen = $state(show);
  let trimmedNewServerName = $derived(newServerName.trim());
  let tellUsDialogOpen = $state(false);
  let tellUsSelection = $state<string | null>(null);
  const exampleInvites = [
    "https://aeg.is/j/9f7xTqP2Bd",
    "https://aeg.is/inv/creators",
    "https://join.aeg.is/xyz123",
  ];

  function openJoinView() {
    joinMode = true;
    serverSearchQuery = "";
  }

  function closeJoinView() {
    joinMode = false;
  }

  function openTellUsDialog(source: string, presetName?: string) {
    tellUsSelection = source;
    newServerName = presetName ?? source;
    tellUsDialogOpen = true;
  }

  function closeTellUsDialog() {
    tellUsDialogOpen = false;
    tellUsSelection = null;
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
    if (!show || !joinMode) {
      return;
    }
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
      onserverCreated?.(newServer);
    } catch (error) {
      console.error("Failed to create server:", error);
    }
  }

  async function acceptInvite(inviteId: string) {
    const server = await invites.acceptInvite(inviteId);
    if (server) {
      onserverJoined?.(server);
    }
  }

  async function declineInvite(inviteId: string) {
    await invites.declineInvite(inviteId);
  }

  async function joinServer(serverId: string) {
    const server = await invites.joinServer(serverId);
    if (server) {
      onserverJoined?.(server);
    }
  }
</script>

<Dialog bind:open={show}>
  <DialogContent
    class={`w-[min(100%,450px)] max-w-[450px] ${joinMode ? "h-[440px]" : tellUsDialogOpen ? "" : "h-[550px]"}`}
  >
    {#if !tellUsDialogOpen}
      {#if !joinMode}
        <div class="space-y-5 h-full overflow-y-auto pr-1">
          <section class="space-y-3">
            <DialogTitle class="text-2xl font-semibold text-foreground">
              Create Your Server
            </DialogTitle>
            <p class="text-sm text-muted-foreground">
              Your server is where you and your friends hang out. Make yours and start talking.
            </p>
          </section>

          <section class="space-y-4 max-h-[250px] overflow-y-auto pr-1">
            <Button
              variant="outline"
              class="flex h-[52px] w-full items-center justify-between font-semibold text-foreground transition"
              onclick={() => openTellUsDialog("Create My Own")}
            >
              <div class="flex items-center gap-3">
                <Pen class="h-5 w-5 text-muted-foreground" />
                <span>Create My Own</span>
              </div>
              <ArrowRight class="h-4 w-4 text-muted-foreground" />
            </Button>
            <div class="space-y-3">
              <p class="text-xs font-semibold uppercase text-muted-foreground">
                START FROM A TEMPLATE
              </p>
              <div class="space-y-2">
                {#each templateOptions as template}
                  <Button
                    variant="outline"
                    class="flex h-[52px] w-full items-center justify-between font-semibold text-foreground transition"
                    onclick={() => openTellUsDialog(template.label, template.label)}
                  >
                    <div class="flex items-center gap-3">
                      <template.Icon class="h-5 w-5 text-muted-foreground" />
                      <span>{template.label}</span>
                    </div>
                    <ArrowRight class="h-4 w-4 text-muted-foreground" />
                  </Button>
                {/each}
              </div>
            </div>
          </section>

          <section class="space-y-3 text-center">
            <p class="text-lg font-semibold text-foreground">
              Have an invite already?
            </p>
            <Button
              class="w-full"
              variant="secondary"
              onclick={openJoinView}
            >
              Join a Server
            </Button>
          </section>
        </div>
      {:else}
        <div class="flex h-full flex-col justify-between">
          <div class="space-y-3">
            <DialogTitle class="text-2xl font-semibold text-foreground">
              Join a Server
            </DialogTitle>
            <p class="text-sm text-muted-foreground">
              Enter an invite below to join an existing server.
            </p>
            <div class="space-y-2">
              <Label class="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Invite link
              </Label>
              <Input
                placeholder="https://"
                bind:value={serverSearchQuery}
              />
            </div>
            <p class="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
              Invites should look like
            </p>
            <div class="flex flex-wrap gap-2">
              {#each exampleInvites as invite}
                <button
                  type="button"
                  class="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground transition hover:bg-muted/20"
                  onclick={() => {
                    serverSearchQuery = invite;
                  }}
                >
                  <Badge variant="outline">{invite}</Badge>
                </button>
              {/each}
            </div>
            <button
              type="button"
              class="mt-4 flex h-[52px] w-full items-center gap-3 rounded-xl border border-border/60 px-4 text-sm font-semibold text-foreground transition hover:bg-muted/20"
            >
              <Users class="h-6 w-6 text-muted-foreground" />
              <div class="flex-1 text-left">
                <p class="text-sm font-semibold text-foreground">
                  Don't have an invite?
                </p>
                <p class="text-xs text-muted-foreground">
                  Check out Discoverable communities in Server Discovery
                </p>
              </div>
              <ArrowRight class="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div class="flex w-full items-center justify-between">
            <Button variant="ghost" size="sm" onclick={closeJoinView}>
              Back
            </Button>
            <Button
              size="sm"
              disabled={!serverSearchQuery.trim()}
              onclick={() => joinServer(serverSearchQuery)}
            >
              Join Server
            </Button>
          </div>
        </div>
      {/if}
    {:else}
      <div class="flex h-full flex-col justify-between">
        <div class="space-y-4">
          <DialogTitle class="text-lg font-semibold text-foreground">
            Tell Us More About Your Server
          </DialogTitle>
          <p class="text-sm text-muted-foreground">
            In order to help you get started, let us know what you'll be using your server for.
          </p>
          <div class="space-y-2">
            <Button
              variant="outline"
              class="flex h-[52px] w-full items-center justify-between font-semibold text-foreground transition"
              onclick={() => {
                handleCreateServer();
                closeTellUsDialog();
              }}
            >
              <div class="flex items-center gap-3">
                <Pen class="h-5 w-5 text-muted-foreground" />
                <span>For a club or community</span>
              </div>
              <ArrowRight class="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button
              variant="outline"
              class="flex h-[52px] w-full items-center justify-between font-semibold text-foreground transition"
              onclick={() => {
                handleCreateServer();
                closeTellUsDialog();
              }}
            >
              <div class="flex items-center gap-3">
                <Pen class="h-5 w-5 text-muted-foreground" />
                <span>For me and my friends</span>
              </div>
              <ArrowRight class="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
          <div class="flex items-center justify-center text-xs font-semibold text-muted-foreground">
            <span class="text-xs text-muted-foreground">
              Not sure? You can
            </span>
            <button
              class="text-xs ml-1 mr-1 font-semibold text-blue-500 underline cursor-pointer"
              onclick={closeTellUsDialog}
            >
              skip this question
            </button>
            <span class="text-xs text-muted-foreground">
              for now.
            </span>
          </div>
        </div>
        <div class="flex items-center justify-between pt-4">
          <button
            class="text-sm font-semibold text-muted-foreground transition hover:text-foreground cursor-pointer"
            onclick={closeTellUsDialog}
          >
            Back
          </button>
        </div>
      </div>
    {/if}
    <DialogClose/>
  </DialogContent>
</Dialog>
