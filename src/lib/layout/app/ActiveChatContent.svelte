<svelte:options runes={true} />

<script lang="ts">
  import { onMount } from "svelte";
  import NavigationHeader from "$lib/components/NavigationHeader.svelte";
  import { ChatView } from "$features/chat";
  import SearchSidebar from "$lib/components/sidebars/SearchSidebar.svelte";
  import SearchResultsPanel from "$lib/components/sidebars/SearchResultsPanel.svelte";
  import MemberSidebar from "$lib/components/sidebars/MemberSidebar.svelte";
  import { Dialog, DialogContent } from "$lib/components/ui/dialog";
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

  const isGroupChat = $derived(() => chat.type === "group");
  const sidebarContext = $derived(() => (isGroupChat() ? "group" : "server"));
  const groupOwnerId = $derived(() =>
    chat.type === "group" ? chat.ownerId ?? null : null,
  );

  const members = $derived(() =>
    chat.type === "dm" ? [] : (chat.members as MemberWithRoles[]),
  );

  const shouldShowMemberSidebar = $derived(() => {
    const visibility = $memberSidebarVisibilityStore;
    const entry = visibility.get(chat.id);
    return entry !== false;
  });

  const showSearchSidebar = $derived(() => $chatSearchStore.searching);

  const LG_BREAKPOINT = 1024;

  let isLgViewport = $state(true);
  let mobileDialogOpen = $state(false);

  function updateViewportMatch() {
    if (typeof window === "undefined") {
      return;
    }
    isLgViewport = window.innerWidth >= LG_BREAKPOINT;
  }

  onMount(() => {
    updateViewportMatch();
    const handler = () => updateViewportMatch();
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("resize", handler);
    };
  });

  $effect(() => {
    if (isLgViewport) {
      if (mobileDialogOpen) {
        mobileDialogOpen = false;
      }
      if ($chatSearchStore.mobileResultsOpen) {
        chatSearchStore.setMobileResultsOpen(false);
      }
      return;
    }

    mobileDialogOpen = $chatSearchStore.mobileResultsOpen;
  });

  function handleMobileDialogOpenChange(open: boolean) {
    if (open) {
      chatSearchStore.setMobileResultsOpen(true);
    } else {
      chatSearchStore.setMobileResultsOpen(false);
    }
  }
</script>

<div class="flex flex-1 min-h-0 flex-col">
  <NavigationHeader chat={chat} onOpenDetailedProfile={openDetailedProfileModal} />

  <div class="flex flex-1 min-h-0">
    <div class="flex flex-1 flex-col min-w-0">
      <ChatView {chat} />
    </div>

    {#if showSearchSidebar()}
      <SearchSidebar {chat} />
    {:else if shouldShowMemberSidebar() && chat.type !== "dm"}
      <MemberSidebar
        members={members()}
        {openDetailedProfileModal}
        context={sidebarContext()}
        groupId={isGroupChat() ? chat.id : undefined}
        groupOwnerId={groupOwnerId() ?? undefined}
      />
    {/if}
  </div>
</div>

<Dialog open={mobileDialogOpen} onOpenChange={handleMobileDialogOpenChange}>
  <DialogContent
    class="w-full max-w-[min(420px,calc(100vw-1.5rem))] border-none bg-transparent p-0 shadow-none sm:max-w-md"
    showCloseButton={false}
  >
    <div
      class="w-full overflow-hidden rounded-lg border border-border bg-card shadow-xl"
      data-testid="mobile-search-results"
    >
      <SearchResultsPanel {chat} variant="dialog" />
    </div>
  </DialogContent>
</Dialog>
