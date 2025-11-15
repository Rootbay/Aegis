<script lang="ts">
  import RolesManagement from "$lib/features/servers/components/RolesManagement.svelte";
  import type { Role } from "$lib/features/servers/models/Role";
  import { reindexRoles, sortRolesByPosition } from "$lib/features/servers/models/Role";
  import type { User } from "$lib/features/auth/models/User";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { SvelteSet } from "svelte/reactivity";
  import { Checkbox } from "$lib/components/ui/checkbox";

  let activeServerId = $derived($serverStore.activeServerId ?? null);
  let server = $derived(
    activeServerId
      ? ($serverStore.servers.find((s) => s.id === activeServerId) ?? null)
      : null,
  );

  let roles = $derived(sortRolesByPosition(server?.roles ?? []));
  let members = $derived(server?.members ?? []);

  let saving = $state(false);
  let saveError = $state<string | null>(null);

  $effect(() => {
    if (activeServerId) {
      void serverStore.fetchServerDetails(activeServerId);
    }
  });

  async function persistRoles(nextRoles: Role[]) {
    if (!server) return;
    saving = true;
    saveError = null;
    const normalizedRoles = reindexRoles(nextRoles);
    const result = await serverStore.replaceServerRoles(
      server.id,
      normalizedRoles,
    );
    saving = false;
    if (!result.success) {
      saveError = result.error ?? "Failed to update server roles.";
    }
  }

  const dedupeMemberIds = (ids: string[]): string[] => {
    const set = new SvelteSet<string>();
    for (const id of ids) {
      if (typeof id === "string" && id.trim().length > 0) {
        set.add(id);
      }
    }
    return Array.from(set.values());
  };

  const sortMembers = (list: User[]): User[] =>
    [...list].sort((a, b) => a.name.localeCompare(b.name));

  function isMemberAssigned(memberId: string, roleId: string): boolean {
    const role = roles.find((entry) => entry.id === roleId);
    if (!role) return false;
    return role.member_ids.includes(memberId);
  }

  function memberRoleSummary(memberId: string): string {
    const assigned = roles
      .filter((role) => role.member_ids.includes(memberId))
      .map((role) => role.name);
    return assigned.length ? assigned.join(", ") : "No roles assigned";
  }

  async function handleAddRole(newRole: Role) {
    if (!server) return;
    await persistRoles([...roles, newRole]);
  }

  async function handleUpdateRole(updatedRole: Role) {
    if (!server) return;
    const nextRoles = roles.map((role) =>
      role.id === updatedRole.id ? { ...updatedRole } : role,
    );
    await persistRoles(nextRoles);
  }

  async function handleReorderRoles(nextRoles: Role[]) {
    if (!server) return;
    await persistRoles(nextRoles);
  }

  async function handleDeleteRole(roleId: string) {
    if (!server) return;
    const nextRoles = roles.filter((role) => role.id !== roleId);
    await persistRoles(nextRoles);
  }

  async function handleTogglePermission({
    roleId,
    permission,
  }: {
    roleId: string;
    permission: keyof Role["permissions"];
  }) {
    if (!server) return;
    const nextRoles = roles.map((role) => {
      if (role.id !== roleId) {
        return role;
      }
      const nextPermissions = {
        ...role.permissions,
        [permission]: !role.permissions[permission],
      };
      return {
        ...role,
        permissions: nextPermissions,
      };
    });
    await persistRoles(nextRoles);
  }

  async function handleMemberRoleToggle(memberId: string, roleId: string) {
    if (!server) return;
    const nextRoles = roles.map((role) => {
      if (role.id !== roleId) {
        return role;
      }
      const memberIds = role.member_ids.includes(memberId)
        ? role.member_ids.filter((id) => id !== memberId)
        : [...role.member_ids, memberId];
      return {
        ...role,
        member_ids: dedupeMemberIds(memberIds),
      };
    });
    await persistRoles(nextRoles);
  }

  const sortedMembers = $derived(sortMembers(members));
  const sortedRoles = $derived(sortRolesByPosition(roles));
</script>

<h2 class="text-left text-xs font-bold px-2.5 py-1.5 uppercase">
  Roles
</h2>

<div class="space-y-6">
  {#if !server}
    <div class="bg-card p-4 rounded-lg">
      <p class="text-muted-foreground text-sm">
        Select a server to manage roles and member assignments.
      </p>
    </div>
  {:else}
    {#if saving || saveError}
      <div class="space-y-2">
        {#if saving}
          <div
            class="rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-200"
          >
            Saving changes…
          </div>
        {/if}
        {#if saveError}
          <div
            class="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
          >
            {saveError}
          </div>
        {/if}
      </div>
    {/if}

    <div class="bg-card/60 rounded-lg p-4 shadow-sm border border-border/40">
      <RolesManagement
        {roles}
        onadd_role={handleAddRole}
        onupdate_role={handleUpdateRole}
        ondelete_role={handleDeleteRole}
        ontoggle_permission={handleTogglePermission}
        onreorder_roles={handleReorderRoles}
      />
    </div>

    <div class="bg-card/60 rounded-lg p-4 shadow-sm border border-border/40">
      <div class="flex flex-col gap-1 mb-4">
        <h3 class="text-lg font-semibold text-foreground">
          Member Role Assignments
        </h3>
        <p class="text-sm text-muted-foreground">
          Assign or remove roles from members. Changes are saved immediately.
        </p>
      </div>

      {#if !sortedRoles.length}
        <p class="text-sm text-muted-foreground">
          Create at least one role to start assigning members.
        </p>
      {:else if !sortedMembers.length}
        <p class="text-sm text-muted-foreground">
          Invite members to your server to assign roles.
        </p>
      {:else}
        <div class="space-y-4">
          {#each sortedMembers as member (member.id)}
            <div class="border border-border/40 rounded-lg p-4 bg-muted/20">
              <div class="flex flex-col gap-1 mb-3">
                <span class="font-medium text-foreground">{member.name}</span>
                <span class="text-xs text-muted-foreground">
                  {memberRoleSummary(member.id)}
                </span>
              </div>
              <div class="flex flex-wrap gap-3">
                {#each sortedRoles as role (role.id)}
                  <label
                    class="inline-flex items-center gap-2 rounded-md border border-border/40 bg-background/70 px-3 py-1 text-sm hover:border-border transition-colors"
                  >
                    <Checkbox
                      class="h-4 w-4"
                      checked={isMemberAssigned(member.id, role.id)}
                      disabled={saving}
                      onchange={() =>
                        handleMemberRoleToggle(member.id, role.id)}
                    />
                    <span>{role.name}</span>
                  </label>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
