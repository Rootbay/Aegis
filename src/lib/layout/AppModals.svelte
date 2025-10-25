<script lang="ts">
  import { get } from "svelte/store";
  import CreateGroupModal from "$lib/components/modals/CreateGroupModal.svelte";
  import ServerManagementModal from "$lib/components/modals/ServerManagementModal.svelte";
  import ProfileModal from "$lib/components/modals/ProfileModal.svelte";
  import UserCardModal from "$lib/components/modals/UserCardModal.svelte";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import type { Friend } from "$lib/features/friends/models/Friend";
  import type { AppModalType } from "./createAppController";

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

  function handleServerCreated(server: Parameters<typeof serverStore.addServer>[0]) {
    serverStore.addServer(server);
  }

  function handleServerJoined(server: Parameters<typeof serverStore.addServer>[0]) {
    const { servers } = get(serverStore);
    const existingServer = servers.find((s) => s.id === server.id);

    if (existingServer) {
      serverStore.updateServer(server.id, server);
    } else {
      serverStore.addServer(server);
    }

    serverStore.setActiveServer(server.id);
  }
</script>

{#if activeModal === "createGroup"}
  <CreateGroupModal onclose={closeModal} allUsers={allUsers} />
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
  <ProfileModal {...modalProps} close={closeModal} />
{/if}

{#if activeModal === "userCard" && modalProps?.profileUser}
  <div
    class="fixed inset-0 z-[70]"
    onclick={closeModal}
    role="presentation"
  >
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
