<script lang="ts">
  import MemberList from "$lib/components/lists/MemberList.svelte";
  import BanList from "$lib/components/lists/BanList.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import type { ServerInvite } from "$lib/features/servers/models/ServerInvite";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { toasts } from "$lib/stores/ToastStore";
  import { invoke } from "@tauri-apps/api/core";
  import type { User } from "$lib/features/auth/models/User";

  type ServerInviteResponse = {
    id: string;
    server_id: string;
    code: string;
    created_by: string;
    created_at: string;
    expires_at?: string | null;
    max_uses?: number | null;
    uses: number;
  };

  let isRefreshingMembers = $state(false);
  let isGeneratingInvite = $state(false);
  let lastRefreshedServerId: string | null = null;

  let activeServerId = $derived($serverStore.activeServerId ?? null);
  let activeServer = $derived(
    activeServerId
      ? $serverStore.servers.find((server) => server.id === activeServerId) ?? null
      : null,
  );
  let members = $derived(activeServer?.members ?? []);
  let invitesAllowed = $derived(
    activeServer ? activeServer.allow_invites !== false : true,
  );

  function mapInviteResponse(invite: ServerInviteResponse): ServerInvite {
    return {
      id: invite.id,
      serverId: invite.server_id,
      code: invite.code,
      createdBy: invite.created_by,
      createdAt: invite.created_at,
      expiresAt: invite.expires_at ?? undefined,
      maxUses: invite.max_uses ?? undefined,
      uses: invite.uses ?? 0,
    };
  }

  function buildInviteLinkFromCode(code: string) {
    const path = `/inv/${code}`;
    try {
      if (typeof window !== "undefined" && window.location?.origin) {
        return `${window.location.origin}${path}`;
      }
    } catch (error) {
      console.error("Failed to resolve invite link origin:", error);
    }
    return path;
  }

  async function refreshMembers(options: { showToast?: boolean } = {}) {
    const { showToast = false } = options;
    const serverId = activeServerId;
    if (!serverId) {
      if (showToast) {
        toasts.addToast("No server selected.", "error");
      }
      return;
    }
    if (isRefreshingMembers) return;

    isRefreshingMembers = true;
    try {
      await serverStore.fetchServerDetails(serverId);
      if (showToast) {
        toasts.addToast("Member list refreshed.", "success");
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Failed to refresh members.";
      toasts.addToast(message, "error");
    } finally {
      isRefreshingMembers = false;
    }
  }

  $effect(() => {
    const serverId = activeServerId;
    if (serverId && serverId !== lastRefreshedServerId) {
      lastRefreshedServerId = serverId;
      void refreshMembers();
    }
    if (!serverId) {
      lastRefreshedServerId = null;
    }
  });

  async function handleMemberRemoved(member: User) {
    void member;
    await refreshMembers();
  }

  async function handleMemberUnbanned(user: User) {
    void user;
    await refreshMembers();
  }

  async function handleGenerateInvite() {
    const serverId = activeServerId;
    if (!serverId) {
      toasts.addToast("No server selected.", "error");
      return;
    }
    if (!invitesAllowed) {
      toasts.addToast("Invites are disabled for this server.", "error");
      return;
    }
    if (isGeneratingInvite) return;

    isGeneratingInvite = true;
    try {
      const response = await invoke<ServerInviteResponse>(
        "generate_server_invite",
        {
          server_id: serverId,
        },
      );
      const invite = mapInviteResponse(response);
      serverStore.addInviteToServer(serverId, invite);

      const link = buildInviteLinkFromCode(invite.code);
      let copied = false;
      try {
        if (
          typeof navigator !== "undefined" &&
          navigator.clipboard?.writeText
        ) {
          await navigator.clipboard.writeText(link);
          copied = true;
        }
      } catch (error) {
        console.error("Failed to copy invite link:", error);
      }

      if (copied) {
        toasts.addToast("Invite link copied.", "success");
      } else {
        toasts.addToast(`Invite link generated: ${link}`, "info");
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Failed to generate invite link.";
      toasts.addToast(message, "error");
    } finally {
      isGeneratingInvite = false;
    }
  }
</script>

<section class="space-y-6">
  <header>
    <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
      User Management
    </h2>
    <p class="mt-1 text-sm text-zinc-500">
      Manage server members, review bans, and share invite links.
    </p>
  </header>

  {#if !activeServer}
    <div class="bg-zinc-800/80 border border-zinc-700 rounded-2xl p-6">
      <p class="text-sm text-zinc-400">
        Select a server to view and manage member settings.
      </p>
    </div>
  {:else}
    <div class="space-y-6">
      <div class="bg-zinc-800/80 border border-zinc-700 rounded-2xl shadow p-6 space-y-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 class="text-lg font-semibold text-white">Members</h3>
            <p class="text-sm text-zinc-400">
              Remove members and refresh the list after updates.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onclick={() => refreshMembers({ showToast: true })}
              disabled={isRefreshingMembers}
            >
              {#if isRefreshingMembers}
                Refreshing…
              {:else}
                Refresh members
              {/if}
            </Button>
            <Button
              onclick={handleGenerateInvite}
              disabled={isGeneratingInvite || !invitesAllowed}
              title={!invitesAllowed ? "Invites are disabled for this server." : undefined}
            >
              {#if isGeneratingInvite}
                Generating invite…
              {:else}
                Generate invite link
              {/if}
            </Button>
          </div>
        </div>

        <MemberList
          members={members}
          serverId={activeServer.id}
          onMemberRemoved={handleMemberRemoved}
        />
      </div>

      <div class="bg-zinc-800/80 border border-zinc-700 rounded-2xl shadow p-6 space-y-5">
        <div class="space-y-1">
          <h3 class="text-lg font-semibold text-white">Bans</h3>
          <p class="text-sm text-zinc-400">
            Review banned users and unban members when needed.
          </p>
        </div>

        <BanList serverId={activeServer.id} onUnban={handleMemberUnbanned} />
      </div>
    </div>
  {/if}
</section>
