<script lang="ts">
  import { get } from "svelte/store";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Slider } from "$lib/components/ui/slider/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import {
    settings,
    setAutoDownloadUpdates,
    setIncludePreReleaseUpdates,
    setRemindAboutUpdates,
    setUpdateReminderInterval,
  } from "$lib/features/settings/stores/settings";

  const highlights = [
    {
      version: "2.4.0",
      title: "Mesh-aware notifications",
      description:
        "Notifications now route over low-power relays automatically.",
    },
    {
      version: "2.3.2",
      title: "Offline message queue",
      description:
        "Drafts sync reliably when devices briefly lose connectivity.",
    },
    {
      version: "2.3.0",
      title: "Adaptive theming",
      description: "Appearance now honours per-space accent colours.",
    },
  ];

  let autoDownload = $state(get(settings).autoDownloadUpdates);
  let includePreRelease = $state(get(settings).includePreReleaseUpdates);
  let remindAboutUpdates = $state(get(settings).remindAboutUpdates);
  let reminderInterval = $state(get(settings).updateReminderIntervalDays);

  const reminderLabel = $derived(
    () =>
      `${Math.round(reminderInterval)} day${
        Math.round(reminderInterval) === 1 ? "" : "s"
      }`,
  );

  $effect(() => {
    const unsubscribe = settings.subscribe((value) => {
      autoDownload = value.autoDownloadUpdates;
      includePreRelease = value.includePreReleaseUpdates;
      remindAboutUpdates = value.remindAboutUpdates;
      if (reminderInterval !== value.updateReminderIntervalDays) {
        reminderInterval = value.updateReminderIntervalDays;
      }
    });
    return () => unsubscribe();
  });

  $effect(() => {
    const current = get(settings);
    if (current.autoDownloadUpdates !== autoDownload) {
      setAutoDownloadUpdates(autoDownload);
    }
    if (current.includePreReleaseUpdates !== includePreRelease) {
      setIncludePreReleaseUpdates(includePreRelease);
    }
    if (current.remindAboutUpdates !== remindAboutUpdates) {
      setRemindAboutUpdates(remindAboutUpdates);
    }
    if (current.updateReminderIntervalDays !== reminderInterval) {
      setUpdateReminderInterval(reminderInterval);
    }
  });
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-semibold text-zinc-50">Release preferences</h1>
    <p class="text-sm text-muted-foreground">
      Control how Aegis updates are delivered and stay informed about recent
      improvements.
    </p>
  </div>

  <section
    class="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200"
          >Automatically install updates</Label
        >
        <p class="text-xs text-muted-foreground">
          Download and stage stable releases as soon as they become available.
        </p>
      </div>
      <Switch
        class="shrink-0"
        bind:checked={autoDownload}
        aria-label="Toggle automatic updates"
      />
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200"
          >Include beta releases</Label
        >
        <p class="text-xs text-muted-foreground">
          Get early access to experimental builds before they reach everyone.
        </p>
      </div>
      <Switch
        class="shrink-0"
        bind:checked={includePreRelease}
        aria-label="Toggle pre-release updates"
      />
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200">Reminder cadence</Label
        >
        <p class="text-xs text-muted-foreground">
          Choose how frequently to receive a summary if updates are pending.
        </p>
      </div>
      <div class="w-40">
        <Slider
          type="single"
          min={1}
          max={30}
          step={1}
          bind:value={reminderInterval}
          aria-label="Update reminder interval"
        />
        <p class="mt-2 text-right text-xs text-muted-foreground">
          {reminderLabel}
        </p>
      </div>
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200"
          >Send missed update summaries</Label
        >
        <p class="text-xs text-muted-foreground">
          Receive a digest email whenever you skip an available release cycle.
        </p>
      </div>
      <Switch
        class="shrink-0"
        bind:checked={remindAboutUpdates}
        aria-label="Toggle update reminders"
      />
    </div>
  </section>

  <section
    class="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <h2 class="text-lg font-semibold text-zinc-100">Latest highlights</h2>
    <ul class="space-y-3">
      {#each highlights as entry (entry.version)}
        <li class="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
          <div class="flex items-center gap-2">
            <Badge variant="outline">{entry.version}</Badge>
            <span class="text-sm font-medium text-zinc-200">{entry.title}</span>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">{entry.description}</p>
        </li>
      {/each}
    </ul>
  </section>
</div>
