<script lang="ts">
  import { onMount } from "svelte";
  import { LoaderCircle, Pencil, Plus, Save, Trash2, X } from "@lucide/svelte";
  import type { Server } from "$lib/features/servers/models/Server";
  import type { Webhook } from "$lib/features/servers/models/Webhook";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { serverWebhooksStore } from "$lib/features/servers/stores/serverWebhooksStore";

  type Props = {
    server: Server;
  };

  let { server }: Props = $props();

  let createForm = $state({ name: "", url: "", channelId: "" });
  let editingId = $state<string | null>(null);
  let editForm = $state({ name: "", url: "", channelId: "" });
  let submittingCreate = $state(false);
  let submittingEdit = $state(false);
  let deletingId = $state<string | null>(null);

  const formatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const availableChannels = $derived(
    (server.channels ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  const activeWebhooks = $derived(
    $serverWebhooksStore.activeServerId === server.id
      ? $serverWebhooksStore.webhooks
      : [],
  );

  const isLoading = $derived(
    $serverWebhooksStore.loading &&
      $serverWebhooksStore.activeServerId === server.id,
  );

  const errorMessage = $derived(
    $serverWebhooksStore.activeServerId === server.id
      ? $serverWebhooksStore.error
      : null,
  );

  onMount(async () => {
    await serverWebhooksStore.initialize();
    if ($serverStore.activeServerId !== server.id) {
      serverStore.setActiveServer(server.id);
    }
    await serverWebhooksStore.refresh(server.id);
  });

  function resetCreateForm() {
    createForm = { name: "", url: "", channelId: "" };
  }

  function beginEdit(webhook: Webhook) {
    editingId = webhook.id;
    editForm = {
      name: webhook.name,
      url: webhook.url,
      channelId: webhook.channelId ?? "",
    };
  }

  function cancelEdit() {
    editingId = null;
    editForm = { name: "", url: "", channelId: "" };
  }

  function channelLabel(channelId?: string) {
    if (!channelId) {
      return "Server default";
    }
    return (
      availableChannels.find((channel) => channel.id === channelId)?.name ??
      "Unknown channel"
    );
  }

  function formatTimestamp(value: string) {
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return value;
      }
      return formatter.format(date);
    } catch (error) {
      console.warn("Failed to format timestamp", error);
      return value;
    }
  }

  async function handleCreate(event: SubmitEvent) {
    event.preventDefault();
    const name = createForm.name.trim();
    const url = createForm.url.trim();
    if (!name || !url) {
      return;
    }
    submittingCreate = true;
    const created = await serverWebhooksStore.createWebhook({
      name,
      url,
      channelId: createForm.channelId ? createForm.channelId : undefined,
      serverId: server.id,
    });
    submittingCreate = false;
    if (created) {
      resetCreateForm();
    }
  }

  async function handleUpdate(event: SubmitEvent) {
    event.preventDefault();
    if (!editingId) {
      return;
    }
    const name = editForm.name.trim();
    const url = editForm.url.trim();
    if (!name || !url) {
      return;
    }
    submittingEdit = true;
    const updated = await serverWebhooksStore.updateWebhook(
      editingId,
      {
        name,
        url,
        channelId:
          editForm.channelId === "" ? null : (editForm.channelId ?? undefined),
      },
      server.id,
    );
    submittingEdit = false;
    if (updated) {
      cancelEdit();
    }
  }

  async function handleDelete(webhook: Webhook) {
    if (deletingId) {
      return;
    }
    if (!confirm(`Delete webhook "${webhook.name}"?`)) {
      return;
    }
    deletingId = webhook.id;
    const deleted = await serverWebhooksStore.deleteWebhook(
      webhook.id,
      server.id,
    );
    deletingId = null;
    if (deleted && editingId === webhook.id) {
      cancelEdit();
    }
  }

  const isEditing = (webhook: Webhook) => editingId === webhook.id;
</script>

