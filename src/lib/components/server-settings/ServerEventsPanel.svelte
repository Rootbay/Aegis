<script lang="ts">
  import { onMount } from "svelte";
  import { CalendarPlus, Clock3, MapPin, CircleMinus } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import ServerEventModal from "$lib/components/modals/ServerEventModal.svelte";
  import { serverEventsStore } from "$lib/features/servers/stores/serverEventsStore";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import type { Server } from "$lib/features/servers/models/Server";
  import type { ServerEvent } from "$lib/features/servers/models/ServerEvent";
  import { toasts } from "$lib/stores/ToastStore";

  type Props = {
    server: Server;
  };

  let { server }: Props = $props();

  let showModal = $state(false);
  let editingEvent = $state<ServerEvent | null>(null);

  const eventsForServer = $derived(
    $serverEventsStore.activeServerId === server.id
      ? $serverEventsStore.events
      : [],
  );

  const upcomingEvents = $derived(
    eventsForServer.filter((event) => event.status !== "cancelled"),
  );

  const pastEvents = $derived(
    eventsForServer.filter((event) => event.status === "cancelled"),
  );

  const formatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  onMount(async () => {
    await serverEventsStore.initialize();
    if ($serverStore.activeServerId !== server.id) {
      serverStore.setActiveServer(server.id);
    }
    await serverEventsStore.refresh(server.id);
  });

  function openCreateModal() {
    editingEvent = null;
    showModal = true;
  }

  function openEditModal(event: ServerEvent) {
    editingEvent = event;
    showModal = true;
  }

  async function cancelEvent(event: ServerEvent) {
    if (!confirm(`Cancel "${event.title}"?`)) {
      return;
    }
    const updated = await serverEventsStore.cancelEvent(event.id);
    if (updated) {
      toasts.addToast("Event cancelled.", "info");
    } else {
      toasts.addToast("Unable to cancel event.", "error");
    }
  }

  function closeModal() {
    showModal = false;
    editingEvent = null;
  }

  function renderSchedule(event: ServerEvent) {
    try {
      const date = new Date(event.scheduledFor);
      if (Number.isNaN(date.getTime())) {
        return "Scheduled time unknown";
      }
      return formatter.format(date);
    } catch (error) {
      console.warn("Failed to format event timestamp", error);
      return event.scheduledFor;
    }
  }

  function findChannelName(channelId?: string) {
    if (!channelId) return "Announcement";
    return (
      server.channels?.find((channel) => channel.id === channelId)?.name ??
      "Unknown channel"
    );
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-lg font-semibold text-foreground">Server Events</h3>
      <p class="text-sm text-muted-foreground">
        Plan and manage scheduled gatherings, streams, or announcements.
      </p>
    </div>
    <Button onclick={openCreateModal} class="gap-2">
      <CalendarPlus class="size-4" />
      Schedule Event
    </Button>
  </div>

  <div class="space-y-4">
    {#if $serverEventsStore.loading && eventsForServer.length === 0}
      <Card class="border-dashed">
        <CardHeader>
          <CardTitle class="text-base">Loading events…</CardTitle>
          <CardDescription>
            Hang tight while we fetch the latest schedule.
          </CardDescription>
        </CardHeader>
      </Card>
    {:else if upcomingEvents.length === 0 && pastEvents.length === 0}
      <Card class="border-dashed">
        <CardHeader>
          <CardTitle class="text-base">No events yet</CardTitle>
          <CardDescription>
            Schedule your first event to build momentum with your community.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onclick={openCreateModal} class="gap-2">
            <CalendarPlus class="size-4" />
            Create an event
          </Button>
        </CardContent>
      </Card>
    {:else}
      {#if upcomingEvents.length > 0}
        <section class="space-y-3">
          <h4
            class="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Upcoming
          </h4>
          <div class="space-y-3">
            {#each upcomingEvents as event (event.id)}
              <Card>
                <CardHeader class="space-y-2">
                  <div
                    class="flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <CardTitle class="text-base text-foreground">
                        {event.title}
                      </CardTitle>
                      <CardDescription>{renderSchedule(event)}</CardDescription>
                    </div>
                    <div class="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onclick={() => openEditModal(event)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onclick={() => cancelEvent(event)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent class="space-y-3">
                  <div
                    class="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Clock3 class="size-4" />
                    <span>{renderSchedule(event)}</span>
                  </div>
                  <div
                    class="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <MapPin class="size-4" />
                    <span>{findChannelName(event.channelId)}</span>
                  </div>
                  {#if event.description}
                    <Separator />
                    <p class="text-sm leading-relaxed text-foreground/90">
                      {event.description}
                    </p>
                  {/if}
                </CardContent>
              </Card>
            {/each}
          </div>
        </section>
      {/if}

      {#if pastEvents.length > 0}
        <section class="space-y-3">
          <h4
            class="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Cancelled
          </h4>
          <div class="space-y-3">
            {#each pastEvents as event (event.id)}
              <Card class="bg-muted/40">
                <CardHeader class="space-y-1">
                  <CardTitle
                    class="text-base text-foreground flex items-center gap-2"
                  >
                    <CircleMinus class="size-4 text-muted-foreground" />
                    {event.title}
                  </CardTitle>
                  <CardDescription>{renderSchedule(event)}</CardDescription>
                </CardHeader>
                {#if event.description}
                  <CardContent>
                    <p class="text-sm text-muted-foreground">
                      {event.description}
                    </p>
                  </CardContent>
                {/if}
              </Card>
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </div>

  {#if $serverEventsStore.error}
    <Card class="border border-destructive/40 bg-destructive/10">
      <CardHeader>
        <CardTitle class="text-base text-destructive"
          >Failed to load events</CardTitle
        >
        <CardDescription class="text-destructive/80">
          {$serverEventsStore.error}
        </CardDescription>
      </CardHeader>
    </Card>
  {/if}
</div>

{#if showModal}
  <ServerEventModal
    {server}
    event={editingEvent ?? undefined}
    onclose={closeModal}
  />
{/if}
