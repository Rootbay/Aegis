<svelte:options runes={true} />

<script lang="ts">
  import NavigationHeader from "$lib/components/NavigationHeader.svelte";
  import type { Chat } from "$lib/features/chat/models/Chat";
  import type { User } from "$lib/features/auth/models/User";

  let {
    chat,
    openDetailedProfileModal,
    friendsActiveTab,
    onFriendsTabSelect,
    onFriendsAddClick,
    children,
  }: {
    chat: Chat | null;
    openDetailedProfileModal: (user: User) => void;
    friendsActiveTab: string;
    onFriendsTabSelect: (tab: string) => void;
    onFriendsAddClick: () => void;
    children: () => unknown;
  } = $props();
</script>

<div class="flex flex-1 min-h-0 flex-col">
  <NavigationHeader
    {chat}
    onOpenDetailedProfile={openDetailedProfileModal}
    isFriendsOrRootPage={true}
    friendsActiveTab={friendsActiveTab}
    onFriendsTabSelect={onFriendsTabSelect}
    onFriendsAddClick={onFriendsAddClick}
  />

  <section class="flex-1 min-h-0 flex flex-col">
    {@render children()}
  </section>
</div>
