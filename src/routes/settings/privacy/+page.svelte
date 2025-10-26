<script lang="ts">
  import { get } from "svelte/store";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import {
    settings,
    setReadReceiptsEnabled,
    setTypingIndicatorsEnabled,
  } from "$lib/features/settings/stores/settings";

  let enableReadReceipts = $state(
    get(settings).enableReadReceipts,
  );
  let enableTypingIndicators = $state(
    get(settings).enableTypingIndicators,
  );

  $effect(() => {
    const unsubscribe = settings.subscribe((value) => {
      enableReadReceipts = value.enableReadReceipts;
      enableTypingIndicators = value.enableTypingIndicators;
    });

    return () => unsubscribe();
  });

  $effect(() => {
    const current = get(settings);
    if (current.enableReadReceipts !== enableReadReceipts) {
      setReadReceiptsEnabled(enableReadReceipts);
    }
    if (current.enableTypingIndicators !== enableTypingIndicators) {
      setTypingIndicatorsEnabled(enableTypingIndicators);
    }
  });
</script>

<h1 class="text-2xl font-semibold text-zinc-50">Privacy Settings</h1>

<div class="space-y-4">
  <div
    class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="mr-4">
      <Label
        for="enable-read-receipts"
        class="text-sm font-medium text-zinc-200"
      >
        Enable read receipts
      </Label>
      <p class="text-xs text-muted-foreground">
        Allow friends to see when you have viewed their messages.
      </p>
    </div>
    <Switch
      id="enable-read-receipts"
      class="shrink-0"
      bind:checked={enableReadReceipts}
      aria-label="Toggle read receipts"
    />
  </div>

  <div
    class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="mr-4">
      <Label
        for="enable-typing-indicators"
        class="text-sm font-medium text-zinc-200"
      >
        Enable typing indicators
      </Label>
      <p class="text-xs text-muted-foreground">
        Share when you are actively typing a response.
      </p>
    </div>
    <Switch
      id="enable-typing-indicators"
      class="shrink-0"
      bind:checked={enableTypingIndicators}
      aria-label="Toggle typing indicators"
    />
  </div>
</div>
