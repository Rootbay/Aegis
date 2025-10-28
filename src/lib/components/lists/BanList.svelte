<script lang="ts">
  import type { User } from "$lib/features/auth/models/User";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { toasts } from "$lib/stores/ToastStore";

  type Props = {
    bannedUsers?: User[];
    serverId?: string;
  };

  let { bannedUsers = [], serverId = undefined }: Props = $props();

  let bans = $state<User[]>(Array.isArray(bannedUsers) ? bannedUsers : []);
  let isLoading = $state(false);
  let errorMessage = $state<string | null>(null);
  let unbanningStates = $state<Record<string, boolean>>({});

  let resolvedServerId = $derived(serverId ?? $serverStore.activeServerId ?? null);

  const defaultErrorMessage = "Failed to fetch banned members.";

  function setUnbanningState(memberId: string, value: boolean) {
    unbanningStates = { ...unbanningStates, [memberId]: value };
  }

  async function loadBans(force = false, targetServerId?: string) {
    const serverToLoad = targetServerId ?? resolvedServerId;
    if (!serverToLoad) {
      errorMessage = null;
      bans = [];
      return [] as User[];
    }

    isLoading = true;
    errorMessage = null;

    try {
      const fetched = await serverStore.fetchBans(serverToLoad, { force });
      bans = fetched;
      return fetched;
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : defaultErrorMessage;
      errorMessage = message;
      toasts.addToast(message, "error");
      bans = [];
      return [] as User[];
    } finally {
      isLoading = false;
    }
  }

  $effect(() => {
    bans = Array.isArray(bannedUsers) ? bannedUsers : [];
  });

  $effect(() => {
    const targetServerId = resolvedServerId;
    if (!targetServerId) {
      bans = [];
      errorMessage = null;
      return;
    }

    void loadBans(false, targetServerId);
  });

  function getDisplayName(user: User) {
    return user.name?.trim().length ? user.name : "Member";
  }

  async function handleUnban(user: User) {
    if (!resolvedServerId) {
      toasts.addToast("No server selected.", "error");
      return;
    }

    const confirmFn =
      typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm
        : () => true;

    const displayName = getDisplayName(user);
    const confirmed = confirmFn(`Unban ${displayName}?`);
    if (!confirmed) {
      return;
    }

    setUnbanningState(user.id, true);

    try {
      const result = await serverStore.unbanMember(resolvedServerId, user.id);
      if (result.success) {
        await loadBans(true, resolvedServerId);
        toasts.addToast(`${displayName} was unbanned.`, "success");
      } else if (result.error) {
        toasts.addToast(result.error, "error");
      } else {
        toasts.addToast("Failed to unban member.", "error");
      }
    } finally {
      setUnbanningState(user.id, false);
    }
  }
</script>

<div class="space-y-4">
  <h3 class="text-xl font-semibold text-white">Ban List</h3>
  <p class="text-muted-foreground">View and manage banned users in your server.</p>
  <div class="bg-card/50 p-4 rounded-lg space-y-3">
    {#if !resolvedServerId}
      <p class="text-muted-foreground">Select a server to view banned members.</p>
    {:else}
      {#if errorMessage}
        <p class="text-destructive text-sm">{errorMessage}</p>
      {/if}

      {#if isLoading}
        <p class="text-muted-foreground">Loading banned users…</p>
      {:else if bans.length > 0}
        <ul class="space-y-2">
          {#each bans as user (user.id)}
            <li class="flex items-center justify-between p-2 rounded-md bg-zinc-700">
              <span class="text-white">{getDisplayName(user)}</span>
              <button
                type="button"
                class="text-green-400 hover:text-green-300 disabled:opacity-60 disabled:cursor-not-allowed"
                onclick={() => handleUnban(user)}
                disabled={!!unbanningStates[user.id]}
              >
                {#if unbanningStates[user.id]}
                  Unbanning…
                {:else}
                  Unban
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="text-muted-foreground">No users are banned from this server.</p>
      {/if}
    {/if}
  </div>
</div>
