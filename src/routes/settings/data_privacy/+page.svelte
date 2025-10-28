<script lang="ts">
  import { get } from "svelte/store";
  import { invoke } from "@tauri-apps/api/core";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { toasts } from "$lib/stores/ToastStore";
  import {
    settings,
    setAllowDataCollection,
    setPersonalizeExperience,
    setShareOnlineStatus,
    setShareUsageAnalytics,
    setShareCrashReports,
  } from "$lib/features/settings/stores/settings";

  let allowDataCollection = $state(get(settings).allowDataCollection);
  let personalizeExperience = $state(get(settings).personalizeExperience);
  let showOnlineStatus = $state(get(settings).shareOnlineStatus);
  let shareUsageAnalytics = $state(get(settings).shareUsageAnalytics);
  let shareCrashReports = $state(get(settings).shareCrashReports);

  $effect(() => {
    const unsubscribe = settings.subscribe((value) => {
      allowDataCollection = value.allowDataCollection;
      personalizeExperience = value.personalizeExperience;
      showOnlineStatus = value.shareOnlineStatus;
      shareUsageAnalytics = value.shareUsageAnalytics;
      shareCrashReports = value.shareCrashReports;
    });

    return () => unsubscribe();
  });

  $effect(() => {
    const current = get(settings);
    if (current.allowDataCollection !== allowDataCollection) {
      setAllowDataCollection(allowDataCollection);
    }
    if (current.personalizeExperience !== personalizeExperience) {
      setPersonalizeExperience(personalizeExperience);
    }
    if (current.shareOnlineStatus !== showOnlineStatus) {
      setShareOnlineStatus(showOnlineStatus);
    }
    if (current.shareUsageAnalytics !== shareUsageAnalytics) {
      setShareUsageAnalytics(shareUsageAnalytics);
    }
    if (current.shareCrashReports !== shareCrashReports) {
      setShareCrashReports(shareCrashReports);
    }
  });

  function getErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  async function exportData() {
    try {
      const filePath = await invoke<string>("export_user_data");
      toasts.addToast(`Personal data export created at ${filePath}`, "success");
    } catch (error) {
      console.error("Failed to export user data", error);
      toasts.addToast(
        `Failed to export your data: ${getErrorMessage(error)}`,
        "error",
      );
    }
  }

  async function requestAccountDeletion() {
    try {
      const requestId = await invoke<string>("request_account_deletion");
      toasts.addToast(requestId, "warning");
    } catch (error) {
      console.error("Failed to request account deletion", error);
      toasts.addToast(
        `Unable to submit account deletion request: ${getErrorMessage(error)}`,
        "error",
      );
    }
  }
</script>

<h2 class="text-2xl font-semibold text-zinc-50 mb-4">
  Data & Privacy Settings
</h2>

<div class="space-y-6">
  <div
    class="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="space-y-1">
      <Label
        for="allow-data-collection"
        class="text-sm font-medium text-zinc-200"
      >
        Allow data collection
      </Label>
      <p class="text-xs text-muted-foreground">
        Allow us to collect anonymous data to improve our services.
      </p>
    </div>
    <Switch
      id="allow-data-collection"
      class="shrink-0"
      bind:checked={allowDataCollection}
      aria-label="Toggle data collection"
    />
  </div>

  <div
    class="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="space-y-1">
      <Label
        for="personalize-experience"
        class="text-sm font-medium text-zinc-200"
      >
        Personalize my experience
      </Label>
      <p class="text-xs text-muted-foreground">
        Receive tailored content and recommendations.
      </p>
    </div>
    <Switch
      id="personalize-experience"
      class="shrink-0"
      bind:checked={personalizeExperience}
      aria-label="Toggle personalization"
    />
  </div>

  <div
    class="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="space-y-1">
      <Label for="show-online-status" class="text-sm font-medium text-zinc-200">
        Show online status
      </Label>
      <p class="text-xs text-muted-foreground">
        Display your availability to your friends.
      </p>
    </div>
    <Switch
      id="show-online-status"
      class="shrink-0"
      bind:checked={showOnlineStatus}
      aria-label="Toggle online status visibility"
    />
  </div>

  <div
    class="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="space-y-1">
      <Label
        for="share-usage-analytics"
        class="text-sm font-medium text-zinc-200"
      >
        Share usage analytics
      </Label>
      <p class="text-xs text-muted-foreground">
        Send anonymized feature usage metrics to help prioritize improvements.
      </p>
    </div>
    <Switch
      id="share-usage-analytics"
      class="shrink-0"
      bind:checked={shareUsageAnalytics}
      aria-label="Toggle usage analytics sharing"
    />
  </div>

  <div
    class="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="space-y-1">
      <Label
        for="share-crash-reports"
        class="text-sm font-medium text-zinc-200"
      >
        Share crash diagnostics
      </Label>
      <p class="text-xs text-muted-foreground">
        Automatically upload logs when the app encounters critical errors.
      </p>
    </div>
    <Switch
      id="share-crash-reports"
      class="shrink-0"
      bind:checked={shareCrashReports}
      aria-label="Toggle crash report sharing"
    />
  </div>

  <div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
    <h3 class="text-lg font-semibold text-zinc-100">Data management</h3>
    <p class="text-sm text-muted-foreground mt-1">
      Download a copy of your personal data for your records.
    </p>
    <Button class="mt-4" variant="secondary" onclick={exportData}>
      Export my data
    </Button>
  </div>

  <div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
    <h3 class="text-lg font-semibold text-zinc-100">Account deletion</h3>
    <p class="text-sm text-muted-foreground mt-1">
      Permanently delete your account and all associated data.
    </p>
    <Button class="mt-4" variant="destructive" onclick={requestAccountDeletion}>
      Delete my account
    </Button>
  </div>
</div>
