<svelte:options runes={true} />

<script lang="ts">
  import { getContext } from "svelte";
  import ChatSearch from "$lib/components/navigation/ChatSearch.svelte";
  import ChatSummary from "$lib/components/navigation/ChatSummary.svelte";
  import CallControls from "$lib/components/navigation/CallControls.svelte";
  import ChatActionMenu from "$lib/components/navigation/ChatActionMenu.svelte";
  import FriendsHeader from "$lib/components/navigation/FriendsHeader.svelte";
  import EmptyHeader from "$lib/components/navigation/EmptyHeader.svelte";
  import CallModal from "$lib/features/calls/components/CallModal.svelte";
  import { CREATE_GROUP_CONTEXT_KEY } from "$lib/contextKeys";
  import type { CreateGroupContext } from "$lib/contextTypes";
  import type { Chat } from "$lib/features/chat/models/Chat";
  import type { User } from "$lib/features/auth/models/User";
  import { userStore } from "$lib/stores/userStore";
  import { activeChatTypingUsers } from "$lib/features/chat/stores/chatStore";
  import { getTypingStatusLabel } from "$lib/features/chat/utils/typingStatus";

  const friendsTabs = ["All", "Online", "Blocked", "Pending"] as const;

  let {
    chat,
    onOpenDetailedProfile,
    isFriendsOrRootPage = false,
    friendsActiveTab = "All",
    onFriendsTabSelect = () => {},
    onFriendsAddClick = () => {},
  } = $props<{
    chat: Chat | null;
    onOpenDetailedProfile: (user: User) => void;
    isFriendsOrRootPage?: boolean;
    friendsActiveTab?: string;
    onFriendsTabSelect?: (tab: string) => void;
    onFriendsAddClick?: () => void;
  }>();

  const context = getContext<CreateGroupContext | undefined>(
    CREATE_GROUP_CONTEXT_KEY,
  );
  const openUserCardModal = context?.openUserCardModal;

  let chatSearchRef = $state<InstanceType<typeof ChatSearch> | null>(null);

  const typingStatusLabel = $derived(() =>
    getTypingStatusLabel(chat ?? null, $activeChatTypingUsers, $userStore.me),
  );

  function handleAvatarClick(event: MouseEvent, user: User) {
    openUserCardModal?.(user, event.clientX, event.clientY, false);
  }

  function handleNameClick(event: MouseEvent, user: User) {
    openUserCardModal?.(user, event.clientX, event.clientY, false);
  }

  function handleNameDoubleClick(user: User) {
    onOpenDetailedProfile?.(user);
  }

  async function applyPinnedFilter() {
    await chatSearchRef?.applyPinnedFilter?.();
  }
</script>

{#if isFriendsOrRootPage}
  <FriendsHeader
    tabs={friendsTabs}
    activeTab={friendsActiveTab}
    onTabSelect={onFriendsTabSelect}
    onAddFriend={onFriendsAddClick}
  />
{:else if chat}
  <header
    class="h-[55px] border-b border-border px-4 flex items-center justify-between bg-card"
  >
    <ChatSummary
      {chat}
      typingStatus={typingStatusLabel}
      onAvatarClick={handleAvatarClick}
      onNameClick={handleNameClick}
      onNameDoubleClick={handleNameDoubleClick}
    />

    <div class="flex items-center gap-2">
      <CallControls {chat} />
      <ChatActionMenu {chat} {applyPinnedFilter} />
      <ChatSearch bind:this={chatSearchRef} {chat} />
    </div>
  </header>
{:else}
  <EmptyHeader />
{/if}

<CallModal />
