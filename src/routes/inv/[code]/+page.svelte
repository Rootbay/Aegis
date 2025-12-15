<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { invoke } from "@tauri-apps/api/core";
  import { Button } from "$lib/components/ui/button/index.js";
  import { serverStore } from "$lib/features/servers/stores/serverStore";

  type BackendServer = Parameters<
    (typeof serverStore)["upsertServerFromBackend"]
  >[0];

  type RedeemInviteResponse = {
    server: BackendServer;
    already_member?: boolean;
    alreadyMember?: boolean;
  };

  let processing = $state(true);
  let errorMessage = $state<string | null>(null);
  let requestedCode = $state<string | null>(null);
  let lastProcessedCode = $state<string | null>(null);

  $effect(() => {
    const rawCode = $page.params.code ?? null;
    requestedCode = rawCode ? decodeURIComponent(rawCode) : null;
  });

  $effect(() => {
    const code = requestedCode;
    if (!code) {
      errorMessage = "Invite code is missing or invalid.";
      processing = false;
      return;
    }
    if (code === lastProcessedCode) {
      return;
    }
    lastProcessedCode = code;
    void redeemInvite(code);
  });

  async function redeemInvite(code: string) {
    processing = true;
    errorMessage = null;
    try {
      const response = await invoke<RedeemInviteResponse>(
        "redeem_server_invite",
        { code },
      );
      const server = serverStore.upsertServerFromBackend(response.server);
      serverStore.setActiveServer(server.id);
      // eslint-disable-next-line svelte/no-navigation-without-resolve
      await goto(`/channels/${server.id}`);
    } catch (error) {
      console.error("Failed to redeem invite:", error);
      errorMessage =
        error instanceof Error
          ? error.message
          : "Unable to redeem invite. Please try again.";
    } finally {
      processing = false;
    }
  }

  async function goHome() {
    await goto("/");
  }
</script>

<div
  class="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center"
>
  {#if processing}
    <div class="space-y-2">
      <p class="text-lg font-semibold text-foreground">Joining server…</p>
      <p class="text-sm text-muted-foreground">
        We&apos;re redeeming your invite and preparing your workspace.
      </p>
    </div>
  {:else if !errorMessage}
    <div class="space-y-2">
      <p class="text-lg font-semibold text-foreground">
        Invite redeemed successfully.
      </p>
      <p class="text-sm text-muted-foreground">Redirecting you now…</p>
    </div>
  {:else}
    <div class="space-y-3 max-w-sm">
      <p class="text-lg font-semibold text-destructive">
        Invite redemption failed
      </p>
      <p class="text-sm text-muted-foreground">{errorMessage}</p>
      <div class="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button type="button" variant="outline" onclick={goHome}>
          Go to Home
        </Button>
        <Button
          type="button"
          onclick={async () => await goto("/channels")}
          variant="secondary"
        >
          Browse servers
        </Button>
      </div>
    </div>
  {/if}
</div>
