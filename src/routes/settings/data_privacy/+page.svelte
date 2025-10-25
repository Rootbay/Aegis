<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";

  let allowDataCollection = $state(true);
  let personalizeExperience = $state(true);
  let showOnlineStatus = $state(true);

  function exportData() {
    alert("Simulating data export... Your data would be downloaded here.");
    console.log("Data export initiated.");
  }

  function confirmAccountDeletion() {
    if (
      confirm(
        "Are you sure you want to delete your account? This action cannot be undone.",
      )
    ) {
      alert("Account deletion simulated.");
      console.log("Account deletion confirmed.");
      // In a real app, this would trigger backend deletion and log out
    }
  }
</script>

<h2 class="text-2xl font-semibold text-zinc-50 mb-4">Data & Privacy Settings</h2>

<div class="space-y-6">
  <div
    class="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="space-y-1">
      <Label for="allow-data-collection" class="text-sm font-medium text-zinc-200">
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
      <Label for="personalize-experience" class="text-sm font-medium text-zinc-200">
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

  <div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
    <h3 class="text-lg font-semibold text-zinc-100">Data management</h3>
    <p class="text-sm text-muted-foreground mt-1">
      Download a copy of your personal data for your records.
    </p>
    <Button class="mt-4" variant="secondary" on:click={exportData}>
      Export my data
    </Button>
  </div>

  <div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
    <h3 class="text-lg font-semibold text-zinc-100">Account deletion</h3>
    <p class="text-sm text-muted-foreground mt-1">
      Permanently delete your account and all associated data.
    </p>
    <Button class="mt-4" variant="destructive" on:click={confirmAccountDeletion}>
      Delete my account
    </Button>
  </div>
</div>
