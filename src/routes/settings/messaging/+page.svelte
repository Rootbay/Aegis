<script lang="ts">
  import { get } from "svelte/store";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import {
    settings,
    setShowMessageAvatars,
    setShowMessageTimestamps,
  } from "$lib/features/settings/stores/settings";

  let showAvatars = $state(get(settings).showMessageAvatars);
  let showTimestamps = $state(get(settings).showMessageTimestamps);

  $effect(() => {
    const unsubscribe = settings.subscribe((value) => {
      showAvatars = value.showMessageAvatars;
      showTimestamps = value.showMessageTimestamps;
    });

    return () => unsubscribe();
  });

  $effect(() => {
    const current = get(settings);
    if (current.showMessageAvatars !== showAvatars) {
      setShowMessageAvatars(showAvatars);
    }
    if (current.showMessageTimestamps !== showTimestamps) {
      setShowMessageTimestamps(showTimestamps);
    }
  });
</script>

<h1 class="text-2xl font-semibold text-zinc-50">Messaging Settings</h1>

<div class="space-y-4">
  <div
    class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="mr-4">
      <Label for="show-avatars" class="text-sm font-medium text-zinc-200">
        Show avatars
      </Label>
      <p class="text-xs text-muted-foreground">
        Display profile photos next to chat messages.
      </p>
    </div>
    <Switch
      id="show-avatars"
      class="shrink-0"
      bind:checked={showAvatars}
      aria-label="Toggle avatars"
    />
  </div>

  <div
    class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="mr-4">
      <Label for="show-timestamps" class="text-sm font-medium text-zinc-200">
        Show timestamps
      </Label>
      <p class="text-xs text-muted-foreground">
        Include message delivery times in the conversation view.
      </p>
    </div>
    <Switch
      id="show-timestamps"
      class="shrink-0"
      bind:checked={showTimestamps}
      aria-label="Toggle timestamps"
    />
  </div>
</div>
