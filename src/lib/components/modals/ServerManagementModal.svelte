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
    Upload,
  } from "@lucide/svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { v4 as uuidv4 } from "uuid";
  import { userStore } from "$lib/stores/userStore";
  import type { Server } from "$lib/features/servers/models/Server";
  import type { Channel } from "$lib/features/channels/models/Channel";
  import type { ChannelCategory } from "$lib/features/channels/models/ChannelCategory";
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
  let customizeServerDialogOpen = $state(false);
  let serverIconPreview = $state<string | null>(null);
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
    customizeServerDialogOpen = false;
    serverIconPreview = null;
    tellUsSelection = null;
  }

  function openCustomizeServerDialog() {
    customizeServerDialogOpen = true;
  }

  function closeCustomizeServerDialog() {
    customizeServerDialogOpen = false;
  }

  function handleServerIconUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];

    if (!file) {
      serverIconPreview = null;
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      serverIconPreview = reader.result as string | null;
    };
    reader.readAsDataURL(file);
  }

  const communityGuidelinesUrl = "https://aeg.is/community-guidelines";

  function openCommunityGuidelines() {
    if (typeof window !== "undefined") {
      window.open(communityGuidelinesUrl, "_blank", "noopener");
    }
  }

  function buildTemplateStructure(
    selection: string | null,
    serverId: string,
    timestamp: string
  ): { categories: ChannelCategory[]; channels: Channel[] } {
    const normalizedSelection = selection?.toLowerCase() ?? "";
    const isCreateOwn =
      normalizedSelection.includes("create") && normalizedSelection.includes("own");
    const baseLabel = selection?.trim() || "Community";
    const textCategoryName = isCreateOwn
      ? "Text Channels"
      : `${baseLabel} Text Channels`;
    const voiceCategoryName = isCreateOwn
      ? "Voice Channels"
      : `${baseLabel} Voice Channels`;

    const textCategoryId = uuidv4();
    const voiceCategoryId = uuidv4();

    const categories: ChannelCategory[] = [
      {
        id: textCategoryId,
        server_id: serverId,
        name: textCategoryName,
        position: 0,
        created_at: timestamp,
      },
      {
        id: voiceCategoryId,
        server_id: serverId,
        name: voiceCategoryName,
        position: 1,
        created_at: timestamp,
      },
    ];

    const channels: Channel[] = [
      {
        id: uuidv4(),
        name: "General",
        server_id: serverId,
        channel_type: "text",
        private: false,
        position: 0,
        category_id: textCategoryId,
      },
      {
        id: uuidv4(),
        name: "General",
        server_id: serverId,
        channel_type: "voice",
        private: false,
        position: 0,
        category_id: voiceCategoryId,
      },
    ];

    return { categories, channels };
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

  async function handleCreateServer(): Promise<boolean> {
    if (!trimmedNewServerName) return false;
    if (!$userStore.me) {
      console.error("User not loaded, cannot create server.");
      return false;
    }

    const serverId = uuidv4();
    const createdAt = new Date().toISOString();
    const templateStructure = buildTemplateStructure(
      tellUsSelection,
      serverId,
      createdAt
    );

    const newServer: Server = {
      id: serverId,
      name: trimmedNewServerName,
      owner_id: $userStore.me.id,
      created_at: createdAt,
      channels: templateStructure.channels,
      categories: templateStructure.categories,
      members: [],
      roles: [],
      iconUrl: serverIconPreview ?? undefined,
    };

    try {
      await invoke("create_server", { server: newServer });
      newServerName = "";
      serverIconPreview = null;
      onserverCreated?.(newServer);
      return true;
    } catch (error) {
      console.error("Failed to create server:", error);
      return false;
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

          <section class="space-y-4 max-h-[300px] overflow-y-auto pr-1">
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
      {#if !customizeServerDialogOpen}
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
                onclick={openCustomizeServerDialog}
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
                onclick={openCustomizeServerDialog}
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
                onclick={openCustomizeServerDialog}
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
      {:else}
        <div class="space-y-4">
          <DialogTitle class="text-lg font-semibold text-foreground">
            Customize Your Server
          </DialogTitle>
          <p class="text-sm text-muted-foreground">
            Give your new server a personality with a name and icon. You can always change it later.
          </p>
          <div class="flex flex-col items-center gap-3">
            <label
              for="custom-server-icon"
              class="flex h-24 w-24 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-border bg-muted/40 transition-colors hover:bg-muted"
            >
              {#if serverIconPreview}
                <img
                  src={serverIconPreview}
                  alt="Server icon preview"
                  class="h-full w-full rounded-full object-cover"
                />
              {:else}
                <Upload class="h-5 w-5 text-muted-foreground" />
              {/if}
            </label>
            <input
              id="custom-server-icon"
              type="file"
              class="hidden"
              accept="image/*"
              onchange={handleServerIconUpload}
            />
            <span class="text-xs text-muted-foreground">Upload a profile photo</span>
          </div>
          <div class="space-y-2">
            <Label for="custom-server-name">Server Name</Label>
            <Input
              id="custom-server-name"
              placeholder="My Awesome Server"
              bind:value={newServerName}
            />
          </div>
          <div class="text-center text-xs text-muted-foreground">
            <span>By creating a server, you agree to </span>
            <button
              type="button"
              class="text-blue-500 font-semibold underline"
              onclick={openCommunityGuidelines}
            >
              Aegis Community Guidelines
            </button>
          </div>
          <div class="flex items-center justify-between pt-4">
            <Button variant="ghost" size="sm" onclick={closeCustomizeServerDialog}>
              Back
            </Button>
            <Button
              size="sm"
              disabled={!trimmedNewServerName}
              onclick={async () => {
                if (await handleCreateServer()) {
                  closeTellUsDialog();
                  show = false;
                }
              }}
            >
              Create
            </Button>
          </div>
        </div>
      {/if}
    {/if}
  </DialogContent>
</Dialog>
