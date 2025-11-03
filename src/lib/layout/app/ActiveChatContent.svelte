<svelte:options runes={true} />

<script lang="ts">
  import NavigationHeader from "$lib/components/NavigationHeader.svelte";
  import { ChatView } from "$features/chat";
  import SearchSidebar from "$lib/components/sidebars/SearchSidebar.svelte";
  import MemberSidebar from "$lib/components/sidebars/MemberSidebar.svelte";
  import { chatSearchStore } from "$lib/features/chat/stores/chatSearchStore";
  import { memberSidebarVisibilityStore } from "$lib/features/chat/stores/memberSidebarVisibilityStore";
  import type { Chat } from "$lib/features/chat/models/Chat";
  import type { User } from "$lib/features/auth/models/User";

  type MemberWithRoles = User & Record<string, unknown>;

  let {
    chat,
    openDetailedProfileModal,
  }: {
    chat: Chat;
    openDetailedProfileModal: (user: User) => void;
  } = $props();

  const isGroupChat = $derived(chat.type === "group");
  const sidebarContext = $derived(isGroupChat ? "group" : "server");
  const groupOwnerId = $derived(isGroupChat ? chat.ownerId ?? null : null);

  const members = $derived(() => chat.members as MemberWithRoles[]);

  const shouldShowMemberSidebar = $derived(() => {
    const visibility = $memberSidebarVisibilityStore;
    const entry = visibility.get(chat.id);
    return entry !== false;
  });

  const showSearchSidebar = $derived($chatSearchStore.searching);
</script>

<div class="flex flex-1 min-h-0 flex-col">
  <NavigationHeader chat={chat} onOpenDetailedProfile={openDetailedProfileModal} />

  <div class="flex flex-1 min-h-0">
    <div class="flex flex-1 flex-col min-w-0">
      <ChatView {chat} />
    </div>

    {#if showSearchSidebar}
      <SearchSidebar {chat} />
    {:else if shouldShowMemberSidebar && chat.type !== "dm"}
      <MemberSidebar
        members={members}
        {openDetailedProfileModal}
        context={sidebarContext}
        groupId={isGroupChat ? chat.id : undefined}
        groupOwnerId={groupOwnerId ?? undefined}
      />
    {/if}
  </div>
</div>
