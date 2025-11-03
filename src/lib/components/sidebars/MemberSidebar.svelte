<script lang="ts">
  import { Users, MapPin, UserPlus, UserMinus } from "@lucide/svelte";
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
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button/index.js";
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
  import GroupMemberPicker from "$lib/components/users/GroupMemberPicker.svelte";
  import { friendStore } from "$lib/features/friends/stores/friendStore";
  import { chatStore } from "$lib/features/chat/stores/chatStore";
  import { toasts } from "$lib/stores/ToastStore";
  import { userStore } from "$lib/stores/userStore";
  import type { GroupModalUser } from "$lib/features/chat/utils/contextMenu";
  import type { Friend } from "$lib/features/friends/models/Friend";

  type MemberWithRoles = User & Record<string, unknown>;

  type OpenUserCardModalHandler = (
    ...args: [User, number, number, boolean]
  ) => void;
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
    serverId: providedServerId = undefined,
    context = "server",
    groupId: providedGroupId = undefined,
    groupOwnerId: providedGroupOwnerId = undefined,
  }: {
    members?: MemberWithRoles[];
    isSettingsPage?: boolean;
    openUserCardModal?: OpenUserCardModalHandler;
    openDetailedProfileModal?: OpenDetailedProfileHandler;
    roles?: Role[];
    serverId?: string | null;
    context?: "server" | "group";
    groupId?: string;
    groupOwnerId?: string | null;
  } = $props();

  const isServerContext = $derived(context === "server");

  const resolvedServerId = $derived(
    context === "server"
      ? (providedServerId ?? $serverStore.activeServerId ?? null)
      : (providedServerId ?? null),
  );

  const resolvedRoles: Role[] = $derived(
    context === "server"
      ? providedRoles?.length
        ? providedRoles
        : (() => {
            const activeServerId = $serverStore.activeServerId;
            if (!activeServerId) return [];
            const activeServer = $serverStore.servers.find(
              (server) => server.id === activeServerId,
            );
            return (activeServer?.roles ?? []) as Role[];
          })()
      : [],
  );

  const resolvedGroupId = $derived(
    context === "group" ? (providedGroupId ?? null) : null,
  );

  const resolvedGroupOwnerId = $derived(
    context === "group" ? (providedGroupOwnerId ?? null) : null,
  );

  const currentUserId = $derived($userStore.me?.id ?? null);

  let inviteeSelection = $state(new SvelteSet<string>());
  let showInviteMembersDialog = $state(false);
  let inviteMembersPending = $state(false);
  let removingMembers = $state(new SvelteSet<string>());

  const canInviteMembers = $derived(
    context === "group" && resolvedGroupId !== null,
  );

  const canRemoveMembers = $derived(
    context === "group" &&
      resolvedGroupId !== null &&
      currentUserId !== null &&
      currentUserId === resolvedGroupOwnerId,
  );

  const memberIdSet = $derived.by(() => {
    const set = new SvelteSet<string>();
    for (const member of members) {
      if (typeof member.id === "string") {
        set.add(member.id);
      }
    }
    return set;
  });

  const inviteCandidates = $derived.by(() => {
    if (!canInviteMembers) {
      return [] as GroupModalUser[];
    }
    const friends = ($friendStore.friends ?? []) as Friend[];
    const candidates: GroupModalUser[] = [];
    for (const friend of friends) {
      if (!friend?.id) {
        continue;
      }
      if (friend.id === currentUserId) {
        continue;
      }
      if (memberIdSet.has(friend.id)) {
        continue;
      }
      candidates.push({
        id: friend.id,
        name: friend.name,
        avatar: friend.avatar,
        isFriend: true,
        isPinned: Boolean(friend.isPinned),
      });
    }
    return candidates;
  });

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

  const hasInviteCandidates = $derived(() => inviteCandidates.length > 0);

  const inviteSubmitDisabled = $derived(
    inviteeSelection.size === 0 || inviteMembersPending,
  );

  function resetInviteSelection() {
    inviteeSelection = new SvelteSet();
  }

  function openInviteMembersDialog() {
    resetInviteSelection();
    showInviteMembersDialog = true;
  }

  function toggleInviteeSelection(userId: string) {
    const next = new SvelteSet(inviteeSelection);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    inviteeSelection = next;
  }

  function closeInviteMembersDialog() {
    if (inviteMembersPending) {
      return;
    }
    showInviteMembersDialog = false;
    resetInviteSelection();
  }

  async function submitInviteMembers() {
    if (!resolvedGroupId || inviteSubmitDisabled) {
      return;
    }

    const memberIds = Array.from(inviteeSelection);
    if (!memberIds.length) {
      return;
    }

    inviteMembersPending = true;
    try {
      await chatStore.addMembersToGroupChat(resolvedGroupId, memberIds);
      const message =
        memberIds.length === 1
          ? "Member invited to the group."
          : `${memberIds.length} members invited to the group.`;
      toasts.addToast(message, "success");
      showInviteMembersDialog = false;
      resetInviteSelection();
    } catch (error) {
      console.error("Failed to add members to group", error);
      toasts.addToast("Failed to add members to the group.", "error");
    } finally {
      inviteMembersPending = false;
    }
  }

  function canRemoveMember(member: MemberWithRoles) {
    if (!canRemoveMembers) {
      return false;
    }
    if (typeof member.id !== "string") {
      return false;
    }
    if (member.id === currentUserId) {
      return false;
    }
    if (resolvedGroupOwnerId && member.id === resolvedGroupOwnerId) {
      return false;
    }
    return true;
  }

  function isRemovingMember(memberId: string) {
    return removingMembers.has(memberId);
  }

  async function handleRemoveMember(member: MemberWithRoles) {
    if (
      !canRemoveMember(member) ||
      !resolvedGroupId ||
      typeof member.id !== "string"
    ) {
      return;
    }

    const confirmed = confirm(
      `Remove ${member.name || "this member"} from the group?`,
    );
    if (!confirmed) {
      return;
    }

    const next = new SvelteSet(removingMembers);
    next.add(member.id);
    removingMembers = next;

    try {
      await chatStore.removeGroupChatMember(resolvedGroupId, member.id);
      toasts.addToast(
        `${member.name ?? "Member"} removed from the group.`,
        "success",
      );
    } catch (error) {
      console.error("Failed to remove group member", error);
      toasts.addToast("Failed to remove member from the group.", "error");
    } finally {
      const cleanup = new SvelteSet(removingMembers);
      cleanup.delete(member.id);
      removingMembers = cleanup;
    }
  }
