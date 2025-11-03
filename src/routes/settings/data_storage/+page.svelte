<script lang="ts">
  import { get } from "svelte/store";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Slider } from "$lib/components/ui/slider/index.js";
  import {
    settings,
    setAutoDownloadMediaEnabled,
    setKeepMediaDuration,
    setClearCacheOnExit,
    setEphemeralMessageDuration,
  } from "$lib/features/settings/stores/settings";

  let autoDownload = $state(get(settings).autoDownloadMedia);
  let keepMediaDays = $state(get(settings).keepMediaDuration);
  let clearCache = $state(get(settings).clearCacheOnExit);
  let ephemeralMinutes = $state(
    get(settings).ephemeralMessageDuration.toString(),
  );

  const keepMediaLabel = $derived(
    () => `${keepMediaDays} day${keepMediaDays === 1 ? "" : "s"}`,
  );

  $effect(() => {
    const unsubscribe = settings.subscribe((value) => {
      autoDownload = value.autoDownloadMedia;
      if (keepMediaDays !== value.keepMediaDuration) {
        keepMediaDays = value.keepMediaDuration;
      }
      clearCache = value.clearCacheOnExit;
      ephemeralMinutes = value.ephemeralMessageDuration.toString();
    });

    return () => unsubscribe();
  });

  $effect(() => {
    const current = get(settings);
    if (current.autoDownloadMedia !== autoDownload) {
      setAutoDownloadMediaEnabled(autoDownload);
    }
    if (current.keepMediaDuration !== keepMediaDays) {
      setKeepMediaDuration(keepMediaDays);
    }
    if (current.clearCacheOnExit !== clearCache) {
      setClearCacheOnExit(clearCache);
    }
  });

  function handleEphemeralBlur() {
    const parsed = Number.parseInt(ephemeralMinutes, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      setEphemeralMessageDuration(parsed);
    } else {
      ephemeralMinutes = get(settings).ephemeralMessageDuration.toString();
    }
  }
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-semibold text-zinc-50">Data & storage</h1>
    <p class="text-sm text-muted-foreground">
      Fine-tune how long cached content sticks around and how downloads are
      handled.
    </p>
  </div>

  <section
    class="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200">
          Auto-download incoming media
        </Label>
        <p class="text-xs text-muted-foreground">
          Fetch attachments immediately on trusted networks for faster viewing.
        </p>
      </div>
      <Switch
        class="shrink-0"
        bind:checked={autoDownload}
        aria-label="Toggle automatic media downloads"
      />
    </div>

    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <Label class="text-sm font-medium text-zinc-200">
          Keep downloaded media
        </Label>
        <span class="text-xs text-muted-foreground">{keepMediaLabel}</span>
      </div>
      <Slider
        type="single"
        min={1}
        max={90}
        step={1}
        bind:value={keepMediaDays}
        aria-label="Media retention period"
      />
      <p class="text-xs text-muted-foreground">
        Media older than the selected window will be purged on next launch.
      </p>
    </div>

    <div class="space-y-2">
      <Label class="text-sm font-medium text-zinc-200"
        >Ephemeral message timer (minutes)</Label
      >
      <Input
        type="number"
        min={0}
        bind:value={ephemeralMinutes}
        onblur={handleEphemeralBlur}
        aria-label="Ephemeral message duration in minutes"
      />
      <p class="text-xs text-muted-foreground">
        When set above zero, new direct messages expire after this duration.
      </p>
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200">
          Clear cache on exit
        </Label>
        <p class="text-xs text-muted-foreground">
          Remove temporary files each time you close the app to minimise
          footprint.
        </p>
      </div>
      <Switch
        class="shrink-0"
        bind:checked={clearCache}
        aria-label="Toggle cache clearing"
      />
    </div>
  </section>
</div>
