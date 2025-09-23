<script lang="ts">
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

<h2 class="text-xl font-bold mb-4">Data & Privacy Settings</h2>

<div class="space-y-6">
  <div class="form-control">
    <label class="label cursor-pointer">
      <span class="label-text">Allow Data Collection</span>
      <input
        type="checkbox"
        class="toggle toggle-success toggle-lg"
        bind:checked={allowDataCollection}
      />
    </label>
    <p class="text-sm text-muted-foreground">
      Allow us to collect anonymous data to improve our services.
    </p>
  </div>

  <div class="form-control">
    <label class="label cursor-pointer">
      <span class="label-text">Personalize My Experience</span>
      <input
        type="checkbox"
        class="toggle toggle-success toggle-lg"
        bind:checked={personalizeExperience}
      />
    </label>
    <p class="text-sm text-muted-foreground">
      Receive personalized content and recommendations.
    </p>
  </div>

  <div class="form-control">
    <label class="label cursor-pointer">
      <span class="label-text">Show Online Status</span>
      <input
        type="checkbox"
        class="toggle toggle-success toggle-lg"
        bind:checked={showOnlineStatus}
      />
    </label>
    <p class="text-sm text-muted-foreground">
      Display your online status to your friends.
    </p>
  </div>

  <div class="pt-4 border-t border-zinc-700">
    <h3 class="text-lg font-semibold mb-2">Data Management</h3>
    <button class="btn btn-info" onclick={exportData}> Export My Data </button>
    <p class="text-sm text-muted-foreground mt-2">
      Download a copy of your personal data.
    </p>
  </div>

  <div class="pt-4 border-t border-zinc-700">
    <h3 class="text-lg font-semibold mb-2">Account Deletion</h3>
    <button class="btn btn-error" onclick={confirmAccountDeletion}>
      Delete My Account
    </button>
    <p class="text-sm text-muted-foreground mt-2">
      Permanently delete your account and all associated data.
    </p>
  </div>
</div>
