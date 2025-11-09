<svelte:options runes={true} />

<script lang="ts">
  import { Check, LoaderCircle, Minus } from "@lucide/svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import type { User } from "$lib/features/auth/models/User";
  import type { Role } from "$lib/features/servers/models/Role";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { toasts } from "$lib/stores/ToastStore";

  type OpenUserCardModal = (...args: [User, number, number, boolean]) => void; // eslint-disable-line no-unused-vars
  const noopOpenUserCard: OpenUserCardModal = () => {};
  type MemberRemovedHandler = (member: User) => void | Promise<void>; // eslint-disable-line no-unused-vars
  const noopMemberRemoved: MemberRemovedHandler = () => {};

  let {
    members = [],
    roles = [],
    openUserCardModal = noopOpenUserCard,
    serverId = undefined,
    onMemberRemoved = noopMemberRemoved,
  }: {
    members?: User[];
    roles?: Role[];
    openUserCardModal?: OpenUserCardModal;
    serverId?: string;
    onMemberRemoved?: MemberRemovedHandler;
  } = $props();

  let removalStates = $state<Record<string, boolean>>({});
  let roleUpdateStates = $state<Record<string, boolean>>({});
  let resolvedServerId = $derived(
    serverId ?? $serverStore.activeServerId ?? null,
  );

  const collectRoleIds = (member: User): string[] => {
    const ids = new Set<string>();
    const record = member as Record<string, unknown>;
    const candidates = [record.roleIds, record.role_ids, record.roles];
    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) {
        continue;
      }
      for (const entry of candidate) {
        if (typeof entry === "string" && entry.trim().length > 0) {
          ids.add(entry.trim());
        }
      }
    }
    return Array.from(ids);
  };

  function openMemberCard(member: User, event: MouseEvent | KeyboardEvent) {
    let x = 0;
    let y = 0;
    if (event instanceof MouseEvent) {
      x = event.clientX;
      y = event.clientY;
    } else {
      const target = event.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }
    openUserCardModal(member, x, y, true);
  }

  function setRemovalState(memberId: string, value: boolean) {
    removalStates = { ...removalStates, [memberId]: value };
  }

  function setRoleUpdateState(memberId: string, value: boolean) {
    roleUpdateStates = value
      ? { ...roleUpdateStates, [memberId]: true }
      : Object.fromEntries(
          Object.entries(roleUpdateStates).filter(([key]) => key !== memberId),
        );
  }

  function resolveMemberDisplayName(member: User): string {
    const trimmed = member.name?.trim?.();
    if (trimmed && trimmed.length > 0) {
      return trimmed;
    }
    return "Member";
  }

  async function handleRemoveMember(member: User, event: MouseEvent) {
    event.stopPropagation();

    if (!resolvedServerId) {
      toasts.addToast("No server selected.", "error");
      return;
    }

    setRemovalState(member.id, true);

    try {
      const result = await serverStore.removeMember(
        resolvedServerId,
        member.id,
      );

      if (!result.success) {
        if (result.error) {
          toasts.addToast(result.error, "error");
        } else {
          toasts.addToast("Failed to remove member.", "error");
        }
        return;
      }

      const displayName = resolveMemberDisplayName(member);
      toasts.addToast(`${displayName} removed from server.`, "success");

      await onMemberRemoved(member);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to remove member.";
      toasts.addToast(message, "error");
    } finally {
      setRemovalState(member.id, false);
    }
  }

  async function handleRoleToggle(
    member: User,
    role: Role,
    event: MouseEvent,
  ) {
    event.stopPropagation();

    if (!resolvedServerId) {
      toasts.addToast("No server selected.", "error");
      return;
    }

    if (roleUpdateStates[member.id]) {
      return;
    }

    const currentRoles = new Set(collectRoleIds(member));
    const wasAssigned = currentRoles.has(role.id);
    if (wasAssigned) {
      currentRoles.delete(role.id);
    } else {
      currentRoles.add(role.id);
    }

    setRoleUpdateState(member.id, true);

    try {
      const result = await serverStore.updateMemberRoles(
        resolvedServerId,
        member.id,
        Array.from(currentRoles),
      );

      if (!result.success) {
        const message =
          result.error ?? "Failed to update member roles. Please try again.";
        toasts.addToast(message, "error");
        return;
      }

      const displayName = resolveMemberDisplayName(member);
      const action = wasAssigned ? "Removed" : "Assigned";
      toasts.addToast(
        `${action} ${role.name} ${
          action === "Assigned" ? "to" : "from"
        } ${displayName}.`,
        "success",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update member roles.";
      toasts.addToast(message, "error");
    } finally {
      setRoleUpdateState(member.id, false);
    }
  }
</script>

<div class="space-y-4">
  <div class="space-y-1">
    <h3 class="text-xl font-semibold text-white">Member Roles</h3>
    <p class="text-sm text-muted-foreground">
      Inspect each member’s current assignments and toggle roles as needed.
    </p>
  </div>
  <div class="rounded-lg bg-card/50 p-4">
    {#if members.length > 0}
      <ul class="space-y-4">
        {#each members as member (member.id)}
          {@const memberRoleIds = collectRoleIds(member)}
          {@const assignedRoles = roles.filter((role) =>
            memberRoleIds.includes(role.id)
          )}
          <li>
            <div
              role="button"
              tabindex="0"
              class="flex flex-col gap-3 rounded-lg border border-border/60 bg-background/40 p-4 transition-colors hover:border-border hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onclick={(e) => openMemberCard(member, e)}
              onkeydown={(e) => {
                if (e.key === "Enter") {
                  openMemberCard(member, e);
                }
              }}
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div class="space-y-2">
                  <div class="flex items-center gap-2">
                    <span class="text-base font-medium text-white">
                      {resolveMemberDisplayName(member)}
                    </span>
                    {#if member.online}
                      <span class="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true"></span>
                    {/if}
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    {#if assignedRoles.length > 0}
                      {#each assignedRoles as role (role.id)}
                        <Badge variant="secondary" class="bg-primary/10 text-xs text-primary">
                          {role.name}
                        </Badge>
                      {/each}
                    {:else}
                      <span class="text-xs text-muted-foreground">No roles assigned yet.</span>
                    {/if}
                  </div>
                </div>
                <div class="flex items-center gap-2 self-start">
                  <Button
                    variant="ghost"
                    class="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onclick={(e) => {
                      e.stopPropagation();
                      openMemberCard(member, e);
                    }}
                  >
                    View profile
                  </Button>
                  <Button
                    variant="destructive"
                    class="h-8 px-3 text-xs"
                    onclick={(e) => handleRemoveMember(member, e)}
                    disabled={!!removalStates[member.id]}
                  >
                    {#if removalStates[member.id]}
                      <LoaderCircle class="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Removing…
                    {:else}
                      <Minus class="mr-2 h-3 w-3" aria-hidden="true" />
                      Remove
                    {/if}
                  </Button>
                </div>
              </div>

              <div class="space-y-2">
                <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Toggle roles
                </p>
                {#if roles.length > 0}
                  <div class="flex flex-wrap gap-2">
                    {#each roles as role (role.id)}
                      {@const isAssigned = memberRoleIds.includes(role.id)}
                      <button
                        type="button"
                        class={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                          isAssigned
                            ? "border-primary/60 bg-primary/10 text-primary"
                            : "border-border/60 bg-background/50 text-muted-foreground hover:bg-background"
                        }`}
                        aria-pressed={isAssigned}
                        aria-label={`${isAssigned ? "Remove" : "Assign"} ${role.name} ${
                          isAssigned ? "from" : "to"
                        } ${resolveMemberDisplayName(member)}`}
                        onclick={(event) => handleRoleToggle(member, role, event)}
                        disabled={!!roleUpdateStates[member.id]}
                      >
                        {#if roleUpdateStates[member.id]}
                          <LoaderCircle class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        {:else if isAssigned}
                          <Check class="h-3.5 w-3.5" aria-hidden="true" />
                        {/if}
                        <span>{role.name}</span>
                      </button>
                    {/each}
                  </div>
                {:else}
                  <p class="text-sm text-muted-foreground/80">
                    No roles have been configured for this server yet.
                  </p>
                {/if}
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-muted-foreground">No members in this server yet.</p>
    {/if}
  </div>
</div>
