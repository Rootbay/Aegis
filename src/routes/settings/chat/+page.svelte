<script lang="ts">
  import { get } from "svelte/store";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Slider } from "$lib/components/ui/slider/index.js";
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
  } from "$lib/components/ui/select/index.js";
  import {
    settings,
    setMessageDensity,
    setEphemeralMessageDuration,
    setLinkPreviewsEnabled,
    setResilientFileTransferEnabled,
    setWalkieTalkieVoiceMemosEnabled,
    setAutoDownloadMediaEnabled,
  } from "$lib/features/settings/stores/settings";

  let messageDensity = $state(get(settings).messageDensity);
  let ephemeralDuration = $state<[number]>([
    get(settings).ephemeralMessageDuration,
  ]);
  let enableLinkPreviews = $state(get(settings).enableLinkPreviews);
  let enableResilientFileTransfer = $state(
    get(settings).enableResilientFileTransfer,
  );
  let enableWalkieTalkieVoiceMemos = $state(
    get(settings).enableWalkieTalkieVoiceMemos,
  );
  let autoDownloadMedia = $state(get(settings).autoDownloadMedia);

  const ephemeralDurationLabel = $derived(() => {
    const minutes = ephemeralDuration[0] ?? 0;
    if (minutes === 0) {
      return "Keep indefinitely";
    }
    if (minutes < 60) {
      return `${minutes} minute${minutes === 1 ? "" : "s"}`;
    }
    const hours = minutes / 60;
    if (Number.isInteger(hours)) {
      return `${hours} hour${hours === 1 ? "" : "s"}`;
    }
    return `${minutes} minutes`;
  });

  function handleDensityChange(value: string) {
    if (value === "cozy" || value === "compact") {
      messageDensity = value;
    }
  }

  $effect(() => {
    const unsubscribe = settings.subscribe((value) => {
      messageDensity = value.messageDensity;
      ephemeralDuration = [value.ephemeralMessageDuration];
      enableLinkPreviews = value.enableLinkPreviews;
      enableResilientFileTransfer = value.enableResilientFileTransfer;
      enableWalkieTalkieVoiceMemos = value.enableWalkieTalkieVoiceMemos;
      autoDownloadMedia = value.autoDownloadMedia;
    });

    return () => unsubscribe();
  });

  $effect(() => {
    const current = get(settings);
    if (current.messageDensity !== messageDensity) {
      setMessageDensity(messageDensity);
    }

    const duration = ephemeralDuration[0] ?? current.ephemeralMessageDuration;
    if (current.ephemeralMessageDuration !== duration) {
      setEphemeralMessageDuration(duration);
    }

    if (current.enableLinkPreviews !== enableLinkPreviews) {
      setLinkPreviewsEnabled(enableLinkPreviews);
    }

    if (current.enableResilientFileTransfer !== enableResilientFileTransfer) {
      setResilientFileTransferEnabled(enableResilientFileTransfer);
    }

    if (
      current.enableWalkieTalkieVoiceMemos !== enableWalkieTalkieVoiceMemos
    ) {
      void setWalkieTalkieVoiceMemosEnabled(enableWalkieTalkieVoiceMemos);
    }

    if (current.autoDownloadMedia !== autoDownloadMedia) {
      setAutoDownloadMediaEnabled(autoDownloadMedia);
    }
  });
</script>

<h1 class="text-2xl font-semibold text-zinc-50 mb-6">Chat Settings</h1>

<div class="space-y-6 max-w-2xl">
  <div class="space-y-2">
    <Label for="message-density" class="text-sm font-medium text-zinc-200">
      Message density
    </Label>
    <Select
      type="single"
      value={messageDensity}
      onValueChange={handleDensityChange}
    >
      <SelectTrigger id="message-density" class="w-full capitalize">
        <span data-slot="select-value" class="flex-1 text-left capitalize">
          {messageDensity}
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="cozy">Cozy</SelectItem>
        <SelectItem value="compact">Compact</SelectItem>
      </SelectContent>
    </Select>
    <p class="text-xs text-muted-foreground">
      Adjust how much padding and metadata appear around each message bubble.
    </p>
  </div>

  <div class="space-y-2">
    <Label
      for="ephemeral-duration"
      class="text-sm font-medium text-zinc-200"
    >
      Ephemeral message lifetime
    </Label>
    <Slider
      id="ephemeral-duration"
      type="single"
      min={0}
      max={720}
      step={5}
      bind:value={ephemeralDuration}
    />
    <p class="text-xs text-muted-foreground">
      Messages self-destruct after {ephemeralDurationLabel}. Set to 0 to keep
      history.
    </p>
  </div>

  <div class="space-y-4">
    <div
      class="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
    >
      <div class="space-y-1">
        <Label for="link-previews" class="text-sm font-medium text-zinc-200">
          Enable link previews
        </Label>
        <p class="text-xs text-muted-foreground">
          Automatically resolve shared links for richer media cards.
        </p>
      </div>
      <Switch
        id="link-previews"
        class="shrink-0"
        bind:checked={enableLinkPreviews}
        aria-label="Toggle link previews"
      />
    </div>

    <div
      class="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
    >
      <div class="space-y-1">
        <Label
          for="resilient-file-transfer"
          class="text-sm font-medium text-zinc-200"
        >
          Resilient file transfer
        </Label>
        <p class="text-xs text-muted-foreground">
          Retry and resume large file uploads across unstable links.
        </p>
      </div>
      <Switch
        id="resilient-file-transfer"
        class="shrink-0"
        bind:checked={enableResilientFileTransfer}
        aria-label="Toggle resilient file transfer"
      />
    </div>

    <div
      class="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
    >
      <div class="space-y-1">
        <Label
          for="walkie-talkie"
          class="text-sm font-medium text-zinc-200"
        >
          Walkie-talkie voice memos
        </Label>
        <p class="text-xs text-muted-foreground">
          Keep quick push-to-talk messages available in direct chats.
        </p>
      </div>
      <Switch
        id="walkie-talkie"
        class="shrink-0"
        bind:checked={enableWalkieTalkieVoiceMemos}
        aria-label="Toggle walkie-talkie voice memos"
      />
    </div>

    <div
      class="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
    >
      <div class="space-y-1">
        <Label
          for="auto-download-media"
          class="text-sm font-medium text-zinc-200"
        >
          Auto-download media
        </Label>
        <p class="text-xs text-muted-foreground">
          Save received images and clips for offline playback automatically.
        </p>
      </div>
      <Switch
        id="auto-download-media"
        class="shrink-0"
        bind:checked={autoDownloadMedia}
        aria-label="Toggle automatic media downloads"
      />
    </div>
  </div>
</div>
