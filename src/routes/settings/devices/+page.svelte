<script lang="ts">
  import { get } from "svelte/store";
  import { onMount } from "svelte";
  import QRCode from "qrcode";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import {
    settings,
    refreshTrustedDeviceInventory,
    initiateTrustedDeviceProvisioning,
    requestTrustedDeviceLink,
    approveTrustedDeviceRequest,
    declineTrustedDeviceRequest,
    completeTrustedDeviceSync,
    revokeTrustedDevice,
    removeTrustedDevice,
    cancelDeviceProvisioning,
    type TrustedDevice,
    type DeviceProvisioningState,
    type DeviceSyncResult,
    type DevicePairingStage,
  } from "$lib/features/settings/stores/settings";
  import type { PendingDeviceLink } from "$lib/features/settings/stores/deviceTypes";
  import { connectivityStore } from "$lib/stores/connectivityStore";
  import { toasts } from "$lib/stores/ToastStore";
  import { Loader2, RefreshCw, Copy, ShieldCheck, ShieldOff } from "lucide-svelte";

  let trustedDevices = $state<TrustedDevice[]>(get(settings).trustedDevices);
  let provisioning = $state<DeviceProvisioningState[]>([]);
  let provisioningQr = $state<Record<string, string>>({});
  let provisioningLabel = $state("");
  let isGeneratingBundle = $state(false);
  let isInventoryLoading = $state(false);
  let isSubmittingRequest = $state(false);
  let approvalBusy = $state<Record<string, boolean>>({});

  let requestBundleId = $state("");
  let requestCodePhrase = $state("");
  let requestDeviceName = $state("");
  let requestDevicePlatform = $state("");
  let lastRequestedBundleId = $state<string | null>(null);
  let requestStatusMessage = $state<string | null>(null);

  let connectivity = $state(get(connectivityStore));
  let lastSyncResult = $state<DeviceSyncResult | null>(null);
  let syncError = $state<string | null>(null);

  let now = $state(Date.now());

  $effect(() => {
    const unsubscribe = settings.subscribe((value) => {
      trustedDevices = value.trustedDevices;
    });
    return () => unsubscribe();
  });

  $effect(() => {
    const unsubscribe = connectivityStore.subscribe((value) => {
      connectivity = value;
      if (value.trustedDeviceSync.lastError) {
        syncError = value.trustedDeviceSync.lastError;
      }
      if (value.trustedDeviceSync.lastSync) {
        syncError = null;
      }
    });
    return () => unsubscribe();
  });

  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(timer);
  });

  async function loadInventory() {
    try {
      isInventoryLoading = true;
      const snapshot = await refreshTrustedDeviceInventory();
      provisioning = snapshot.provisioning;
      const nextQr: Record<string, string> = {};
      for (const state of snapshot.provisioning) {
        try {
          nextQr[state.bundle.bundleId] = await QRCode.toDataURL(
            state.bundle.qrPayload,
            { scale: 4, margin: 1 },
          );
        } catch (error) {
          console.warn("Failed generating QR code", error);
        }
      }
      provisioningQr = nextQr;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load device inventory.";
      toasts.addToast(message, "error");
    } finally {
      isInventoryLoading = false;
    }
  }

  onMount(() => {
    void loadInventory();
  });

  function stageLabel(stage: DevicePairingStage): string {
    switch (stage) {
      case "bundle_issued":
        return "Waiting to be claimed";
      case "awaiting_approval":
        return "Approval pending";
      case "approved":
        return "Approved";
      case "completed":
        return "Completed";
      case "expired":
        return "Expired";
      default:
        return stage;
    }
  }

  function formatExpiry(expiresAt: string): string {
    const diffMs = new Date(expiresAt).getTime() - now;
    if (Number.isNaN(diffMs)) return "Unknown";
    if (diffMs <= 0) return "Expired";
    const minutes = Math.floor(diffMs / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);
    if (minutes <= 0) {
      return `${seconds}s`;
    }
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }

  async function handleGenerateBundle(event: Event) {
    event.preventDefault();
    if (isGeneratingBundle) return;
    try {
      isGeneratingBundle = true;
      const state = await initiateTrustedDeviceProvisioning(
        provisioningLabel.trim() || undefined,
      );
      if (!provisioningQr[state.bundle.bundleId]) {
        try {
          provisioningQr = {
            ...provisioningQr,
            [state.bundle.bundleId]: await QRCode.toDataURL(state.bundle.qrPayload, {
              scale: 4,
              margin: 1,
            }),
          };
        } catch (error) {
          console.warn("Failed generating QR for new bundle", error);
        }
      }
      await loadInventory();
      provisioningLabel = "";
      toasts.addToast("Provisioning bundle created.", "success");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create provisioning bundle.";
      toasts.addToast(message, "error");
    } finally {
      isGeneratingBundle = false;
    }
  }

  async function handleCancelBundle(bundleId: string) {
    try {
      await cancelDeviceProvisioning(bundleId);
      await loadInventory();
      toasts.addToast("Provisioning bundle cancelled.", "info");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to cancel provisioning bundle.";
      toasts.addToast(message, "error");
    }
  }

  async function handleApprove(bundleId: string) {
    approvalBusy = { ...approvalBusy, [bundleId]: true };
    try {
      await approveTrustedDeviceRequest(bundleId);
      await loadInventory();
      toasts.addToast("Device approved.", "success");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to approve device request.";
      toasts.addToast(message, "error");
    } finally {
      approvalBusy = { ...approvalBusy, [bundleId]: false };
    }
  }

  async function handleDecline(bundleId: string) {
    approvalBusy = { ...approvalBusy, [bundleId]: true };
    try {
      await declineTrustedDeviceRequest(bundleId);
      await loadInventory();
      toasts.addToast("Device request declined.", "info");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to decline device request.";
      toasts.addToast(message, "error");
    } finally {
      approvalBusy = { ...approvalBusy, [bundleId]: false };
    }
  }

  async function handleRequestApproval(event: Event) {
    event.preventDefault();
    const bundle = requestBundleId.trim();
    const code = requestCodePhrase.trim();
    const name = requestDeviceName.trim();
    if (!bundle || !code || !name) {
      toasts.addToast("Bundle ID, code phrase, and device name are required.", "error");
      return;
    }
    try {
      isSubmittingRequest = true;
      const response = await requestTrustedDeviceLink(
        bundle,
        code,
        name,
        requestDevicePlatform.trim() || undefined,
      );
      requestStatusMessage = response.statusMessage ?? "Approval requested.";
      lastRequestedBundleId = bundle;
      toasts.addToast("Approval request sent.", "success");
      await loadInventory();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to request approval.";
      toasts.addToast(message, "error");
    } finally {
      isSubmittingRequest = false;
    }
  }

  async function handleCompleteSync() {
    const bundle = (requestBundleId || lastRequestedBundleId || "").trim();
    if (!bundle) {
      toasts.addToast("Enter the bundle ID you used during provisioning.", "error");
      return;
    }
    try {
      syncError = null;
      lastSyncResult = await completeTrustedDeviceSync(bundle);
      await loadInventory();
      toasts.addToast("Encrypted profile retrieved from trusted device.", "success");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to complete trusted sync.";
      syncError = message;
      toasts.addToast(message, "error");
    }
  }

  async function handleRevoke(device: TrustedDevice) {
    try {
      await revokeTrustedDevice(device.id);
      toasts.addToast(`${device.name} access revoked.`, "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to revoke device.";
      toasts.addToast(message, "error");
    }
  }

  async function handleForget(device: TrustedDevice) {
    try {
      await removeTrustedDevice(device.id);
      toasts.addToast(`${device.name} removed from trusted devices.`, "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to forget device.";
      toasts.addToast(message, "error");
    }
  }

  async function copyPhrase(phrase: string) {
    try {
      await navigator.clipboard.writeText(phrase);
      toasts.addToast("Code phrase copied to clipboard.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Clipboard unavailable.";
      toasts.addToast(message, "error");
    }
  }

  function renderRequestingDevice(request?: PendingDeviceLink | null) {
    if (!request) return "Awaiting scan";
    return `${request.name} (${request.platform})`;
  }
</script>

<div class="space-y-10">
  <div class="space-y-2">
    <h1 class="text-2xl font-semibold text-zinc-50">Trusted devices</h1>
    <p class="text-sm text-muted-foreground">
      Issue short-lived bundles to link secondary hardware and review which devices can
      decrypt your profile without additional challenges.
    </p>
  </div>

  <section class="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-zinc-100">Provision a device</h2>
        <p class="text-sm text-muted-foreground">
          Generate a bundle with a QR code or code phrase to authorize a companion device.
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onclick={() => void loadInventory()}
        aria-label="Refresh provisioning state"
        disabled={isInventoryLoading}
      >
        {#if isInventoryLoading}
          <Loader2 class="h-4 w-4 animate-spin" />
        {:else}
          <RefreshCw class="h-4 w-4" />
        {/if}
      </Button>
    </div>

    <form class="grid gap-3 md:grid-cols-[2fr,auto]" onsubmit={handleGenerateBundle}>
      <div class="space-y-1">
        <Label class="text-sm font-medium text-zinc-200" for="provision-label">
          Optional label
        </Label>
        <Input
          id="provision-label"
          placeholder="Living room relay"
          bind:value={provisioningLabel}
        />
      </div>
      <div class="flex items-end">
        <Button type="submit" disabled={isGeneratingBundle}>
          {#if isGeneratingBundle}
            <Loader2 class="mr-2 h-4 w-4 animate-spin" /> Generating…
          {:else}
            Create provisioning bundle
          {/if}
        </Button>
      </div>
    </form>

    {#if provisioning.length > 0}
      <div class="grid gap-4 md:grid-cols-2">
        {#each provisioning as state (state.bundle.bundleId)}
          <div class="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-base font-semibold text-zinc-100">Bundle {state.bundle.bundleId}</h3>
                <p class="text-xs text-muted-foreground">
                  {stageLabel(state.stage)} · Expires in {formatExpiry(state.bundle.expiresAt)}
                </p>
              </div>
              <Badge variant="secondary">{renderRequestingDevice(state.requestingDevice)}</Badge>
            </div>

            <div class="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/60 p-3 text-sm">
              <p class="font-medium text-zinc-100">Code phrase</p>
              <p class="break-all text-sm text-zinc-300">{state.bundle.codePhrase}</p>
              <Button
                variant="ghost"
                size="sm"
                class="mt-2"
                onclick={() => copyPhrase(state.bundle.codePhrase)}
              >
                <Copy class="mr-2 h-4 w-4" /> Copy phrase
              </Button>
            </div>

            {#if provisioningQr[state.bundle.bundleId]}
              <div class="flex flex-col items-start gap-2">
                <p class="text-xs text-muted-foreground">Scan to authorize</p>
                <img
                  src={provisioningQr[state.bundle.bundleId]}
                  alt={`Provisioning QR ${state.bundle.bundleId}`}
                  class="h-40 w-40 rounded bg-white p-2"
                />
              </div>
            {/if}

            <div class="flex flex-wrap gap-2">
              {#if state.stage === "bundle_issued"}
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => handleCancelBundle(state.bundle.bundleId)}
                >
                  Cancel
                </Button>
              {/if}
              {#if state.stage === "awaiting_approval"}
                <Button
                  size="sm"
                  onclick={() => handleApprove(state.bundle.bundleId)}
                  disabled={approvalBusy[state.bundle.bundleId]}
                >
                  {#if approvalBusy[state.bundle.bundleId]}
                    <Loader2 class="mr-2 h-4 w-4 animate-spin" /> Approving…
                  {:else}
                    <ShieldCheck class="mr-2 h-4 w-4" /> Approve
                  {/if}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => handleDecline(state.bundle.bundleId)}
                  disabled={approvalBusy[state.bundle.bundleId]}
                >
                  {#if approvalBusy[state.bundle.bundleId]}
                    <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                  {:else}
                    <ShieldOff class="mr-2 h-4 w-4" /> Decline
                  {/if}
                </Button>
              {/if}
            </div>

            {#if state.statusMessage}
              <p class="text-xs text-muted-foreground">{state.statusMessage}</p>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <p class="text-sm text-muted-foreground">
        No active provisioning bundles. Generate one above to begin linking another device.
      </p>
    {/if}
  </section>

  <section class="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
    <div class="space-y-1">
      <h2 class="text-lg font-semibold text-zinc-100">Link this device</h2>
      <p class="text-sm text-muted-foreground">
        Paste the bundle ID and code phrase generated on your primary device to request approval.
      </p>
    </div>
    <form class="grid gap-3 md:grid-cols-2" onsubmit={handleRequestApproval}>
      <div class="space-y-1">
        <Label for="bundle-id">Bundle ID</Label>
        <Input
          id="bundle-id"
          placeholder="e.g. 5d1b…"
          bind:value={requestBundleId}
          required
        />
      </div>
      <div class="space-y-1">
        <Label for="code-phrase">Code phrase</Label>
        <Textarea
          id="code-phrase"
          rows={2}
          placeholder="four word phrase"
          bind:value={requestCodePhrase}
          required
        />
      </div>
      <div class="space-y-1">
        <Label for="device-name">Device name</Label>
        <Input
          id="device-name"
          placeholder="My Field Laptop"
          bind:value={requestDeviceName}
          required
        />
      </div>
      <div class="space-y-1">
        <Label for="device-platform">Platform</Label>
        <Input
          id="device-platform"
          placeholder="macOS, Android, etc."
          bind:value={requestDevicePlatform}
        />
      </div>
      <div class="md:col-span-2 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmittingRequest}>
          {#if isSubmittingRequest}
            <Loader2 class="mr-2 h-4 w-4 animate-spin" /> Requesting…
          {:else}
            Request approval
          {/if}
        </Button>
        <Button
          type="button"
          variant="outline"
          onclick={handleCompleteSync}
          disabled={connectivity.trustedDeviceSync.inProgress}
        >
          {#if connectivity.trustedDeviceSync.inProgress}
            <Loader2 class="mr-2 h-4 w-4 animate-spin" /> Syncing…
          {:else}
            Complete sync
          {/if}
        </Button>
      </div>
    </form>

    {#if requestStatusMessage}
      <p class="text-sm text-muted-foreground">{requestStatusMessage}</p>
    {/if}

    {#if lastSyncResult}
      <div class="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
        <p class="font-medium">Trusted device sync completed.</p>
        <p>
          Retrieved encrypted profile for {lastSyncResult.approvedDevice.name}. Messages synced:
          {lastSyncResult.messageCount}
        </p>
      </div>
    {/if}

    {#if syncError}
      <div class="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
        <p class="font-medium">Sync failed</p>
        <p>{syncError}</p>
      </div>
    {/if}

    {#if connectivity.trustedDeviceSync.lastSync}
      <p class="text-xs text-muted-foreground">
        Last sync completed {new Date(connectivity.trustedDeviceSync.lastSync).toLocaleString()}.
      </p>
    {/if}
  </section>

  <section class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold text-zinc-100">Authorized hardware</h2>
      <p class="text-sm text-muted-foreground">
        Devices that can decrypt your profile without an additional recovery flow.
      </p>
    </div>

    {#if trustedDevices.length === 0}
      <p class="text-sm text-muted-foreground">
        No trusted devices yet. Provision one above to allow seamless access from companion hardware.
      </p>
    {:else}
      <div class="space-y-3">
        {#each trustedDevices as device (device.id)}
          <div class="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div class="flex items-center gap-3">
                <h3 class="text-base font-semibold text-zinc-100">{device.name}</h3>
                <Badge variant={device.status === "active" ? "secondary" : "outline"}>
                  {device.status.replace("_", " ")}
                </Badge>
              </div>
              <p class="text-xs text-muted-foreground">
                {device.platform} · Linked {new Date(device.addedAt).toLocaleString()} · Last seen
                {" "}
                {new Date(device.lastSeen).toLocaleString()}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onclick={() => handleRevoke(device)}
                disabled={device.status === "revoked"}
              >
                Revoke
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onclick={() => handleForget(device)}
              >
                Forget
              </Button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>
