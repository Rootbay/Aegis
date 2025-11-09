<script lang="ts">
  import { get } from "svelte/store";
  import CreateGroupModal from "$lib/components/modals/CreateGroupModal.svelte";
  import ReportUserModal from "$lib/components/modals/ReportUserModal.svelte";
  import ReportMessageModal from "$lib/components/modals/ReportMessageModal.svelte";
  import ServerManagementModal from "$lib/components/modals/ServerManagementModal.svelte";
  import DetailedProfileModal from "$lib/components/modals/DetailedProfileModal.svelte";
  import ProfileReviewsModal from "$lib/components/modals/ProfileReviewsModal.svelte";
  import UserCardModal from "$lib/components/modals/UserCardModal.svelte";
  import CollaborativeDocumentModal from "$lib/features/collaboration/components/CollaborativeDocumentModal.svelte";
  import CollaborativeWhiteboard from "$lib/features/collaboration/components/CollaborativeWhiteboard.svelte";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import type { AppModalType } from "./createAppController";
  import type {
    GroupModalUser,
    ReportMessageModalPayload,
    ReportUserModalPayload,
  } from "$lib/features/chat/utils/contextMenu";

  type ModalProps = Record<string, unknown>;

  let {
    activeModal = null,
    modalProps = {},
    allUsers = [],
    closeModal = () => {},
  }: {
    activeModal?: AppModalType | null;
    modalProps?: ModalProps;
    allUsers?: GroupModalUser[];
    closeModal?: () => void;
  } = $props();

  function handleServerCreated(
    server: Parameters<typeof serverStore.addServer>[0],
  ) {
    serverStore.addServer(server);
  }

  async function handleServerJoined(
    server: Parameters<typeof serverStore.addServer>[0],
  ) {
    const { servers } = get(serverStore);
    const existingServer = servers.find((s) => s.id === server.id);

    if (existingServer) {
      const result = await serverStore.updateServer(server.id, server);
      if (!result.success) {
        console.error("Failed to reconcile joined server state:", result.error);
      }
    } else {
      serverStore.addServer(server);
    }

    serverStore.setActiveServer(server.id);
  }
  const groupModalProps = modalProps as Partial<{
    preselectedUserIds: string[];
    additionalUsers: GroupModalUser[];
  }>;

  const reportUserModalPayload = modalProps as ReportUserModalPayload;
  const reportMessageModalPayload = modalProps as ReportMessageModalPayload;

  function normalizeAdditionalUsers(
    canonicalUsers: GroupModalUser[],
    additional?: GroupModalUser[],
  ) {
    if (!additional?.length) {
      return additional;
    }

    const canonicalMap = new Map(
      canonicalUsers.map((user) => [user.id, user] as const),
    );

    return additional.map((user) => {
      const canonical = canonicalMap.get(user.id);
      if (canonical) {
        return canonical;
      }

      if (user.source) {
        return user;
      }

      return {
        ...user,
        source: user.isFriend ? "friend" : "recentDm",
      };
    });
  }

  const normalizedAdditionalUsers = $derived(
    normalizeAdditionalUsers(allUsers, groupModalProps?.additionalUsers),
  );

  const collaborationDocumentProps = modalProps as Partial<{
    documentId: string;
    initialContent: string;
    kind: import("$lib/features/collaboration/collabDocumentStore").CollaborationSessionKind;
  }>;

  type DetailedProfileProps = {
    profileUser?: import("$lib/features/auth/models/User").User;
    mutualFriends?: import("$lib/features/auth/models/User").User[];
    mutualServers?: import("$lib/features/servers/models/Server").Server[];
    mutualGroups?: Array<{
      serverId: string;
      serverName: string;
      channelId: string;
      channelName: string;
    }>;
  };

  const collaborationWhiteboardProps = modalProps as Partial<{
    documentId: string;
  }>;
</script>

{#if activeModal === "createGroup"}
  <CreateGroupModal
    onclose={closeModal}
    allUsers={allUsers}
    preselectedUserIds={groupModalProps?.preselectedUserIds}
    additionalUsers={
      normalizedAdditionalUsers ?? groupModalProps?.additionalUsers
    }
  />
{/if}

{#if activeModal === "serverManagement"}
  <ServerManagementModal
    show={true}
    onclose={closeModal}
    onserverCreated={handleServerCreated}
    onserverJoined={handleServerJoined}
  />
{/if}

{#if activeModal === "detailedProfile"}
  {@const detailedProfileProps = modalProps as DetailedProfileProps}
  {#if detailedProfileProps.profileUser}
    <DetailedProfileModal
      profileUser={detailedProfileProps.profileUser}
      mutualFriends={detailedProfileProps.mutualFriends ?? []}
      mutualServers={detailedProfileProps.mutualServers ?? []}
      mutualGroups={detailedProfileProps.mutualGroups ?? []}
      close={closeModal}
    />
  {/if}
{/if}

{#if activeModal === "profileReviews"}
  {@const profileReviewsProps = modalProps as {
    subjectType?: "user" | "server";
    subjectId?: string;
    subjectName?: string;
    subjectAvatarUrl?: string | null;
  }}
  {#if profileReviewsProps.subjectType && profileReviewsProps.subjectId}
    <ProfileReviewsModal
      subjectType={profileReviewsProps.subjectType}
      subjectId={profileReviewsProps.subjectId}
      subjectName={profileReviewsProps.subjectName}
      subjectAvatarUrl={profileReviewsProps.subjectAvatarUrl}
      close={closeModal}
    />
  {/if}
{/if}

{#if activeModal === "userCard" && modalProps?.profileUser}
  {@const userCardProps = modalProps as {
    profileUser: import("$lib/features/auth/models/User").User;
    openDetailedProfileModal?: (
      user: import("$lib/features/auth/models/User").User,
    ) => void;
    isServerMemberContext?: boolean;
    x?: number;
    y?: number;
  }}
  <div class="fixed inset-0 z-[70]" onclick={closeModal} role="presentation">
    <div
      class="absolute"
      style={`left: ${userCardProps.x ?? 0}px; top: ${userCardProps.y ?? 0}px;`}
      onclick={(event) => event.stopPropagation()}
      role="presentation"
    >
      <UserCardModal
        profileUser={userCardProps.profileUser}
        openDetailedProfileModal={
          userCardProps.openDetailedProfileModal ?? (() => {})
        }
        isServerMemberContext={userCardProps.isServerMemberContext ?? false}
        close={closeModal}
      />
    </div>
  </div>
{/if}

{#if activeModal === "reportUser"}
  <ReportUserModal onclose={closeModal} payload={reportUserModalPayload} />
{/if}

{#if activeModal === "reportMessage"}
  <ReportMessageModal
    onclose={closeModal}
    payload={reportMessageModalPayload}
  />
{/if}

{#if activeModal === "collaborationDocument"}
  <CollaborativeDocumentModal
    onclose={closeModal}
    documentId={collaborationDocumentProps?.documentId}
    initialContent={collaborationDocumentProps?.initialContent}
    kind={collaborationDocumentProps?.kind}
  />
{/if}

{#if activeModal === "collaborationWhiteboard"}
  <CollaborativeWhiteboard
    onclose={closeModal}
    documentId={collaborationWhiteboardProps?.documentId}
  />
{/if}
