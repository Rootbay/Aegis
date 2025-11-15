<script lang="ts">
  import {
    Lock,
    Shield,
    Smartphone,
    Clock,
    Trash2,
    TriangleAlert,
  } from "@lucide/svelte";
  import {
    authStore,
    authPersistenceStore,
  } from "$lib/features/auth/stores/authStore";
  import { toasts } from "$lib/stores/ToastStore";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
  } from "$lib/components/ui/select/index.js";

  const sessionTimeoutOptions = [
    { value: 15, label: "15 minutes" },
    { value: 30, label: "30 minutes" },
    { value: 60, label: "1 hour" },
    { value: 120, label: "2 hours" },
    { value: 480, label: "8 hours" },
    { value: 1440, label: "24 hours" },
  ];

  let sessionTimeoutMinutes = $state(
    $authPersistenceStore.sessionTimeoutMinutes ?? 60,
  );
  let requireTotpOnUnlock = $state(
    $authPersistenceStore.requireTotpOnUnlock ?? false,
  );
  let trustedDevices = $state(authStore.getTrustedDevices());

  const sessionTimeoutLabel = $derived.by(() => {
    const matchedOption = sessionTimeoutOptions.find(
      (option) => option.value === sessionTimeoutMinutes,
    );
    return matchedOption ? matchedOption.label : `${sessionTimeoutMinutes} minutes`;
  });

  function handleSessionTimeoutChange(value: string) {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      sessionTimeoutMinutes = numeric;
    }
  }

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

  $effect(() => {
    const persisted = $authPersistenceStore.requireTotpOnUnlock ?? false;
    if (persisted !== requireTotpOnUnlock) {
      requireTotpOnUnlock = persisted;
    }
  });

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

  <div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
    <div class="flex items-center gap-2">
      <Clock size={18} />
      <h3 class="font-semibold">Session Timeout</h3>
    </div>
    <p class="text-sm text-zinc-400">
      Automatically lock your account after a period of inactivity.
    </p>
    <div class="flex flex-wrap items-center gap-4">
      <Select
        type="single"
        value={`${sessionTimeoutMinutes}`}
        onValueChange={handleSessionTimeoutChange}
      >
        <SelectTrigger id="session-timeout" class="w-40">
          <span data-slot="select-value" class="flex-1 text-left">
            {sessionTimeoutLabel}
          </span>
        </SelectTrigger>
        <SelectContent>
          {#each sessionTimeoutOptions as option}
            <SelectItem value={`${option.value}`}>{option.label}</SelectItem>
          {/each}
        </SelectContent>
      </Select>
      <Button variant="default" size="sm" onclick={updateSessionTimeout}>
        Update
      </Button>
    </div>
  </div>

  <div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
    <div class="flex items-center gap-2">
      <Lock size={18} />
      <h3 class="font-semibold">Two-Factor Authentication</h3>
    </div>
    <p class="text-sm text-zinc-400">
      Require authenticator code when unlocking your account.
    </p>
    <div class="flex items-center justify-between gap-4">
      <div class="space-y-1">
        <Label
          for="require-totp"
          class="text-sm font-medium text-zinc-200"
        >
          Require 2FA on unlock
        </Label>
        <p class="text-xs text-zinc-500">
          Authenticator codes will be required even when using your password
        </p>
      </div>
      <Switch
        id="require-totp"
        class="shrink-0"
        bind:checked={requireTotpOnUnlock}
        aria-label="Require two-factor authentication on unlock"
        onclick={toggleTotpRequirement}
      />
    </div>
  </div>

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
            <Button
              variant="ghost"
              size="icon"
              class="text-red-400 hover:text-red-300"
              onclick={() => removeTrustedDevice(device.id)}
              title="Remove trusted device"
              aria-label="Remove trusted device"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
    <div class="flex items-center gap-2">
      <TriangleAlert size={18} />
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
