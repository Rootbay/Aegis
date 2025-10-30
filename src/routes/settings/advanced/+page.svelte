<script lang="ts">
  import { get } from "svelte/store";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    settings,
    defaultSettings,
    setEnableCrossDeviceSync,
    setEnableDarkMode,
    setEnableIntelligentMeshRouting,
    setEnableNewMessageNotifications,
    setEnableGroupMessageNotifications,
    triggerPanicWipe,
    updateAppSetting,
    type AppSettings,
  } from "$lib/features/settings/stores/settings";
  import { toasts } from "$lib/stores/ToastStore";

  const advancedFlags = [
    {
      key: "enableCommandPalette" as const,
      label: "Enable command palette",
      description:
        "Use the universal launcher (Ctrl+K) to jump anywhere in the app.",
    },
    {
      key: "enableBatteryAware" as const,
      label: "Battery-aware optimisations",
      description:
        "Automatically pause heavy background tasks when battery is low.",
    },
    {
      key: "enablePanicButton" as const,
      label: "Emergency panic button",
      description:
        "Quickly lock and hide the workspace when security is a concern.",
    },
    {
      key: "enableSpamPrevention" as const,
      label: "Adaptive spam prevention",
      description:
        "Filter suspicious DMs and invites using heuristic analysis.",
    },
    {
      key: "customTheme" as const,
      label: "Allow experimental theming",
      description: "Enable developer tools for loading custom CSS themes.",
    },
  ];

  let advancedState = $state({
    enableCommandPalette: get(settings).enableCommandPalette,
    enableBatteryAware: get(settings).enableBatteryAware,
    enablePanicButton: get(settings).enablePanicButton,
    enableSpamPrevention: get(settings).enableSpamPrevention,
    customTheme: get(settings).customTheme,
  });

  let enableCrossDeviceSync = $state(get(settings).enableCrossDeviceSync);
  let enableMeshRouting = $state(get(settings).enableIntelligentMeshRouting);
  let enableDarkMode = $state(get(settings).enableDarkMode);
  let enableNewNotifications = $state(
    get(settings).enableNewMessageNotifications,
  );
  let enableGroupNotifications = $state(
    get(settings).enableGroupMessageNotifications,
  );
  let panicWipePending = $state(false);

  $effect(() => {
    const unsubscribe = settings.subscribe((value) => {
      advancedState = {
        enableCommandPalette: value.enableCommandPalette,
        enableBatteryAware: value.enableBatteryAware,
        enablePanicButton: value.enablePanicButton,
        enableSpamPrevention: value.enableSpamPrevention,
        customTheme: value.customTheme,
      };
      enableCrossDeviceSync = value.enableCrossDeviceSync;
      enableMeshRouting = value.enableIntelligentMeshRouting;
      enableDarkMode = value.enableDarkMode;
      enableNewNotifications = value.enableNewMessageNotifications;
      enableGroupNotifications = value.enableGroupMessageNotifications;
    });

    return () => unsubscribe();
  });

  function toggleFlag(key: keyof typeof advancedState, value: boolean) {
    if (advancedState[key] === value) return;
    advancedState = { ...advancedState, [key]: value };
    updateAppSetting(key as keyof AppSettings, value);
  }

  $effect(() => {
    const current = get(settings);
    if (current.enableCrossDeviceSync !== enableCrossDeviceSync) {
      setEnableCrossDeviceSync(enableCrossDeviceSync);
    }
    if (current.enableIntelligentMeshRouting !== enableMeshRouting) {
      void setEnableIntelligentMeshRouting(enableMeshRouting);
    }
    if (current.enableDarkMode !== enableDarkMode) {
      setEnableDarkMode(enableDarkMode);
    }
    if (current.enableNewMessageNotifications !== enableNewNotifications) {
      setEnableNewMessageNotifications(enableNewNotifications);
    }
    if (current.enableGroupMessageNotifications !== enableGroupNotifications) {
      setEnableGroupMessageNotifications(enableGroupNotifications);
    }
  });

  function resetAdvancedFlags() {
    advancedFlags.forEach((flag) => {
      const defaultValue =
        defaultSettings[flag.key as keyof typeof advancedState];
      toggleFlag(flag.key, defaultValue as boolean);
    });
  }

  async function handlePanicWipeTrigger() {
    if (panicWipePending) return;

    panicWipePending = true;
    try {
      const executed = await triggerPanicWipe();
      if (executed) {
        toasts.addToast(
          "Local Aegis data purged. The workspace has been reset.",
          "success",
        );
      }
    } catch (error) {
      console.error("Failed to execute panic wipe", error);
      const message =
        error instanceof Error
          ? error.message
          : "Panic wipe failed. Check application logs.";
      toasts.addToast(message, "error");
    } finally {
      panicWipePending = false;
    }
  }
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-semibold text-zinc-50">Advanced Controls</h1>
    <p class="text-sm text-muted-foreground">
      Configure power-user features and experimental behaviours. Changes apply
      instantly.
    </p>
  </div>

  <section
    class="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    {#each advancedFlags as flag (flag.key)}
      <div class="flex items-center justify-between gap-4">
        <div>
          <Label
            for={`advanced-${flag.key}`}
            class="text-sm font-medium text-zinc-200"
          >
            {flag.label}
          </Label>
          <p class="text-xs text-muted-foreground">{flag.description}</p>
        </div>
        <Switch
          id={`advanced-${flag.key}`}
          class="shrink-0"
          checked={advancedState[flag.key]}
          on:change={(event) =>
            toggleFlag(flag.key, (event.target as HTMLInputElement).checked)}
          aria-label={flag.label}
        />
      </div>
    {/each}

    {#if advancedState.enablePanicButton}
      <div class="space-y-3 rounded-lg border border-red-900/60 bg-red-950/40 p-4">
        <div>
          <p class="text-sm font-semibold text-red-200">Emergency panic wipe</p>
          <p class="text-xs text-red-200/80">
            Immediately halt network activity and erase cached secrets from this
            device.
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          class="w-full sm:w-auto"
          disabled={panicWipePending}
          onclick={handlePanicWipeTrigger}
        >
          {panicWipePending ? "Purging…" : "Trigger panic wipe"}
        </Button>
      </div>
    {/if}
  </section>

  <section
    class="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200">
          Prioritise cross-device sync
        </Label>
        <p class="text-xs text-muted-foreground">
          Keep preferences synchronised across multiple devices even on metered
          networks.
        </p>
      </div>
      <Switch
        class="shrink-0"
        bind:checked={enableCrossDeviceSync}
        aria-label="Toggle cross-device sync"
      />
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200">
          Intelligent mesh routing
        </Label>
        <p class="text-xs text-muted-foreground">
          Optimise routing decisions using experimental mesh heuristics.
        </p>
      </div>
      <Switch
        class="shrink-0"
        bind:checked={enableMeshRouting}
        aria-label="Toggle intelligent mesh routing"
      />
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200">
          Force dark mode theme
        </Label>
        <p class="text-xs text-muted-foreground">
          Overrides system preference and keeps the UI in the dark palette.
        </p>
      </div>
      <Switch
        class="shrink-0"
        bind:checked={enableDarkMode}
        aria-label="Toggle dark mode"
      />
    </div>
  </section>

  <section
    class="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200">
          Notify for direct messages
        </Label>
        <p class="text-xs text-muted-foreground">
          Keep DM alerts active even when in do-not-disturb mode.
        </p>
      </div>
      <Switch
        class="shrink-0"
        bind:checked={enableNewNotifications}
        aria-label="Toggle direct message notifications"
      />
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-sm font-medium text-zinc-200">
          Notify for group mentions
        </Label>
        <p class="text-xs text-muted-foreground">
          Receive alerts when channels ping you with @mentions.
        </p>
      </div>
      <Switch
        class="shrink-0"
        bind:checked={enableGroupNotifications}
        aria-label="Toggle group notification overrides"
      />
    </div>

    <Button variant="outline" size="sm" onclick={resetAdvancedFlags}>
      Restore defaults
    </Button>
  </section>
</div>
