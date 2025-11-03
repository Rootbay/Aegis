<script lang="ts">
  import MemberList from "$lib/components/lists/MemberList.svelte";
  import BanList from "$lib/components/lists/BanList.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import type { ServerInvite } from "$lib/features/servers/models/ServerInvite";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { toasts } from "$lib/stores/ToastStore";
  import { invoke } from "@tauri-apps/api/core";
  import { Copy, LoaderCircle, RefreshCcw, Trash2 } from "@lucide/svelte";
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
  let isRefreshingInvites = $state(false);
  let isGeneratingInvite = $state(false);
  let inviteActionState = $state<Record<string, boolean>>({});
  let lastRefreshedServerId: string | null = null;

  let activeServerId = $derived($serverStore.activeServerId ?? null);
  let activeServer = $derived(
    activeServerId
      ? ($serverStore.servers.find((server) => server.id === activeServerId) ??
          null)
      : null,
  );
  let members = $derived(activeServer?.members ?? []);
  let memberLookup = $derived.by(() => {
    const lookup: Record<string, User> = {};
    for (const member of members) {
      lookup[member.id] = member;
    }
    return lookup;
  });
  let invites = $derived(activeServer?.invites ?? []);
  let sortedInvites = $derived.by(() =>
    invites.slice().sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
        return 0;
      }
      return bTime - aTime;
    }),
  );
  let invitesAllowed = $derived(
    activeServer ? activeServer.allow_invites !== false : true,
  );

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function formatInviteExpiry(value?: string | null) {
    if (!value) {
      return "Never";
    }
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return "Unknown";
      }
      return dateFormatter.format(date);
    } catch (error) {
      console.warn("Failed to format invite expiry", error);
      return "Unknown";
    }
  }

  function formatInviteCreated(value: string) {
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return value;
      }
      return dateFormatter.format(date);
    } catch (error) {
      console.warn("Failed to format invite created date", error);
      return value;
    }
  }

  function formatInviteUses(invite: ServerInvite) {
    if (invite.maxUses === undefined || invite.maxUses === null) {
      return `${invite.uses} / ∞`;
    }
    return `${invite.uses} / ${invite.maxUses}`;
  }

  function inviteCreatorLabel(invite: ServerInvite) {
    const creator = memberLookup[invite.createdBy];
    if (creator) {
      return creator.name || invite.createdBy;
    }
    return invite.createdBy;
  }

  function markInviteAction(inviteId: string, value: boolean) {
    if (value) {
      inviteActionState = { ...inviteActionState, [inviteId]: true };
    } else {
      const rest = { ...inviteActionState };
      delete rest[inviteId];
      inviteActionState = rest;
    }
  }

  function isInviteProcessing(inviteId: string) {
    return inviteActionState[inviteId] ?? false;
  }

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

  async function refreshInvites(options: { showToast?: boolean } = {}) {
    const { showToast = false } = options;
    const serverId = activeServerId;
    if (!serverId) {
      if (showToast) {
        toasts.addToast("No server selected.", "error");
      }
      return false;
    }
    if (isRefreshingInvites) {
      return false;
    }

    isRefreshingInvites = true;
    try {
      await serverStore.refreshServerInvites(serverId);
      if (showToast) {
        toasts.addToast("Invite list refreshed.", "success");
      }
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Failed to refresh invites.";
      toasts.addToast(message, "error");
      return false;
    } finally {
      isRefreshingInvites = false;
    }
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
      void refreshInvites();
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

  async function handleCopyInvite(invite: ServerInvite) {
    const link = buildInviteLinkFromCode(invite.code);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        toasts.addToast("Invite link copied.", "success");
        return;
      }
    } catch (error) {
      console.error("Failed to copy invite link:", error);
      toasts.addToast("Failed to copy invite link.", "error");
    }

    toasts.addToast(`Invite link: ${link}`, "info");
  }

  async function handleRevokeInvite(invite: ServerInvite) {
    const serverId = activeServerId;
    if (!serverId) {
      toasts.addToast("No server selected.", "error");
      return;
    }

    markInviteAction(invite.id, true);
    try {
      await invoke("revoke_server_invite", {
        serverId,
        server_id: serverId,
        inviteId: invite.id,
        invite_id: invite.id,
      });
      toasts.addToast("Invite revoked.", "success");
      await refreshInvites();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Failed to revoke invite.";
      toasts.addToast(message, "error");
    } finally {
      markInviteAction(invite.id, false);
    }
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

      await refreshInvites();
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
      <div
        class="bg-zinc-800/80 border border-zinc-700 rounded-2xl shadow p-6 space-y-5"
      >
        <div
          class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h3 class="text-lg font-semibold text-white">Invites</h3>
            <p class="text-sm text-zinc-400">
              Review generated invites, share links, and revoke access when
              necessary.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onclick={() => refreshInvites({ showToast: true })}
              disabled={isRefreshingInvites}
            >
              {#if isRefreshingInvites}
                <LoaderCircle class="h-4 w-4 animate-spin" />
                Refreshing…
              {:else}
                <RefreshCcw class="h-4 w-4" />
                Refresh invites
              {/if}
            </Button>
          </div>
        </div>

        {#if !invitesAllowed}
          <div
            class="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
          >
            Invites are disabled for this server. Existing codes remain active
            until revoked.
          </div>
        {/if}

        {#if sortedInvites.length === 0}
          <div
            class="rounded-xl border border-dashed border-zinc-700/70 px-4 py-8 text-center text-sm text-zinc-400"
          >
            No invites generated yet.
          </div>
        {:else}
          <div class="overflow-x-auto">
            <table class="w-full min-w-[560px] text-left text-sm">
              <thead
                class="bg-zinc-900/40 text-xs uppercase tracking-wide text-zinc-400"
              >
                <tr>
                  <th class="px-4 py-3 font-medium">Code</th>
                  <th class="px-4 py-3 font-medium">Creator</th>
                  <th class="px-4 py-3 font-medium">Expires</th>
                  <th class="px-4 py-3 font-medium">Uses</th>
                  <th class="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {#each sortedInvites as invite (invite.id)}
                  <tr class="border-t border-zinc-700/60">
                    <td class="px-4 py-3 align-top">
                      <div class="flex flex-col gap-1">
                        <span class="font-mono text-sm text-white">
                          {invite.code}
                        </span>
                        <span class="text-xs text-zinc-500">
                          Created {formatInviteCreated(invite.createdAt)}
                        </span>
                      </div>
                    </td>
                    <td class="px-4 py-3 align-top text-zinc-300">
                      {inviteCreatorLabel(invite)}
                    </td>
                    <td class="px-4 py-3 align-top text-zinc-300">
                      {formatInviteExpiry(invite.expiresAt)}
                    </td>
                    <td class="px-4 py-3 align-top text-zinc-300">
                      {formatInviteUses(invite)}
                    </td>
                    <td class="px-4 py-3 align-top">
                      <div class="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onclick={() => handleCopyInvite(invite)}
                          title="Copy invite link"
                          disabled={isInviteProcessing(invite.id)}
                        >
                          <Copy class="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          onclick={() => handleRevokeInvite(invite)}
                          title="Revoke invite"
                          disabled={isInviteProcessing(invite.id)}
                        >
                          {#if isInviteProcessing(invite.id)}
                            <LoaderCircle class="h-4 w-4 animate-spin" />
                          {:else}
                            <Trash2 class="h-4 w-4" />
                          {/if}
                        </Button>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>

      <div
        class="bg-zinc-800/80 border border-zinc-700 rounded-2xl shadow p-6 space-y-5"
      >
        <div
          class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
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
              title={!invitesAllowed
                ? "Invites are disabled for this server."
                : undefined}
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
          {members}
          serverId={activeServer.id}
          onMemberRemoved={handleMemberRemoved}
        />
      </div>

      <div
        class="bg-zinc-800/80 border border-zinc-700 rounded-2xl shadow p-6 space-y-5"
      >
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
