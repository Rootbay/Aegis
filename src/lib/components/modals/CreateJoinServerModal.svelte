<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { X, ArrowLeft, Upload } from "@lucide/svelte";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { userStore } from "$lib/stores/userStore";
  import type { Server } from "$lib/features/servers/models/Server";
  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
  } from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import { onDestroy } from "svelte";

  type Props = {
    onclose: () => void;
  };

  let { onclose }: Props = $props();

  let open = $state(true);
  let inviteLink = $state("");
  let modalView = $state<"main" | "joinLink" | "createServer">("main");
  let serverName = $state("");
  let serverIcon = $state<File | null>(null);
  let serverIconPreview = $state<string | null>(null);
  let joining = $state(false);
  let joinError = $state<string | null>(null);

  let trimmedInviteLink = $derived(inviteLink.trim());
  let trimmedServerName = $derived(serverName.trim());

  type BackendServer = Parameters<
    (typeof serverStore)["upsertServerFromBackend"]
  >[0];

  type RedeemInviteResponse = {
    server: BackendServer;
    already_member?: boolean;
    alreadyMember?: boolean;
  };

  const viewCopy = {
    main: {
      title: "Create or Join Server",
      description:
        "Start a new server or browse templates to spin one up quickly.",
    },
    joinLink: {
      title: "Join a Server",
      description:
        "Enter an invite link to instantly connect with an existing community.",
    },
    createServer: {
      title: "Create Your Server",
      description:
        "Give your server a name and optional icon before inviting friends.",
    },
  } as const;

  type ServerTemplate = {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    defaultIconUrl?: string;
  };

  const templates: ServerTemplate[] = [
    {
      id: "template-1",
      name: "Gaming Community",
      description: "Organize raids, strategies, and voice channels for your squad.",
      icon: "🎮",
    },
    {
      id: "template-2",
      name: "Study Group",
      description: "Share resources, schedule study sessions, and stay accountable.",
      icon: "📚",
    },
    {
      id: "template-3",
      name: "Local Meetup",
      description: "Coordinate meetups, announce events, and welcome newcomers.",
      icon: "📍",
    },
    {
      id: "template-4",
      name: "Development Team",
      description: "Plan sprints, track tasks, and collaborate on releases.",
      icon: "💻",
    },
    {
      id: "template-5",
      name: "Family & Friends",
      description: "Stay in touch, plan gatherings, and share life's moments.",
      icon: "👪",
    },
    {
      id: "template-6",
      name: "Project Collaboration",
      description: "Create dedicated spaces for files, updates, and feedback.",
      icon: "🛠️",
    },
    {
      id: "template-7",
      name: "Book Club",
      description: "Discuss chapters, vote on reads, and schedule meetings.",
      icon: "📖",
    },
    {
      id: "template-8",
      name: "Fitness Group",
      description: "Share workout plans, progress photos, and motivation.",
      icon: "💪",
    },
    {
      id: "template-9",
      name: "Travel Buddies",
      description: "Coordinate itineraries, tips, and travel photo dumps.",
      icon: "🧳",
    },
    {
      id: "template-10",
      name: "Art & Design",
      description: "Showcase creations, gather feedback, and host critiques.",
      icon: "🎨",
    },
  ];

  let selectedTemplate = $state<ServerTemplate | null>(null);
  let selectedTemplateId = $derived(selectedTemplate?.id ?? null);

  function extractInviteCode(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const url = new URL(trimmed);
      const explicitCode =
        url.searchParams.get("code") ?? url.searchParams.get("invite");
      if (explicitCode && explicitCode.trim()) {
        return explicitCode.trim();
      }

      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length > 0) {
        return segments[segments.length - 1];
      }
    } catch {
      const candidate = trimmed.replace(/\s+/g, "");
      if (/^[A-Za-z0-9_-]{4,}$/.test(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  async function joinServer(event?: Event) {
    event?.preventDefault?.();
    if (!$userStore.me) {
      joinError = "You need to be signed in to join a server.";
      return;
    }

    const inviteCode = extractInviteCode(trimmedInviteLink);
    if (!inviteCode) {
      joinError = "Enter a valid invite URL or code.";
      return;
    }

    joining = true;
    joinError = null;
    try {
      const response = await invoke<RedeemInviteResponse>(
        "redeem_server_invite",
        { code: inviteCode },
      );

      const server = serverStore.upsertServerFromBackend(response.server);
      serverStore.setActiveServer(server.id);
      inviteLink = "";
      closeModal();
    } catch (error) {
      console.error("Failed to join server:", error);
      joinError =
        error instanceof Error
          ? error.message
          : "Failed to join server. Please try again.";
    } finally {
      joining = false;
    }
  }

  type IconUploadPayload = {
    bytes: number[];
    mimeType?: string;
    name?: string;
  };

  function revokeIconPreview() {
    if (serverIconPreview) {
      URL.revokeObjectURL(serverIconPreview);
      serverIconPreview = null;
    }
  }

  async function createNewServer() {
    if (!trimmedServerName || !$userStore.me) {
      console.error("Cannot create server: missing name or user context.");
      return;
    }

    try {
      const newServerId = `server-${Date.now()}`;

      const serverForBackend = {
        id: newServerId,
        name: trimmedServerName,
        owner_id: $userStore.me.id,
        created_at: new Date().toISOString(),
        channels: [],
        categories: [],
        members: [],
        roles: [],
      };

      let iconPayload: IconUploadPayload | undefined;
      if (serverIcon) {
        const buffer = await serverIcon.arrayBuffer();
        iconPayload = {
          bytes: Array.from(new Uint8Array(buffer)),
          mimeType: serverIcon.type || undefined,
          name: serverIcon.name || undefined,
        } satisfies IconUploadPayload;
      }

      const createdServer: Server = await invoke("create_server", {
        server: serverForBackend,
        icon: iconPayload,
      });

      const newServerForStore: Server = {
        ...createdServer,
        iconUrl:
          createdServer.iconUrl ||
          "https://api.dicebear.com/8.x/bottts-neutral/svg?seed=" +
            encodeURIComponent(createdServer.name),
      };

      serverStore.addServer(newServerForStore);
      serverStore.setActiveServer(newServerForStore.id);
      serverIcon = null;
      revokeIconPreview();
      closeModal();
    } catch (error) {
      console.error("Failed to create server:", error);
    }
  }

  function handleTemplateSelection(template: ServerTemplate) {
    selectedTemplate = template;
    serverName = template.name;
    serverIcon = null;
    serverIconPreview = template.defaultIconUrl ?? null;

    joinError = null;
    modalView = "createServer";
  }

  function clearSelectedTemplate() {
    selectedTemplate = null;
    if (!serverIcon) {
      serverIconPreview = null;
    }
  }

  function handleIconUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      serverIcon = target.files[0];
      revokeIconPreview();
      serverIconPreview = URL.createObjectURL(serverIcon);
      clearSelectedTemplate();
    }
  }

  function closeModal() {
    open = false;
    revokeIconPreview();
  }

  $effect(() => {
    if (!open) {
      onclose();
    }
  });

  $effect(() => {
    if (modalView !== "createServer") {
      serverIcon = null;
      revokeIconPreview();
    }
  });

  onDestroy(() => {
    revokeIconPreview();
  });
</script>

<Dialog bind:open>
  <DialogContent class="sm:max-w-md">
    <DialogHeader class="text-left">
      <DialogTitle>{viewCopy[modalView].title}</DialogTitle>
      <DialogDescription>{viewCopy[modalView].description}</DialogDescription>
    </DialogHeader>

    {#if modalView === "main"}
      <div class="space-y-6">
        <Button class="w-full" onclick={() => (modalView = "createServer")}>
          Create New Server
        </Button>

        <div class="space-y-3">
          <p class="text-xs font-semibold uppercase text-muted-foreground">
            Server Templates
          </p>
          <ScrollArea class="max-h-64 rounded-md border border-border">
            <div class="space-y-2 p-3">
              {#each templates as template (template.id)}
                <button
                  type="button"
                  class={`w-full rounded-md border ${
                    selectedTemplate?.id === template.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card/40"
                  } px-4 py-3 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
                  aria-pressed={selectedTemplate?.id === template.id}
                  onclick={() => handleTemplateSelection(template)}
                >
                  <div class="flex items-start gap-3">
                    {#if template.icon}
                      <span
                        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-lg"
                      >
                        {template.icon}
                      </span>
                    {/if}

                    <div class="space-y-1">
                      <p class="text-sm font-medium text-foreground">
                        {template.name}
                      </p>
                      {#if template.description}
                        <p class="text-xs text-muted-foreground">
                          {template.description}
                        </p>
                      {/if}
                    </div>
                  </div>
                </button>
              {/each}
            </div>
          </ScrollArea>
        </div>

        <Button
          variant="secondary"
          class="w-full"
          onclick={() => {
            joinError = null;
            modalView = "joinLink";
          }}
        >
          Join with Link
        </Button>
      </div>
    {:else if modalView === "joinLink"}
      <form class="space-y-4" onsubmit={joinServer}>
        <div class="space-y-2">
          <Label for="inviteLink">Enter Invite Link</Label>
          <Input
            id="inviteLink"
            type="text"
            placeholder="e.g., https://aegis.com/inv/aegis-community"
            bind:value={inviteLink}
            aria-invalid={joinError ? "true" : "false"}
          />
          {#if joinError}
            <p class="text-sm text-destructive">{joinError}</p>
          {/if}
        </div>

        <div
          class="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground space-y-1"
        >
          <p>Invites should look like:</p>
          <p><span class="font-mono">XyZ1aB7c</span></p>
          <p><span class="font-mono">https://aegis.com/inv/XyZ1aB7c</span></p>
          <p>
            <span class="font-mono">https://aegis.com/inv/gaming-community</span
            >
          </p>
        </div>

        <DialogFooter class="mt-6 flex items-center justify-between">
          <Button
            variant="ghost"
            type="button"
            class="gap-2"
            onclick={() => {
              modalView = "main";
              joinError = null;
            }}
          >
            <ArrowLeft size={14} />
            Back
          </Button>
          <Button type="submit" disabled={joining || !trimmedInviteLink}>
            {#if joining}
              Joining...
            {:else}
              Join
            {/if}
          </Button>
        </DialogFooter>
      </form>
    {:else}
      <div class="space-y-6">
        {#if selectedTemplate}
          <div class="rounded-md border border-primary/40 bg-primary/5 p-4 text-sm">
            <div class="flex items-start justify-between gap-4">
              <div class="space-y-1">
                <p class="font-medium text-foreground">
                  Using template: {selectedTemplate.name}
                </p>
                {#if selectedTemplate.description}
                  <p class="text-xs text-muted-foreground">
                    {selectedTemplate.description}
                  </p>
                {/if}
              </div>
              <Button
                variant="ghost"
                type="button"
                size="sm"
                class="h-7"
                onclick={clearSelectedTemplate}
              >
                Clear
              </Button>
            </div>
          </div>
        {/if}

        <div class="flex flex-col items-center gap-3">
          <label
            for="serverIcon"
            class="flex h-24 w-24 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-border bg-muted/40 transition-colors hover:bg-muted"
          >
            {#if serverIconPreview}
              <img
                src={serverIconPreview}
                alt="Server Icon Preview"
                class="h-full w-full rounded-full object-cover"
              />
            {:else}
              <Upload size={18} />
            {/if}
          </label>
          <input
            id="serverIcon"
            type="file"
            class="hidden"
            accept="image/*"
            onchange={handleIconUpload}
          />
          <span class="text-xs text-muted-foreground"
            >Upload an optional server icon</span
          >
        </div>

        <div class="space-y-2">
          <Label for="serverName">Server Name</Label>
          <Input
            id="serverName"
            type="text"
            placeholder="My Awesome Server"
            bind:value={serverName}
          />
        </div>
      </div>

      <DialogFooter class="mt-6 flex items-center justify-between">
        <Button
          variant="ghost"
          type="button"
          class="gap-2"
          onclick={() => (modalView = "main")}
        >
          <ArrowLeft size={14} />
          Back
        </Button>
        <Button
          type="button"
          onclick={createNewServer}
          disabled={!trimmedServerName}
          data-template-id={selectedTemplateId ?? undefined}
        >
          Create
        </Button>
      </DialogFooter>
    {/if}

    <DialogClose
      class="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus:outline-none"
    >
      <span class="sr-only">Close</span>
      <X class="h-4 w-4" />
    </DialogClose>
  </DialogContent>
</Dialog>
