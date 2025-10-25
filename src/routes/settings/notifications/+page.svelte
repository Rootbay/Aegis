<script lang="ts">
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
  } from "$lib/components/ui/select/index.js";

  let enableNotifications = $state(true);
  let notificationSound = $state("default");

  const notificationSoundLabel = $derived(
    notificationSound === "none" ? "None" : "Default",
  );
</script>

<h1 class="text-2xl font-semibold text-zinc-50">Notification Settings</h1>

<div class="space-y-6">
  <div
    class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="mr-4">
      <Label
        for="enable-notifications"
        class="text-sm font-medium text-zinc-200"
      >
        Enable notifications
      </Label>
      <p class="text-xs text-muted-foreground">
        Receive alerts when important activity happens.
      </p>
    </div>
    <Switch
      id="enable-notifications"
      class="shrink-0"
      bind:checked={enableNotifications}
      aria-label="Enable notifications"
    />
  </div>

  <div class="space-y-2 max-w-xs">
    <Label
      for="notification-sound"
      class="text-sm font-medium text-zinc-200"
    >
      Notification sound
    </Label>
    <Select
      type="single"
      value={notificationSound}
      onValueChange={(value: string) => (notificationSound = value)}
    >
      <SelectTrigger id="notification-sound" class="w-full">
        <span data-slot="select-value" class="flex-1 text-left">
          {notificationSoundLabel}
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="default">Default</SelectItem>
        <SelectItem value="none">None</SelectItem>
      </SelectContent>
    </Select>
  </div>
</div>
