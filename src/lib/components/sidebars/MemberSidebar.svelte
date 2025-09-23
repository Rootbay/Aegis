<script lang="ts">
  import { Users } from "@lucide/svelte";
  import type { User } from "$lib/features/auth/models/User";
  import type { Role } from "$lib/features/servers/models/Role";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { SvelteMap, SvelteSet } from "svelte/reactivity";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Separator } from "$lib/components/ui/separator";
  import {
    Avatar,
    AvatarImage,
    AvatarFallback,
  } from "$lib/components/ui/avatar";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import {
    Sidebar,
    SidebarHeader,
    SidebarContent,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
  } from "$lib/components/ui/sidebar";
  import UserCardModal from "$lib/components/modals/UserCardModal.svelte";

  type MemberWithRoles = User & Record<string, unknown>;

  type OpenUserCardModalHandler = (
    ...args: [User, number, number, boolean]
  ) => void; // eslint-disable-line no-unused-vars
  type OpenDetailedProfileHandler = (...args: [User]) => void; // eslint-disable-line no-unused-vars

  interface MemberGroup {
    id: string;
    label: string;
    color?: string;
    hoist?: boolean;
    members: MemberWithRoles[];
  }

  const FALLBACK_GROUP_ID = "uncategorized";
  const FALLBACK_GROUP_LABEL = "Members";

  let {
    members = [],
    isSettingsPage = false,
    openUserCardModal = () => {},
    openDetailedProfileModal = () => {},
    roles: providedRoles = [],
  }: {
    members?: MemberWithRoles[];
    isSettingsPage?: boolean;
    openUserCardModal?: OpenUserCardModalHandler;
    openDetailedProfileModal?: OpenDetailedProfileHandler;
    roles?: Role[];
  } = $props();

  const resolvedRoles: Role[] = $derived(
    providedRoles?.length
      ? providedRoles
      : (() => {
          const activeServerId = $serverStore.activeServerId;
          if (!activeServerId) return [];
          const activeServer = $serverStore.servers.find(
            (server) => server.id === activeServerId,
          );
          return (activeServer?.roles ?? []) as Role[];
        })(),
  );

  let groupedMembers = $derived(groupMembersByRole(members, resolvedRoles));

  function extractMemberRoleValues(member: MemberWithRoles): string[] {
    const source = member as Record<string, unknown>;
    const values = new SvelteSet<string>();

    const pushValue = (value: unknown) => {
      if (typeof value === "string" && value.trim().length > 0) {
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

    return Array.from(values.values());
  }

  function groupMembersByRole(
    memberList: MemberWithRoles[],
    roleList: Role[],
  ): MemberGroup[] {
    if (!memberList.length) {
      return [];
    }

    const groups = new SvelteMap<string, MemberGroup>();
    const roleById = new SvelteMap<string, Role>();
    for (const role of roleList) {
      roleById.set(role.id, role);
    }
    const roleByName = new SvelteMap<string, Role>();
    for (const role of roleList) {
      roleByName.set(role.name.toLowerCase(), role);
    }
    const orderByGroupId = new SvelteMap<string, number>();
    roleList.forEach((role, index) => {
      orderByGroupId.set(`role:${role.id}`, index);
    });

    const ensureGroup = (
      key: string,
      label: string,
      color?: string,
      hoist = false,
    ) => {
      if (!groups.has(key)) {
        groups.set(key, { id: key, label, color, hoist, members: [] });
      }
      return groups.get(key)!;
    };

    const fallbackGroup = ensureGroup(FALLBACK_GROUP_ID, FALLBACK_GROUP_LABEL);

    for (const member of memberList) {
      const roleIdentifiers = extractMemberRoleValues(member);
      let targetGroup: MemberGroup | null = null;

      for (const identifier of roleIdentifiers) {
        const role = roleById.get(identifier);
        if (role) {
          targetGroup = ensureGroup(
            `role:${role.id}`,
            role.name,
            role.color,
            role.hoist,
          );
          break;
        }
      }

      if (!targetGroup) {
        for (const identifier of roleIdentifiers) {
          const role = roleByName.get(identifier.toLowerCase());
          if (role) {
            targetGroup = ensureGroup(
              `role:${role.id}`,
              role.name,
              role.color,
              role.hoist,
            );
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

    const result = Array.from(groups.values()).filter(
      (group) => group.members.length > 0,
    );

    result.sort((a, b) => {
      const hoistA = a.hoist ? 1 : 0;
      const hoistB = b.hoist ? 1 : 0;
      if (hoistA !== hoistB) {
        return hoistB - hoistA;
      }

      const orderA = orderByGroupId.has(a.id)
        ? orderByGroupId.get(a.id)!
        : Number.MAX_SAFE_INTEGER;
      const orderB = orderByGroupId.has(b.id)
        ? orderByGroupId.get(b.id)!
        : Number.MAX_SAFE_INTEGER;
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

<Sidebar
  class="hidden lg:flex"
  data-settings-page={isSettingsPage}
  aria-label={isSettingsPage ? "Member settings" : "Server members"}
>
  {#if isSettingsPage}
    <SidebarHeader>
      <h2 class="text-lg font-semibold text-foreground">Settings</h2>
    </SidebarHeader>
    <Separator class="opacity-50" />
    <SidebarContent class="p-4 text-sm text-muted-foreground">
      <p>Settings content goes here.</p>
    </SidebarContent>
  {:else}
    <SidebarContent class="flex">
      <ScrollArea class="h-full w-full">
        {#if members.length === 0}
          <div
            class="flex flex-col items-center gap-3 px-6 py-8 text-center text-sm text-muted-foreground"
          >
            <Users class="size-5" aria-hidden="true" />
            <p>No members in this chat.</p>
          </div>
        {:else}
          <div class="space-y-5 px-2 py-4">
            {#each groupedMembers as group (group.id)}
              <SidebarGroup class="space-y-2">
                <SidebarGroupLabel>
                  <div class="flex min-w-0 items-center gap-2">
                    {#if group.color}
                      <span
                        class="h-2 w-2 shrink-0 rounded-full border border-border"
                        style={`background-color: ${group.color}`}
                        aria-hidden="true"
                      ></span>
                    {/if}
                    <span class="truncate text-foreground">{group.label}</span>
                  </div>
                  <span class="text-xs font-semibold text-muted-foreground"
                    >{group.members.length}</span
                  >
                </SidebarGroupLabel>
                <SidebarGroupContent class="space-y-1">
                  <SidebarMenu class="space-y-1">
                    {#each group.members as member (member.id)}
                      <SidebarMenuItem>
                        <Popover.Root>
                          <Popover.Trigger>
                            <SidebarMenuButton
                              class="flex items-center gap-3"
                              ondblclick={(event) =>
                                openUserCardModal?.(
                                  member,
                                  event.clientX,
                                  event.clientY,
                                  true,
                                )}
                            >
                              <div class="relative">
                                <Avatar class="size-8">
                                  <AvatarImage
                                    src={member.avatar}
                                    alt={member.name}
                                  />
                                  <AvatarFallback>
                                    {(member.name || "?")
                                      .slice(0, 2)
                                      .toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                {#if member.online}
                                  <span
                                    class="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500"
                                  ></span>
                                {/if}
                              </div>
                              <span
                                class="truncate text-sm font-medium text-foreground"
                                >{member.name}</span
                              >
                            </SidebarMenuButton>
                          </Popover.Trigger>
                          <Popover.Content class="w-auto border-none p-0">
                            <UserCardModal
                              profileUser={member}
                              {openDetailedProfileModal}
                              isServerMemberContext={true}
                            />
                          </Popover.Content>
                        </Popover.Root>
                      </SidebarMenuItem>
                    {/each}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            {/each}
          </div>
        {/if}
      </ScrollArea>
    </SidebarContent>
  {/if}
</Sidebar>
