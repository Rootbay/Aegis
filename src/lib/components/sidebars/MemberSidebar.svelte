<script lang="ts">
  import { Users } from '@lucide/svelte';
  import type { User } from '$lib/models/User';
  import type { Role } from '$lib/models/Role';
  import { serverStore } from '$lib/stores/serverStore';
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Button } from "$lib/components/ui/button";
  import { Separator } from "$lib/components/ui/separator";
  import {
    Avatar,
    AvatarImage,
    AvatarFallback
  } from "$lib/components/ui/avatar";

  type MemberWithRoles = User & Record<string, unknown>;

  interface MemberGroup {
    id: string;
    label: string;
    color?: string;
    hoist?: boolean;
    members: MemberWithRoles[];
  }

  const FALLBACK_GROUP_ID = 'uncategorized';
  const FALLBACK_GROUP_LABEL = 'Members';

  let {
    members = [],
    isSettingsPage = false,
    openUserCardModal,
    roles: providedRoles = []
  }: {
    members?: MemberWithRoles[];
    isSettingsPage?: boolean;
    openUserCardModal: Function;
    roles?: Role[];
  } = $props();

  const resolvedRoles: Role[] = $derived(
    providedRoles?.length
      ? providedRoles
      : (() => {
          const activeServerId = $serverStore.activeServerId;
          if (!activeServerId) return [];
          const activeServer = $serverStore.servers.find(
            (server) => server.id === activeServerId
          );
          return (activeServer?.roles ?? []) as Role[];
        })()
  );

  let groupedMembers = $derived(groupMembersByRole(members, resolvedRoles));

  function extractMemberRoleValues(member: MemberWithRoles): string[] {
    const source = member as Record<string, unknown>;
    const values = new Set<string>();

    const pushValue = (value: unknown) => {
      if (typeof value === 'string' && value.trim().length > 0) {
        values.add(value);
      }
    };

    const pushMany = (raw: unknown) => {
      if (Array.isArray(raw)) {
        for (const entry of raw) {
          pushValue(entry);
        }
      } else {
        pushValue(raw);
      }
    };

    pushMany(source.roles);
    pushMany(source.roleIds);
    pushMany(source.role_ids);
    pushMany(source.roleNames);
    pushMany(source.role_names);
    pushMany(source.roleId);
    pushMany(source.role_id);
    pushValue(source.role);
    pushValue(source.roleName);
    pushValue(source.role_name);
    pushValue(source.primaryRole);
    pushValue(source.primary_role);
    pushValue(source.primaryRoleId);
    pushValue(source.primary_role_id);

    return Array.from(values);
  }

  function groupMembersByRole(memberList: MemberWithRoles[], roleList: Role[]): MemberGroup[] {
    if (!memberList.length) {
      return [];
    }

    const groups = new Map<string, MemberGroup>();
    const roleById = new Map(roleList.map(role => [role.id, role]));
    const roleByName = new Map(roleList.map(role => [role.name.toLowerCase(), role]));
    const orderByGroupId = new Map<string, number>();
    roleList.forEach((role, index) => {
      orderByGroupId.set(`role:${role.id}`, index);
    });

    const ensureGroup = (key: string, label: string, color?: string, hoist = false) => {
      if (!groups.has(key)) {
        groups.set(key, { id: key, label, color, hoist, members: [] });
      }
      return groups.get(key)!;
    };

    const fallbackGroup = ensureGroup(
      FALLBACK_GROUP_ID,
      FALLBACK_GROUP_LABEL
    );

    for (const member of memberList) {
      const roleIdentifiers = extractMemberRoleValues(member);
      let targetGroup: MemberGroup | null = null;

      for (const identifier of roleIdentifiers) {
        const role = roleById.get(identifier);
        if (role) {
          targetGroup = ensureGroup(`role:${role.id}`, role.name, role.color, role.hoist);
          break;
        }
      }

      if (!targetGroup) {
        for (const identifier of roleIdentifiers) {
          const role = roleByName.get(identifier.toLowerCase());
          if (role) {
            targetGroup = ensureGroup(`role:${role.id}`, role.name, role.color, role.hoist);
            break;
          }
        }
      }

      if (!targetGroup && roleIdentifiers.length) {
        const label = roleIdentifiers[0];
        targetGroup = ensureGroup(`custom:${label}`, label);
      }

      (targetGroup ?? fallbackGroup).members.push(member as MemberWithRoles);
    }

    const result = Array.from(groups.values()).filter(group => group.members.length > 0);

    result.sort((a, b) => {
      const hoistA = a.hoist ? 1 : 0;
      const hoistB = b.hoist ? 1 : 0;
      if (hoistA !== hoistB) {
        return hoistB - hoistA;
      }

      const orderA = orderByGroupId.has(a.id) ? orderByGroupId.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const orderB = orderByGroupId.has(b.id) ? orderByGroupId.get(b.id)! : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }

      if (a.id === FALLBACK_GROUP_ID || b.id === FALLBACK_GROUP_ID) {
        if (a.id === FALLBACK_GROUP_ID && b.id !== FALLBACK_GROUP_ID) {
          return 1;
        }
        if (b.id === FALLBACK_GROUP_ID && a.id !== FALLBACK_GROUP_ID) {
          return -1;
        }
      }

      return a.label.localeCompare(b.label);
    });

    for (const group of result) {
      group.members.sort((left, right) => {
        if (left.online !== right.online) {
          return (right.online ? 1 : 0) - (left.online ? 1 : 0);
        }
        return left.name.localeCompare(right.name);
      });
    }

    return result;
  }
