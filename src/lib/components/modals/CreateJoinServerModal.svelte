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

  let trimmedInviteLink = $derived(inviteLink.trim());
  let trimmedServerName = $derived(serverName.trim());

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

  const templates = [
    { id: "template-1", name: "Gaming Community" },
    { id: "template-2", name: "Study Group" },
    { id: "template-3", name: "Local Meetup" },
    { id: "template-4", name: "Development Team" },
    { id: "template-5", name: "Family & Friends" },
    { id: "template-6", name: "Project Collaboration" },
    { id: "template-7", name: "Book Club" },
    { id: "template-8", name: "Fitness Group" },
    { id: "template-9", name: "Travel Buddies" },
    { id: "template-10", name: "Art & Design" },
  ];

  async function joinServer() {
    const serverIdToJoin = trimmedInviteLink;
    if (!serverIdToJoin || !$userStore.me) {
      console.error("Cannot join server: missing invite link or user context.");
      return;
    }

    try {
      await invoke("join_server", {
        server_id: serverIdToJoin,
        user_id: $userStore.me.id,
      });

      const newServer: Server = {
        id: serverIdToJoin,
        name: `Joined Server (${serverIdToJoin})`,
        iconUrl:
          "https://api.dicebear.com/8.x/bottts-neutral/svg?seed=" +
          encodeURIComponent(serverIdToJoin),
        owner_id: "unknown",
        members: [$userStore.me],
        channels: [],
        roles: [],
      };

      serverStore.addServer(newServer);
      serverStore.setActiveServer(newServer.id);
      closeModal();
    } catch (error) {
      console.error("Failed to join server:", error);
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
        members: [],
        roles: [],
      };

      const createdServer: Server = await invoke("create_server", {
        server: serverForBackend,
      });

      const newServerForStore: Server = {
        ...createdServer,
        iconUrl:
          serverIconPreview ||
          "https://api.dicebear.com/8.x/bottts-neutral/svg?seed=" +
            encodeURIComponent(createdServer.name),
      };

      serverStore.addServer(newServerForStore);
      serverStore.setActiveServer(newServerForStore.id);
      closeModal();
    } catch (error) {
      console.error("Failed to create server:", error);
    }
  }

  function handleIconUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      serverIcon = target.files[0];
      serverIconPreview = URL.createObjectURL(serverIcon);
    }
  }

  function closeModal() {
    open = false;
  }

  $effect(() => {
    if (!open) {
      onclose();
    }
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
                  class="w-full rounded-md border border-border bg-card/40 px-4 py-3 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span class="text-sm font-medium text-foreground"
                    >{template.name}</span
                  >
                </button>
              {/each}
            </div>
          </ScrollArea>
        </div>

        <Button
          variant="secondary"
          class="w-full"
          onclick={() => (modalView = "joinLink")}
        >
          Join with Link
        </Button>
      </div>
    {:else if modalView === "joinLink"}
      <div class="space-y-4">
        <div class="space-y-2">
          <Label for="inviteLink">Enter Invite Link</Label>
          <Input
            id="inviteLink"
            type="text"
            placeholder="e.g., https://aegis.com/inv/aegis-community"
            bind:value={inviteLink}
          />
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
          onclick={joinServer}
          disabled={!trimmedInviteLink}
        >
          Join
        </Button>
      </DialogFooter>
    {:else}
      <div class="space-y-6">
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
