<svelte:options runes={true} />

<script lang="ts">
  import ChatSummary from "$lib/components/navigation/ChatSummary.svelte";
  import CallControls from "$lib/components/navigation/CallControls.svelte";
  import ChatActionMenu from "$lib/components/navigation/ChatActionMenu.svelte";
  import ChatSearch from "$lib/components/navigation/ChatSearch.svelte";
  import { userStore } from "$lib/stores/userStore";
  import { activeChatTypingUsers } from "$lib/features/chat/stores/chatStore";
  import { getTypingStatusLabel } from "$lib/features/chat/utils/typingStatus";

  import type { Chat } from "$lib/features/chat/models/Chat";
  import type { User } from "$lib/features/auth/models/User";
  import type { Component } from "svelte";

  type OpenUserCardModal = (
    user: User,
    x: number,
    y: number,
    isServerMemberContext: boolean,
  ) => void;

  let { chat, openUserCardModal, onOpenDetailedProfile } = $props<{
    chat: Chat;
    openUserCardModal?: OpenUserCardModal;
    onOpenDetailedProfile: (user: User) => void;
  }>();

  type ComponentExports<T> = T extends Component<any, infer Exports> ? Exports : never;
  type ChatSearchExports = ComponentExports<typeof ChatSearch>;

  let chatSearchRef = $state<ChatSearchExports | null>(null);

  const typingStatusLabel = $derived(() =>
    getTypingStatusLabel(chat, $activeChatTypingUsers, $userStore.me),
  );

  function handleAvatarClick(event: MouseEvent, user: User) {
    openUserCardModal?.(user, event.clientX, event.clientY, false);
  }

  function handleNameClick(event: MouseEvent, user: User) {
    openUserCardModal?.(user, event.clientX, event.clientY, false);
  }

  function handleNameDoubleClick(user: User) {
    onOpenDetailedProfile(user);
  }

  async function applyPinnedFilter() {
    await chatSearchRef?.applyPinnedFilter?.();
  }
</script>

<header
  class="h-[55px] border-b border-border px-4 flex items-center justify-between bg-card"
>
  <ChatSummary
    {chat}
    typingStatus={typingStatusLabel()}
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
