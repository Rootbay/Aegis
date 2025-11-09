<svelte:options runes={true} />

<script lang="ts">
  import { X } from "@lucide/svelte";
  import type { Role } from "$lib/features/servers/models/Role";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { Separator } from "$lib/components/ui/separator";
  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
  } from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Sidebar, SidebarHeader } from "$lib/components/ui/sidebar";
  import UserCardModal from "$lib/components/modals/UserCardModal.svelte";
  import GroupMemberPicker from "$lib/components/users/GroupMemberPicker.svelte";
  import { friendStore } from "$lib/features/friends/stores/friendStore";
  import { chatStore } from "$lib/features/chat/stores/chatStore";
  import { toasts } from "$lib/stores/ToastStore";
  import { userStore } from "$lib/stores/userStore";
  import type { GroupModalUser } from "$lib/features/chat/utils/contextMenu";
  import type { Friend } from "$lib/features/friends/models/Friend";
  import {
    groupMembersByRole,
    type MemberWithRoles,
  } from "$lib/components/sidebars/memberSidebar/groupMembers";
  import { buildInviteCandidates } from "$lib/components/sidebars/memberSidebar/inviteCandidates";
  import MemberListContent from "$lib/components/sidebars/memberSidebar/MemberListContent.svelte";
  import type {
    OpenDetailedProfileHandler,
    OpenUserCardModalHandler,
  } from "$lib/components/sidebars/memberSidebar/types";

  type MemberSidebarProps = {
    members?: MemberWithRoles[];
    isSettingsPage?: boolean;
    openUserCardModal?: OpenUserCardModalHandler;
    openDetailedProfileModal?: OpenDetailedProfileHandler;
    roles?: Role[];
    serverId?: string | null;
    context?: "server" | "group";
    groupId?: string;
    groupOwnerId?: string | null;
    variant?: "desktop" | "mobile";
    mobileOpen?: boolean;
    onMobileOpenChange?: (open: boolean) => void;
  };

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
    variant = "desktop",
    mobileOpen = false,
    onMobileOpenChange = () => {},
  }: MemberSidebarProps = $props();

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

  let inviteeSelection = $state(new Set<string>());
  let showInviteMembersDialog = $state(false);
  let inviteMembersPending = $state(false);
  let removingMembers = $state(new Set<string>());

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
    const set = new Set<string>();
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
    return buildInviteCandidates({
      friends,
      currentUserId,
      existingMemberIds: memberIdSet,
    });
  });

  let groupedMembers = $derived(groupMembersByRole(members, resolvedRoles));

  const hasInviteCandidates = $derived(() => inviteCandidates.length > 0);

  const inviteSubmitDisabled = $derived(
    inviteeSelection.size === 0 || inviteMembersPending,
  );

  const sidebarAriaLabel = $derived(
    isSettingsPage
      ? "Member settings"
      : context === "server"
        ? "Server members"
        : "Group members",
  );

  function resetInviteSelection() {
    inviteeSelection = new Set();
  }

  function openInviteMembersDialog() {
    resetInviteSelection();
    showInviteMembersDialog = true;
  }

  function toggleInviteeSelection(userId: string) {
    const next = new Set(inviteeSelection);
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

    const next = new Set(removingMembers);
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
      const cleanup = new Set(removingMembers);
      cleanup.delete(member.id);
      removingMembers = cleanup;
    }
  }

  function handleMobileOpenChange(open: boolean) {
    onMobileOpenChange?.(open);
  }
</script>

