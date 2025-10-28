<script lang="ts">
  import { get } from "svelte/store";
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import {
    settings,
    refreshConnectedAccountsFromBackend,
    linkConnectedAccount,
    unlinkConnectedAccount,
    type ConnectedAccount,
  } from "$lib/features/settings/stores/settings";
  import { toasts } from "$lib/stores/ToastStore";

  const providers = [
    { label: "Matrix", value: "matrix", scopes: ["presence", "chat"] },
    { label: "Signal", value: "signal", scopes: ["chat"] },
    { label: "ActivityPub", value: "activitypub", scopes: ["status"] },
    { label: "GitHub", value: "github", scopes: ["profile", "repos"] },
  ];

  let selectedProvider = $state(providers[0].value);
  let handle = $state("");
  let linking = $state(false);
  let removingAccountId = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let connectedAccounts = $state<ConnectedAccount[]>(
    get(settings).connectedAccounts,
  );

  const selectedProviderMeta = $derived(
    () => providers.find((provider) => provider.value === selectedProvider)!,
  );

  $effect(() => {
    const unsubscribe = settings.subscribe((value) => {
      connectedAccounts = value.connectedAccounts;
    });

    return () => unsubscribe();
  });

  onMount(() => {
    void refreshConnectedAccountsFromBackend();
  });

  async function handleLinkAccount(event: Event) {
    event.preventDefault();
    if (linking) return;
    linking = true;
    errorMessage = null;
    try {
      const account = await linkConnectedAccount(selectedProvider, handle);
      toasts.addToast(
        `Linked ${account.provider} account for ${account.username}.`,
        "success",
      );
      handle = "";
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to link account.";
      errorMessage = message;
      toasts.addToast(message, "error");
    } finally {
      linking = false;
    }
  }

  async function handleUnlinkAccount(account: ConnectedAccount) {
    if (removingAccountId) return;
    removingAccountId = account.id;
    try {
      await unlinkConnectedAccount(account.id);
      toasts.addToast(
        `Disconnected ${account.provider} · ${account.username}.`,
        "info",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to disconnect.";
      toasts.addToast(message, "error");
    } finally {
      removingAccountId = null;
    }
  }
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-semibold text-zinc-50">Connected accounts</h1>
    <p class="text-sm text-muted-foreground">
      Link trusted networks so contacts can find you across platforms. Only
      explicitly granted scopes are synchronised.
    </p>
  </div>

  <form
    class="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
    onsubmit={handleLinkAccount}
  >
    <div class="flex items-center justify-between gap-4">
      <div class="space-y-1">
        <Label class="text-sm font-medium text-zinc-200"
          >Provider</Label
        >
        <select
          class="w-40 rounded-md border border-zinc-700 bg-zinc-950/80 px-2 py-1 text-sm text-zinc-100"
          bind:value={selectedProvider}
        >
          {#each providers as provider (provider.value)}
            <option value={provider.value}>{provider.label}</option>
          {/each}
        </select>
        <p class="text-xs text-muted-foreground">
          Grants: {selectedProviderMeta.scopes.join(", ")}
        </p>
      </div>
      <div class="flex-1 space-y-1">
        <Label class="text-sm font-medium text-zinc-200"
          >Account handle</Label
        >
        <Input
          placeholder="@username or user@example.com"
          bind:value={handle}
          minlength={2}
          required
          aria-label="Account handle"
        />
        <p class="text-xs text-muted-foreground">
          Handles are encrypted locally. Only hashed identifiers are shared with
          Aegis peers.
        </p>
      </div>
      <Button type="submit" disabled={linking} aria-busy={linking}>
        {linking ? "Linking…" : "Link"}
      </Button>
    </div>
    {#if errorMessage}
      <p class="text-xs text-red-400">{errorMessage}</p>
    {/if}
  </form>

  <section
    class="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
  >
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-zinc-100">Linked integrations</h2>
      <Badge variant="secondary">{connectedAccounts.length}</Badge>
    </div>
    <Separator />

    {#if connectedAccounts.length === 0}
      <p class="text-sm text-muted-foreground">
        No external accounts are connected yet. Link one to display cross-network
        badges on your profile.
      </p>
    {:else}
      <ul class="space-y-3">
        {#each connectedAccounts as account (account.id)}
          <li
            class="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/50 p-3"
          >
            <div>
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-zinc-100">
                  {account.provider}
                </span>
                <Badge variant="outline">{account.username}</Badge>
              </div>
              <p class="text-xs text-muted-foreground">
                Linked {new Date(account.linkedAt).toLocaleString()}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onclick={() => handleUnlinkAccount(account)}
              disabled={removingAccountId === account.id}
              aria-busy={removingAccountId === account.id}
            >
              Disconnect
            </Button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
