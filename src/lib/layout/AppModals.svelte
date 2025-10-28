<script lang="ts">
  import { get } from "svelte/store";
  import CreateGroupModal from "$lib/components/modals/CreateGroupModal.svelte";
  import ReportUserModal from "$lib/components/modals/ReportUserModal.svelte";
  import ServerManagementModal from "$lib/components/modals/ServerManagementModal.svelte";
  import DetailedProfileModal from "$lib/components/modals/DetailedProfileModal.svelte";
  import UserCardModal from "$lib/components/modals/UserCardModal.svelte";
  import CollaborativeDocumentModal from "$lib/features/collaboration/components/CollaborativeDocumentModal.svelte";
  import CollaborativeWhiteboard from "$lib/features/collaboration/components/CollaborativeWhiteboard.svelte";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import type { Friend } from "$lib/features/friends/models/Friend";
  import type { AppModalType } from "./createAppController";
  import type {
    GroupModalUser,
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
    allUsers?: Friend[];
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

  const groupModalUsers = $derived(
    allUsers.map((user) => ({
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      isFriend: true,
      isPinned: Boolean(user.isPinned),
    })),
  );

  const collaborationDocumentProps = modalProps as Partial<{
    documentId: string;
    initialContent: string;
    kind: import("$lib/features/collaboration/collabDocumentStore").CollaborationSessionKind;
  }>;

  const collaborationWhiteboardProps = modalProps as Partial<{
    documentId: string;
  }>;
</script>

{#if activeModal === "createGroup"}
  <CreateGroupModal
    onclose={closeModal}
    allUsers={groupModalUsers}
    preselectedUserIds={groupModalProps?.preselectedUserIds}
    additionalUsers={groupModalProps?.additionalUsers}
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
  <DetailedProfileModal {...modalProps} close={closeModal} />
{/if}

{#if activeModal === "userCard" && modalProps?.profileUser}
  <div class="fixed inset-0 z-[70]" onclick={closeModal} role="presentation">
    <div
      class="absolute"
      style={`left: ${modalProps.x ?? 0}px; top: ${modalProps.y ?? 0}px;`}
      onclick={(event) => event.stopPropagation()}
      role="presentation"
    >
      <UserCardModal
        profileUser={modalProps.profileUser}
        openDetailedProfileModal={modalProps.openDetailedProfileModal}
        isServerMemberContext={modalProps.isServerMemberContext ?? false}
        close={closeModal}
      />
    </div>
  </div>
{/if}

{#if activeModal === "reportUser"}
  <ReportUserModal onclose={closeModal} payload={reportUserModalPayload} />
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
