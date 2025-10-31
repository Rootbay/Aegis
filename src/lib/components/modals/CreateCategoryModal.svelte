<svelte:options runes={true} />

<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { toasts } from "$lib/stores/ToastStore";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import type { Server } from "$lib/features/servers/models/Server";
  import type { ChannelCategory } from "$lib/features/channels/models/ChannelCategory";

  type BackendChannelCategory = {
    id: string;
    server_id: string;
    name: string;
    position: number;
    created_at: string;
  };

  type CreateCategoryModalProps = {
    server: Server;
    open?: boolean;
    onclose: () => void;
  };

  let {
    server,
    open = $bindable(true),
    onclose,
  }: CreateCategoryModalProps = $props();

  let name = $state("");
  let submitting = $state(false);

  const mapCategory = (category: BackendChannelCategory): ChannelCategory => ({
    id: category.id,
    server_id: category.server_id,
    name: category.name,
    position: Number.isFinite(category.position) ? category.position : 0,
    created_at: category.created_at,
  });

  function resetForm() {
    name = "";
    submitting = false;
  }

  function closeModal() {
    open = false;
  }

  $effect(() => {
    if (!open) {
      onclose();
      resetForm();
    }
  });

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      toasts.addToast("Category name cannot be empty.", "warning");
      return;
    }

    submitting = true;
    try {
      const backendCategory = await invoke<BackendChannelCategory>(
        "create_channel_category",
        {
          request: {
            server_id: server.id,
            name: trimmed,
          },
        },
      );

      const mapped = mapCategory(backendCategory);
      serverStore.addCategoryToServer(server.id, mapped);
      toasts.addToast("Category created.", "success");
      closeModal();
    } catch (error) {
      console.error("Failed to create category", error);
      const message =
        error instanceof Error ? error.message : "Failed to create category.";
      toasts.addToast(message, "error");
    } finally {
      submitting = false;
    }
  }
</script>

<Dialog bind:open>
  <DialogContent class="sm:max-w-md">
    <DialogHeader class="text-left">
      <DialogTitle>Create Channel Category</DialogTitle>
      <DialogDescription>
        Group related channels together to keep {server.name} organized.
      </DialogDescription>
    </DialogHeader>

    <form class="space-y-4" onsubmit={handleSubmit}>
      <div class="space-y-2">
        <Label for="category-name">Category name</Label>
        <Input
          id="category-name"
          placeholder="Announcements"
          bind:value={name}
          autocomplete="off"
          required
        />
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onclick={closeModal}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating..." : "Create"}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
