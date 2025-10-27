<script lang="ts">
  import { get } from "svelte/store";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
  } from "$lib/components/ui/select/index.js";
  import {
    settings,
    setEnableNewMessageNotifications,
    setNotificationSound,
    setEnableGroupMessageNotifications,
  } from "$lib/features/settings/stores/settings";

  const soundOptions = [
    { value: "Default Silent Chime", label: "Default Silent Chime" },
    { value: "Gentle Aurora", label: "Gentle Aurora" },
    { value: "Nebula Ping", label: "Nebula Ping" },
    { value: "None", label: "None" },
  ];

  let enableNotifications = $state(
    get(settings).enableNewMessageNotifications,
  );
  let enableGroupNotifications = $state(
    get(settings).enableGroupMessageNotifications,
  );
  let notificationSound = $state(get(settings).notificationSound);

  const notificationSoundLabel = $derived(() => {
    const option = soundOptions.find((item) => item.value === notificationSound);
    return option ? option.label : notificationSound;
  });

  $effect(() => {
    const unsubscribe = settings.subscribe((value) => {
      enableNotifications = value.enableNewMessageNotifications;
      enableGroupNotifications = value.enableGroupMessageNotifications;
      notificationSound = value.notificationSound;
    });

    return () => unsubscribe();
  });

  $effect(() => {
    const current = get(settings);

    if (current.enableNewMessageNotifications !== enableNotifications) {
      setEnableNewMessageNotifications(enableNotifications);
    }

    if (current.enableGroupMessageNotifications !== enableGroupNotifications) {
      setEnableGroupMessageNotifications(enableGroupNotifications);
    }

    if (current.notificationSound !== notificationSound) {
      setNotificationSound(notificationSound);
    }
  });
</script>

<h1 class="text-2xl font-semibold text-zinc-50">Notification Settings</h1>

<div class="space-y-6">
  <section
    class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="mr-4">
      <Label
        for="enable-notifications"
        class="text-sm font-medium text-zinc-200"
      >
        Enable new message notifications
      </Label>
      <p class="text-xs text-muted-foreground">
        Receive alerts when direct messages arrive.
      </p>
    </div>
    <Switch
      id="enable-notifications"
      class="shrink-0"
      bind:checked={enableNotifications}
      aria-label="Toggle new message notifications"
    />
  </section>

  <section
    class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="mr-4">
      <Label
        for="enable-group-notifications"
        class="text-sm font-medium text-zinc-200"
      >
        Enable group notifications
      </Label>
      <p class="text-xs text-muted-foreground">
        Stay informed about activity across your group conversations.
      </p>
    </div>
    <Switch
      id="enable-group-notifications"
      class="shrink-0"
      bind:checked={enableGroupNotifications}
      aria-label="Toggle group message notifications"
    />
  </section>

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
        {#each soundOptions as option}
          <SelectItem value={option.value}>{option.label}</SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </div>
</div>