</script>

<aside class="member-sidebar">
  {#if isSettingsPage}
    <div class="member-sidebar-header">
      <h2 class="member-sidebar-title">Settings</h2>
    </div>
    <Separator />
    <div class="member-sidebar-settings">
      <p>Settings content goes here.</p>
    </div>
  {:else}
    <div class="member-sidebar-header">
      <h2 class="member-sidebar-title">Members</h2>
    </div>
    <Separator />
    <ScrollArea class="member-sidebar-scroll-area">
      {#if members.length === 0}
        <div class="member-sidebar-empty-state">
          <Users size={20} aria-hidden="true" />
          <p>No members in this chat.</p>
        </div>
      {:else}
        <div class="member-sidebar-group-list">
          {#each groupedMembers as group (group.id)}
            <section class="member-group">
              <header class="member-group-header">
                <div class="member-group-label">
                  {#if group.color}
                    <span
                      class="member-group-bullet"
                      style={`background-color: ${group.color}`}
                      aria-hidden="true"
                    ></span>
                  {/if}
                  <span class="member-group-name">{group.label}</span>
                </div>
                <span class="member-group-count">{group.members.length}</span>
              </header>
              {#each group.members as member (member.id)}
                <Button
                  variant="ghost"
                  class="member-entry"
                  onclick={(e) =>
                    openUserCardModal(
                      member,
                      e.clientX,
                      e.currentTarget.getBoundingClientRect().top,
                      true
                    )
                  }
                >
                  <div class="member-entry-avatar-wrapper">
                    <Avatar class="member-entry-avatar">
                      <AvatarImage src={member.avatar} alt={member.name} />
                      <AvatarFallback>
                        {member.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {#if member.online}
                      <span class="member-entry-presence" aria-hidden="true"></span>
                    {/if}
                  </div>
                  <span class="member-entry-name">{member.name}</span>
                </Button>
              {/each}
            </section>
          {/each}
        </div>
      {/if}
    </ScrollArea>
  {/if}
</aside>

<style>
  .member-sidebar {
    display: none;
    width: 260px;
    flex-shrink: 0;
    min-height: 0;
    background-color: var(--muted);
    border-left: 1px solid var(--border);
    color: var(--muted-foreground);
    flex-direction: column;
  }

  .member-sidebar-header {
    align-items: center;
    color: var(--foreground);
    display: flex;
    height: 55px;
    padding: 1rem;
  }

  .member-sidebar-title {
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0;
  }

  .member-sidebar-settings {
    color: var(--muted-foreground);
    flex: 1;
    padding: 1rem;
  }

  .member-sidebar-settings p {
    margin: 0;
  }

  .member-sidebar-empty-state {
    align-items: center;
    color: var(--muted-foreground);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.5rem;
    text-align: center;
  }

  .member-sidebar-empty-state p {
    font-size: 0.875rem;
    margin: 0;
  }

  .member-sidebar-group-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .member-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .member-group-header {
    align-items: center;
    color: var(--muted-foreground);
    display: flex;
    font-size: 0.75rem;
    font-weight: 600;
    justify-content: space-between;
    letter-spacing: 0.05em;
    padding: 0 0.5rem;
    text-transform: uppercase;
  }

  .member-group-label {
    align-items: center;
    display: flex;
    gap: 0.5rem;
    min-width: 0;
  }

  .member-group-bullet {
    border: 1px solid var(--border);
    border-radius: 999px;
    display: inline-flex;
    height: 0.5rem;
    width: 0.5rem;
  }

  .member-group-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .member-group-count {
    color: var(--muted-foreground);
  }

  .member-entry-avatar-wrapper {
    margin-right: 0.25rem;
    position: relative;
  }

  .member-entry-presence {
    background-color: var(--primary);
    border: 2px solid var(--background);
    border-radius: 999px;
    bottom: 0;
    height: 0.5rem;
    position: absolute;
    right: 0;
    width: 0.5rem;
  }

  .member-entry-name {
    color: var(--foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

    @media (min-width: 64rem) {
    .member-sidebar {
      display: flex;
    }
  }
</style>
