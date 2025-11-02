<script lang="ts">
  import { onMount } from "svelte";
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
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
  } from "$lib/components/ui/select/index.js";
  import { serverEventsStore } from "$lib/features/servers/stores/serverEventsStore";
  import type { Server } from "$lib/features/servers/models/Server";
  import type { ServerEvent } from "$lib/features/servers/models/ServerEvent";
  import { toasts } from "$lib/stores/ToastStore";

  type ServerEventModalProps = {
    server: Server;
    event?: ServerEvent | null;
    open?: boolean;
    onclose: () => void;
  };

  let {
    server,
    event = null,
    open = $bindable(true),
    onclose,
  }: ServerEventModalProps = $props();

  let title = $state(event?.title ?? "");
  let description = $state(event?.description ?? "");
  let channelId = $state(event?.channelId ?? "");
  let scheduledForLocal = $state<string>(
    formatLocalDateTime(event?.scheduledFor),
  );
  let submitting = $state(false);

  const channelOptions = $derived(
    (server.channels ?? []).map((channel) => ({
      id: channel.id,
      label: channel.name,
    })),
  );

  onMount(() => {
    void serverEventsStore.initialize();
  });

  $effect(() => {
    if (!open) {
      onclose();
    }
  });

  $effect(() => {
    if (event) {
      title = event.title ?? "";
      description = event.description ?? "";
      channelId = event.channelId ?? "";
      scheduledForLocal = formatLocalDateTime(event.scheduledFor);
    } else {
      scheduledForLocal = formatLocalDateTime();
      channelId = server.default_channel_id ?? channelOptions[0]?.id ?? "";
    }
  });

  function formatLocalDateTime(iso?: string) {
    const base = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000);
    if (Number.isNaN(base.getTime())) {
      return "";
    }
    const local = new Date(base.getTime() - base.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function parseToIso(value: string) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  async function handleSubmit() {
    if (!title.trim()) {
      toasts.addToast("Please provide a title for the event.", "warning");
      return;
    }
    const iso = parseToIso(scheduledForLocal);
    if (!iso) {
      toasts.addToast("Please choose a valid date and time.", "warning");
      return;
    }

    submitting = true;
    const payload = {
      serverId: server.id,
      title: title.trim(),
      description: description.trim() ? description.trim() : undefined,
      channelId: channelId || undefined,
      scheduledFor: iso,
    };

    try {
      let result: ServerEvent | null;
      if (event) {
        result = await serverEventsStore.updateEvent({
          eventId: event.id,
          title: payload.title,
          description: payload.description ?? null,
          channelId: payload.channelId ?? null,
          scheduledFor: payload.scheduledFor,
        });
      } else {
        result = await serverEventsStore.createEvent(payload);
      }

      if (result) {
        toasts.addToast(
          event ? "Event updated successfully." : "Event scheduled.",
          "success",
        );
        open = false;
      } else {
        toasts.addToast("Failed to save event. Please try again.", "error");
      }
    } catch (error) {
      console.error("Failed to submit server event", error);
      toasts.addToast(
        "An unexpected error occurred while saving the event.",
        "error",
      );
    } finally {
      submitting = false;
    }
  }
</script>

<Dialog bind:open>
  <DialogContent class="sm:max-w-lg">
    <DialogHeader class="text-left">
      <DialogTitle>{event ? "Edit Event" : "Schedule Server Event"}</DialogTitle
      >
      <DialogDescription>
        Plan announcements, AMAs, or activities for {server.name}. Members will
        see upcoming events in the server overview.
      </DialogDescription>
    </DialogHeader>

    <div class="space-y-4">
      <div class="space-y-2">
        <Label for="server-event-title">Event title</Label>
        <Input
          id="server-event-title"
          bind:value={title}
          placeholder="Community update stream"
          autocomplete="off"
        />
      </div>

      <div class="space-y-2">
        <Label for="server-event-datetime">Start time</Label>
        <Input
          id="server-event-datetime"
          type="datetime-local"
          bind:value={scheduledForLocal}
          min={formatLocalDateTime(new Date().toISOString())}
        />
      </div>

      <div class="space-y-2">
        <Label for="server-event-channel">Channel</Label>
        {#if channelOptions.length > 0}
          <Select type="single" bind:value={channelId}>
            <SelectTrigger class="w-full">
              {#if channelId}
                {channelOptions.find((option) => option.id === channelId)
                  ?.label ?? "Select a channel"}
              {:else}
                Select a channel
              {/if}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No channel (announcement only)</SelectItem>
              {#each channelOptions as option (option.id)}
                <SelectItem value={option.id}>{option.label}</SelectItem>
              {/each}
            </SelectContent>
          </Select>
        {:else}
          <p class="text-sm text-muted-foreground">
            No channels available. Create one from the server settings first.
          </p>
        {/if}
      </div>

      <div class="space-y-2">
        <Label for="server-event-description">Details</Label>
        <Textarea
          id="server-event-description"
          bind:value={description}
          placeholder="Share what members can expect, agendas, or participation details."
          class="min-h-[120px]"
        />
      </div>
    </div>

    <DialogFooter class="pt-4">
      <DialogClose>
        <Button type="button" variant="outline" disabled={submitting}>
          Cancel
        </Button>
      </DialogClose>
      <Button type="button" onclick={handleSubmit} disabled={submitting}>
        {submitting ? "Saving…" : event ? "Save changes" : "Schedule event"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
