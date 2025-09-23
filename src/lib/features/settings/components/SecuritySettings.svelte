<script lang="ts">
  import {
    Lock,
    Shield,
    Smartphone,
    Clock,
    Trash2,
    AlertTriangle,
  } from "@lucide/svelte";
  import {
    authStore,
    authPersistenceStore,
  } from "$lib/features/auth/stores/authStore";
  import { toasts } from "$lib/stores/ToastStore";

  let sessionTimeoutMinutes = $state(
    $authPersistenceStore.sessionTimeoutMinutes ?? 60,
  );
  let requireTotpOnUnlock = $state(
    $authPersistenceStore.requireTotpOnUnlock ?? false,
  );
  let trustedDevices = $state(authStore.getTrustedDevices());

  function updateSessionTimeout() {
    authStore.setSessionTimeout(sessionTimeoutMinutes);
    toasts.addToast(
      `Session timeout updated to ${sessionTimeoutMinutes} minutes.`,
      "success",
    );
  }

  function toggleTotpRequirement() {
    authStore.setRequireTotpOnUnlock(requireTotpOnUnlock);
    toasts.addToast(
      `2FA requirement ${requireTotpOnUnlock ? "enabled" : "disabled"} for unlock.`,
      "success",
    );
  }

  function removeTrustedDevice(deviceId: string) {
    authStore.removeTrustedDevice(deviceId);
    trustedDevices = authStore.getTrustedDevices();
    toasts.addToast("Trusted device removed.", "success");
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString();
  }
</script>

<div class="space-y-6">
  <div class="flex items-center gap-3">
    <Shield class="text-primary" size={24} />
    <div>
      <h2 class="text-xl font-semibold">Security Settings</h2>
      <p class="text-sm text-zinc-400">
        Manage your account security and trusted devices.
      </p>
    </div>
  </div>

  <!-- Session Timeout -->
  <div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
    <div class="flex items-center gap-2">
      <Clock size={18} />
      <h3 class="font-semibold">Session Timeout</h3>
    </div>
    <p class="text-sm text-zinc-400">
      Automatically lock your account after a period of inactivity.
    </p>
    <div class="flex items-center gap-4">
      <select
        class="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        bind:value={sessionTimeoutMinutes}
      >
        <option value={15}>15 minutes</option>
        <option value={30}>30 minutes</option>
        <option value={60}>1 hour</option>
        <option value={120}>2 hours</option>
        <option value={480}>8 hours</option>
        <option value={1440}>24 hours</option>
      </select>
      <button
        class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-primary/80"
        onclick={updateSessionTimeout}
      >
        Update
      </button>
    </div>
  </div>

  <!-- 2FA Settings -->
  <div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
    <div class="flex items-center gap-2">
      <Lock size={18} />
      <h3 class="font-semibold">Two-Factor Authentication</h3>
    </div>
    <p class="text-sm text-zinc-400">
      Require authenticator code when unlocking your account.
    </p>
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm">Require 2FA on unlock</p>
        <p class="text-xs text-zinc-500">
          Authenticator codes will be required even when using your password
        </p>
      </div>
      <label class="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          class="sr-only peer"
          bind:checked={requireTotpOnUnlock}
          onchange={toggleTotpRequirement}
        />
        <div
          class="w-11 h-6 bg-zinc-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/25 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"
        ></div>
      </label>
    </div>
  </div>

  <!-- Trusted Devices -->
  <div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
    <div class="flex items-center gap-2">
      <Smartphone size={18} />
      <h3 class="font-semibold">Trusted Devices</h3>
    </div>
    <p class="text-sm text-zinc-400">
      Devices that can access your account without additional verification.
    </p>

    {#if trustedDevices.length === 0}
      <p class="text-sm text-zinc-500 italic">No trusted devices configured.</p>
    {:else}
      <div class="space-y-3">
        {#each trustedDevices as device (device.id)}
          <div
            class="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg"
          >
            <div>
              <p class="font-medium text-sm">{device.name}</p>
              <p class="text-xs text-zinc-500">
                Last used: {formatDate(device.lastUsed)}
              </p>
              {#if device.userAgent}
                <p class="text-xs text-zinc-600 truncate max-w-xs">
                  {device.userAgent}
                </p>
              {/if}
            </div>
            <button
              class="text-red-400 hover:text-red-300 p-2"
              onclick={() => removeTrustedDevice(device.id)}
              title="Remove trusted device"
            >
              <Trash2 size={14} />
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Security Audit -->
  <div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
    <div class="flex items-center gap-2">
      <AlertTriangle size={18} />
      <h3 class="font-semibold">Security Status</h3>
    </div>

    <div class="space-y-2">
      <div class="flex items-center justify-between text-sm">
        <span>Password strength</span>
        <span class="font-medium text-green-400">Strong</span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span>Recovery phrase</span>
        <span class="font-medium text-green-400">Configured</span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span>2FA status</span>
        <span
          class="font-medium"
          class:text-green-400={requireTotpOnUnlock}
          class:text-yellow-400={!requireTotpOnUnlock}
        >
          {requireTotpOnUnlock ? "Enabled" : "Optional"}
        </span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span>Trusted devices</span>
        <span class="font-medium">{trustedDevices.length} configured</span>
      </div>
    </div>
  </div>
</div>
