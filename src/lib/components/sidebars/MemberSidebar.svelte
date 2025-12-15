<svelte:options runes={true} />

<script lang="ts">
  import { X } from "@lucide/svelte";
  import type { Role } from "$lib/features/servers/models/Role";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
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
    extractMemberRoleValues,
    type MemberWithRoles,
  } from "$lib/components/sidebars/memberSidebar/groupMembers";
  import { buildInviteCandidates } from "$lib/components/sidebars/memberSidebar/inviteCandidates";
  import MemberListContent from "$lib/components/sidebars/memberSidebar/MemberListContent.svelte";
  import type {
    OpenDetailedProfileHandler,
    OpenUserCardModalHandler,
  } from "$lib/components/sidebars/memberSidebar/types";
  import { onMount } from "svelte";

  /* eslint-disable no-unused-vars */
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
    onMobileOpenChange?: (arg0: boolean) => void;
  };
  /* eslint-enable no-unused-vars */

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

  const MEMBER_SIDEBAR_MIN_WIDTH = 220;
  const MEMBER_SIDEBAR_MAX_WIDTH = 420;
  const DEFAULT_MEMBER_SIDEBAR_WIDTH = 260;
  const MEMBER_SIDEBAR_WIDTH_STORAGE_KEY = "memberSidebarWidth";

  let sidebarWidth = $state(DEFAULT_MEMBER_SIDEBAR_WIDTH);
  let initialWidth = DEFAULT_MEMBER_SIDEBAR_WIDTH;
  let initialX = 0;
  let isResizing = false;
  let rafId: number | null = null;

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

  function getMemberRoleObjects(member: MemberWithRoles): Role[] {
    const identifiers = extractMemberRoleValues(member);
    if (identifiers.length === 0) {
      return [];
    }
    const normalized = new Set(
      identifiers.map((value) => value.toLowerCase()),
    );
    return resolvedRoles.filter((role) => {
      if (identifiers.includes(role.id)) {
        return true;
      }
      if (!role.name) {
        return false;
      }
      return normalized.has(role.name.toLowerCase());
    });
  }

  function handleAddRolesClick() {
    if (!resolvedServerId) return;
    goto(`/channels/${resolvedServerId}/settings?tab=members`);
  }

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

  function clampSidebarWidth(value: number) {
    return Math.max(
      MEMBER_SIDEBAR_MIN_WIDTH,
      Math.min(MEMBER_SIDEBAR_MAX_WIDTH, value),
    );
  }

  function persistSidebarWidth() {
    if (!browser) {
      return;
    }
    try {
      localStorage.setItem(
        MEMBER_SIDEBAR_WIDTH_STORAGE_KEY,
        sidebarWidth.toString(),
      );
    } catch (error) {
      void error;
    }
  }

  function startResize(e: MouseEvent) {
    if (e.button !== 0) {
      return;
    }
    e.preventDefault();
    isResizing = true;
    initialX = e.clientX;
    initialWidth = sidebarWidth;
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResize);
  }

  function resize(e: MouseEvent) {
    if (!isResizing) {
      return;
    }
    const targetWidth = clampSidebarWidth(
      initialWidth - (e.clientX - initialX),
    );
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(() => {
      sidebarWidth = targetWidth;
      rafId = null;
    });
  }

  function stopResize() {
    if (!isResizing) {
      return;
    }
    isResizing = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    persistSidebarWidth();
    window.removeEventListener("mousemove", resize);
    window.removeEventListener("mouseup", stopResize);
  }

  onMount(() => {
    if (!browser) {
      return;
    }
    try {
      const storedWidth = localStorage.getItem(
        MEMBER_SIDEBAR_WIDTH_STORAGE_KEY,
      );
      if (storedWidth) {
        const parsed = Number.parseInt(storedWidth, 10);
        if (!Number.isNaN(parsed)) {
          const clamped = clampSidebarWidth(parsed);
          sidebarWidth = clamped;
          initialWidth = clamped;
        }
      }
    } catch (error) {
      void error;
    }

    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResize);
      if (isResizing) {
        isResizing = false;
        persistSidebarWidth();
      }
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  });

  function handleMobileOpenChange(open: boolean) {
    onMobileOpenChange?.(open);
  }
</script>

{#snippet userCardSnippet({ member }: { member: MemberWithRoles })}
  <UserCardModal
    profileUser={member}
    {openDetailedProfileModal}
    isServerMemberContext={isServerContext}
    memberRoles={isServerContext ? getMemberRoleObjects(member) : []}
    onAddRoles={isServerContext ? handleAddRolesClick : undefined}
  />
{/snippet}

{#if variant === "desktop"}
  <Sidebar
    class="hidden lg:flex relative"
    style={`width:${sidebarWidth}px; min-width:${MEMBER_SIDEBAR_MIN_WIDTH}px; max-width:${MEMBER_SIDEBAR_MAX_WIDTH}px;`}
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
        userCard={userCardSnippet} 
      />
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
        userCard={userCardSnippet}
      />
    {/if}
    <button
      type="button"
      class="absolute top-0 left-0 h-full w-3 -translate-x-1/2 cursor-ew-resize rounded-r-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      aria-label="Resize members panel"
      onmousedown={startResize}
    ></button>
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
          userCard={userCardSnippet}
        />
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