<div class="space-y-6">
  <div class="flex flex-col gap-2">
    <div>
      <h3 class="text-xl font-semibold text-white">Webhooks</h3>
      <p class="text-sm text-muted-foreground">
        Create incoming webhooks and manage their delivery targets.
      </p>
    </div>
    {#if errorMessage}
      <div
        class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        {errorMessage}
      </div>
    {/if}
  </div>

  <form
    class="grid gap-3 rounded-lg border border-border/60 bg-muted/40 p-4"
    onsubmit={handleCreate}
  >
    <h4
      class="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
    >
      Create a new webhook
    </h4>
    <div class="grid gap-2 sm:grid-cols-2">
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-muted-foreground">Webhook name</span>
        <input
          type="text"
          class="rounded-md border border-border bg-background/70 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          bind:value={createForm.name}
          placeholder="Build notifications"
          required
        />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-muted-foreground">Target channel</span>
        <select
          class="rounded-md border border-border bg-background/70 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          bind:value={createForm.channelId}
        >
          <option value="">Server default</option>
          {#each availableChannels as channel (channel.id)}
            <option value={channel.id}>{channel.name}</option>
          {/each}
        </select>
      </label>
    </div>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-muted-foreground">Callback URL</span>
      <input
        type="url"
        class="rounded-md border border-border bg-background/70 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        bind:value={createForm.url}
        placeholder="https://example.com/webhook"
        required
      />
    </label>
    <button
      type="submit"
      class="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-70"
      disabled={submittingCreate}
    >
      {#if submittingCreate}
        <LoaderCircle class="h-4 w-4 animate-spin" />
        Creating…
      {:else}
        <Plus class="h-4 w-4" />
        Create webhook
      {/if}
    </button>
  </form>

  <div class="rounded-lg border border-border/60 bg-muted/30">
    <div
      class="flex items-center justify-between border-b border-border/40 px-4 py-3"
    >
      <h4
        class="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Existing webhooks
      </h4>
      {#if isLoading}
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle class="h-4 w-4 animate-spin" />
          Syncing…
        </div>
      {/if}
    </div>
    {#if activeWebhooks.length === 0}
      <div class="px-4 py-8 text-center text-sm text-muted-foreground">
        No webhooks configured yet.
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full min-w-[540px] text-left text-sm">
          <thead
            class="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"
          >
            <tr>
              <th class="px-4 py-3 font-medium">Name</th>
              <th class="px-4 py-3 font-medium">Channel</th>
              <th class="px-4 py-3 font-medium">URL</th>
              <th class="px-4 py-3 font-medium">Updated</th>
              <th class="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each activeWebhooks as webhook (webhook.id)}
              <tr class="border-t border-border/30">
                <td class="px-4 py-3 align-top">
                  {#if isEditing(webhook)}
                    <input
                      type="text"
                      class="w-full rounded-md border border-border bg-background/70 px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                      bind:value={editForm.name}
                      required
                    />
                  {:else}
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-foreground"
                        >{webhook.name}</span
                      >
                      {#if webhook.pending}
                        <span
                          class="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300"
                        >
                          Pending…
                        </span>
                      {/if}
                    </div>
                  {/if}
                </td>
                <td class="px-4 py-3 align-top text-muted-foreground">
                  {#if isEditing(webhook)}
                    <select
                      class="w-full rounded-md border border-border bg-background/70 px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                      bind:value={editForm.channelId}
                    >
                      <option value="">Server default</option>
                      {#each availableChannels as channel (channel.id)}
                        <option value={channel.id}>{channel.name}</option>
                      {/each}
                    </select>
                  {:else}
                    {channelLabel(webhook.channelId)}
                  {/if}
                </td>
                <td class="px-4 py-3 align-top text-muted-foreground">
                  {#if isEditing(webhook)}
                    <input
                      type="url"
                      class="w-full rounded-md border border-border bg-background/70 px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                      bind:value={editForm.url}
                      required
                    />
                  {:else}
                    <span class="break-all text-xs text-muted-foreground/90">
                      {webhook.url}
                    </span>
                  {/if}
                </td>
                <td class="px-4 py-3 align-top text-muted-foreground">
                  {formatTimestamp(webhook.updatedAt)}
                </td>
                <td class="px-4 py-3 align-top">
                  {#if isEditing(webhook)}
                    <form
                      class="flex justify-end gap-2"
                      onsubmit={handleUpdate}
                    >
                      <button
                        type="submit"
                        class="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/80 disabled:opacity-70"
                        disabled={submittingEdit}
                      >
                        {#if submittingEdit}
                          <LoaderCircle class="h-3.5 w-3.5 animate-spin" />
                          Saving…
                        {:else}
                          <Save class="h-3.5 w-3.5" />
                          Save
                        {/if}
                      </button>
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/60"
                        onclick={cancelEdit}
                      >
                        <X class="h-3.5 w-3.5" />
                        Cancel
                      </button>
                    </form>
                  {:else}
                    <div class="flex justify-end gap-2">
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/60"
                        onclick={() => beginEdit(webhook)}
                        disabled={deletingId === webhook.id}
                      >
                        <Pencil class="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 rounded-md bg-destructive/90 px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive disabled:opacity-60"
                        onclick={() => handleDelete(webhook)}
                        disabled={deletingId === webhook.id}
                      >
                        {#if deletingId === webhook.id}
                          <LoaderCircle class="h-3.5 w-3.5 animate-spin" />
                          Removing…
                        {:else}
                          <Trash2 class="h-3.5 w-3.5" />
                          Delete
                        {/if}
                      </button>
                    </div>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
