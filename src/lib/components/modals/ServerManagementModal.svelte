<script lang="ts">
  import { Plus, CirclePlus, X } from "@lucide/svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { v4 as uuidv4 } from "uuid";
  import { userStore } from "$lib/stores/userStore";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import type { Server } from "$lib/features/servers/models/Server";
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

  let newServerName = $state("");
  let joinServerId = $state("");
  let wasOpen = $state(show);

  let trimmedNewServerName = $derived(newServerName.trim());
  let trimmedJoinServerId = $derived(joinServerId.trim());

  function closeModal() {
    show = false;
  }

  $effect(() => {
    if (!show && wasOpen) {
      onclose?.();
    }

    wasOpen = show;
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
      members: [],
      roles: [],
    };

    try {
      await invoke("create_server", { server: newServer });
      console.log("Server created:", newServer);
      newServerName = "";
      closeModal();
      onserverCreated?.(newServer);
    } catch (error) {
      console.error("Failed to create server:", error);
    }
  }

  async function handleJoinServer() {
    if (!trimmedJoinServerId) return;
    if (!$userStore.me) {
      console.error("User not loaded, cannot join server.");
      return;
    }

    try {
      await invoke("join_server", {
        server_id: trimmedJoinServerId,
        user_id: $userStore.me.id,
      });

      const joinedServer = await serverStore.getServer(trimmedJoinServerId);

      if (!joinedServer) {
        throw new Error(
          `Server details unavailable after joining ${trimmedJoinServerId}.`,
        );
      }

      console.log("Joined server:", joinedServer);
      joinServerId = "";
      closeModal();
      onserverJoined?.(joinedServer);
    } catch (error) {
      console.error("Failed to join server:", error);
    }
  }
</script>

<Dialog bind:open={show}>
  <DialogContent class="sm:max-w-md">
    <DialogHeader class="text-left">
      <DialogTitle>Server Management</DialogTitle>
      <DialogDescription>
        Create a new space or join an existing server using its unique ID.
      </DialogDescription>
    </DialogHeader>

    <div class="space-y-6">
      <section class="space-y-4 rounded-md border border-border bg-card/60 p-4">
        <div class="space-y-1">
          <h3 class="text-sm font-semibold text-foreground">
            Create New Server
          </h3>
          <p class="text-xs text-muted-foreground">
            Spin up a fresh home for your community.
          </p>
        </div>

        <div class="space-y-2">
          <Label for="server-name">Server name</Label>
          <Input
            id="server-name"
            type="text"
            placeholder="Server Name"
            bind:value={newServerName}
          />
        </div>

        <Button
          class="w-full"
          type="button"
          disabled={!trimmedNewServerName}
          onclick={handleCreateServer}
        >
          <Plus class="size-4" />
          Create Server
        </Button>
      </section>

      <section class="space-y-4 rounded-md border border-border bg-card/60 p-4">
        <div class="space-y-1">
          <h3 class="text-sm font-semibold text-foreground">
            Join Existing Server
          </h3>
          <p class="text-xs text-muted-foreground">
            Enter a server ID shared with you.
          </p>
        </div>

        <div class="space-y-2">
          <Label for="server-id">Server ID</Label>
          <Input
            id="server-id"
            type="text"
            placeholder="Server ID"
            bind:value={joinServerId}
          />
        </div>

        <Button
          class="w-full"
          variant="secondary"
          type="button"
          disabled={!trimmedJoinServerId}
          onclick={handleJoinServer}
        >
          <CirclePlus class="size-4" />
          Join Server
        </Button>
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