{#if variant === "desktop"}
  <Sidebar
    class="hidden lg:flex"
    data-settings-page={isSettingsPage}
    aria-label={sidebarAriaLabel}
    data-testid="desktop-member-sidebar"
  >
    {#if isSettingsPage}
      <SidebarHeader>
        <h2 class="text-lg font-semibold text-foreground">Settings</h2>
      </SidebarHeader>
      <Separator class="opacity-50" />
      <MemberListContent
        members={members}
        groupedMembers={groupedMembers}
        canInviteMembers={canInviteMembers}
        hasInviteCandidates={hasInviteCandidates()}
        onInviteMembers={openInviteMembersDialog}
        canRemoveMember={canRemoveMember}
        onRemoveMember={handleRemoveMember}
        isRemovingMember={isRemovingMember}
        {openUserCardModal}
        variant="desktop"
        isServerContext={isServerContext}
        resolvedServerId={resolvedServerId}
      >
        <svelte:fragment
          slot="user-card"
          let:member
          let:close
          let:isServerContext
          let:resolvedServerId
        >
          <UserCardModal
            profileUser={member}
            {openDetailedProfileModal}
            isServerMemberContext={isServerContext}
            {close}
            serverId={
              isServerContext ? (resolvedServerId ?? undefined) : undefined
            }
          />
        </svelte:fragment>
      </MemberListContent>
    {:else}
      <MemberListContent
        members={members}
        groupedMembers={groupedMembers}
        canInviteMembers={canInviteMembers}
        hasInviteCandidates={hasInviteCandidates()}
        onInviteMembers={openInviteMembersDialog}
        canRemoveMember={canRemoveMember}
        onRemoveMember={handleRemoveMember}
        isRemovingMember={isRemovingMember}
        {openUserCardModal}
        variant="desktop"
        isServerContext={isServerContext}
        resolvedServerId={resolvedServerId}
      >
        <svelte:fragment
          slot="user-card"
          let:member
          let:close
          let:isServerContext
          let:resolvedServerId
        >
          <UserCardModal
            profileUser={member}
            {openDetailedProfileModal}
            isServerMemberContext={isServerContext}
            {close}
            serverId={
              isServerContext ? (resolvedServerId ?? undefined) : undefined
            }
          />
        </svelte:fragment>
      </MemberListContent>
    {/if}
  </Sidebar>
{:else if variant === "mobile"}
  <Dialog open={mobileOpen} onOpenChange={handleMobileOpenChange}>
    <DialogContent
      class="w-full max-w-[min(420px,calc(100vw-1.5rem))] border-none bg-transparent p-0 shadow-none sm:max-w-sm"
      showCloseButton={false}
      data-testid="mobile-member-panel"
    >
      <div class="w-full overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <div class="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p class="text-sm font-semibold text-foreground">
              {sidebarAriaLabel}
            </p>
            {#if canInviteMembers}
              <p class="text-xs text-muted-foreground">
                Manage group members
              </p>
            {/if}
          </div>
          <DialogClose>
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8 text-muted-foreground"
              aria-label="Close members panel"
              onclick={() => close?.()}
            >
              <X class="h-4 w-4" />
            </Button>
          </DialogClose>
        </div>
        <MemberListContent
          members={members}
          groupedMembers={groupedMembers}
          canInviteMembers={canInviteMembers}
          hasInviteCandidates={hasInviteCandidates()}
          onInviteMembers={openInviteMembersDialog}
          canRemoveMember={canRemoveMember}
          onRemoveMember={handleRemoveMember}
          isRemovingMember={isRemovingMember}
          {openUserCardModal}
          variant="mobile"
          isServerContext={isServerContext}
          resolvedServerId={resolvedServerId}
        >
          <svelte:fragment
            slot="user-card"
            let:member
            let:close
            let:isServerContext
            let:resolvedServerId
          >
            <UserCardModal
              profileUser={member}
              {openDetailedProfileModal}
              isServerMemberContext={isServerContext}
              {close}
              serverId={
                isServerContext ? (resolvedServerId ?? undefined) : undefined
              }
            />
          </svelte:fragment>
        </MemberListContent>
      </div>
    </DialogContent>
  </Dialog>
{/if}

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
        emptyStateMessage={hasInviteCandidates()
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