</script>

<Sidebar
  class="hidden lg:flex"
  data-settings-page={isSettingsPage}
  aria-label={isSettingsPage
    ? "Member settings"
    : context === "server"
      ? "Server members"
      : "Group members"}
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
      <div class="flex w-full flex-col">
        {#if canInviteMembers}
          <div class="px-3 pt-4">
            <Button
              class="w-full"
              size="sm"
              variant="outline"
              onclick={openInviteMembersDialog}
              disabled={!hasInviteCandidates}
            >
              <UserPlus class="mr-2 h-3.5 w-3.5" /> Invite members
            </Button>
          </div>
        {/if}
        <ScrollArea class="flex-1">
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
                      <span class="truncate text-foreground">{group.label}</span
                      >
                    </div>
                    <span class="text-xs font-semibold text-muted-foreground"
                      >{group.members.length}</span
                    >
                  </SidebarGroupLabel>
                  <SidebarGroupContent class="space-y-1">
                    <SidebarMenu class="space-y-1">
                      {#each group.members as member (member.id)}
                        <SidebarMenuItem>
                          <div class="flex items-center gap-1">
                            <Popover.Root class="flex-1">
                              <Popover.Trigger class="flex-1">
                                <SidebarMenuButton
                                  class="flex w-full items-center gap-3"
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
                                  <div class="min-w-0">
                                    <p
                                      class="truncate text-sm font-medium text-foreground"
                                    >
                                      {member.name}
                                    </p>
                                    {#if member.statusMessage}
                                      <p
                                        class="text-xs text-muted-foreground truncate"
                                        title={member.statusMessage}
                                      >
                                        {member.statusMessage}
                                      </p>
                                    {/if}
                                    {#if member.location}
                                      <p
                                        class="text-xs text-muted-foreground flex items-center gap-1"
                                        title={member.location}
                                      >
                                        <MapPin class="h-3 w-3" />
                                        <span class="truncate"
                                          >{member.location}</span
                                        >
                                      </p>
                                    {/if}
                                  </div>
                                </SidebarMenuButton>
                              </Popover.Trigger>
                              <Popover.Content
                                class="w-auto border-none p-0"
                              >
                                <UserCardModal
                                  profileUser={member}
                                  {openDetailedProfileModal}
                                  isServerMemberContext={isServerContext}
                                  {close}
                                  serverId={isServerContext
                                    ? (resolvedServerId ?? undefined)
                                    : undefined}
                                />
                              </Popover.Content>
                            </Popover.Root>
                            {#if typeof member.id === "string" && canRemoveMember(member)}
                              <Button
                                variant="ghost"
                                size="icon"
                                class="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                aria-label={`Remove ${member.name ?? "member"} from group`}
                                onclick={() => handleRemoveMember(member)}
                                disabled={isRemovingMember(member.id)}
                              >
                                <UserMinus class="h-4 w-4" />
                              </Button>
                            {/if}
                          </div>
                        </SidebarMenuItem>
                      {/each}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              {/each}
            </div>
          {/if}
        </ScrollArea>
      </div>
    </SidebarContent>
  {/if}
</Sidebar>

{#if canInviteMembers}
  <Dialog
    open={showInviteMembersDialog}
    onOpenChange={(value) => {
      if (!value) {
        closeInviteMembersDialog();
      }
    }}
  >
    <DialogContent class="sm:max-w-sm">
      <DialogHeader class="space-y-1">
        <DialogTitle>Invite members</DialogTitle>
        <DialogDescription>
          Choose friends to add to this group conversation.
        </DialogDescription>
      </DialogHeader>

      <GroupMemberPicker
        users={inviteCandidates}
        selectedUserIds={inviteeSelection}
        onToggleUser={toggleInviteeSelection}
        emptyStateMessage={hasInviteCandidates
          ? "No users found."
          : "No friends available to invite."}
      />

      <DialogFooter>
        <Button
          class="w-full"
          onclick={submitInviteMembers}
          disabled={inviteSubmitDisabled}
        >
          {inviteMembersPending ? "Inviting..." : "Invite members"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
{/if}
