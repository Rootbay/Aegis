<svelte:options runes={true} />

<script lang="ts">
  import { getContext } from "svelte";
  import { derived } from "svelte/store";
  import { page } from "$app/stores";
  import EmptyHeader from "$lib/components/navigation/EmptyHeader.svelte";
  import { CREATE_GROUP_CONTEXT_KEY } from "$lib/contextKeys";
  import type { CreateGroupContext } from "$lib/contextTypes";
  import type { Chat } from "$lib/features/chat/models/Chat";
  import type { User } from "$lib/features/auth/models/User";
  import FriendsNavigationHeader from "$lib/components/navigation/FriendsNavigationHeader.svelte";
  import ChatNavigationHeader from "$lib/components/navigation/ChatNavigationHeader.svelte";
  import DiscoverNavigationHeader from "$lib/components/navigation/DiscoverNavigationHeader.svelte";
  import { FRIENDS_NAVIGATION_TABS } from "$lib/components/navigation/constants";

  let {
    chat,
    onOpenDetailedProfile,
    isFriendsOrRootPage = false,
    friendsActiveTab = FRIENDS_NAVIGATION_TABS[0],
    onFriendsTabSelect = () => {},
    onFriendsAddClick = () => {},
    showMemberPanelToggle = false,
    mobileMemberPanelOpen = false,
    onToggleMemberPanel = () => {},
  } = $props<{
    chat: Chat | null;
    onOpenDetailedProfile: (user: User) => void;
    isFriendsOrRootPage?: boolean;
    friendsActiveTab?: string;
    onFriendsTabSelect?: (tab: string) => void;
    onFriendsAddClick?: () => void;
    showMemberPanelToggle?: boolean;
    mobileMemberPanelOpen?: boolean;
    onToggleMemberPanel?: () => void;
  }>();

  const context = getContext<CreateGroupContext | undefined>(
    CREATE_GROUP_CONTEXT_KEY,
  );
  const openUserCardModal = context?.openUserCardModal;

  const isDiscoverPage = derived(page, ($page) =>
    $page.url.pathname.startsWith("/discover-servers"),
  );
</script>

{#if isFriendsOrRootPage}
  <FriendsNavigationHeader
    activeTab={friendsActiveTab}
    onTabSelect={onFriendsTabSelect}
    onAddFriend={onFriendsAddClick}
  />
{:else if chat}
  <ChatNavigationHeader
    {chat}
    {onOpenDetailedProfile}
    {openUserCardModal}
    {showMemberPanelToggle}
    {mobileMemberPanelOpen}
    {onToggleMemberPanel}
  />
{:else if $isDiscoverPage}
  <DiscoverNavigationHeader />
{:else}
  <EmptyHeader />
{/if}
