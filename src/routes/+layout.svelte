<svelte:options runes={true} />

<svelte:window onkeydown={handleKeydown} />

<script lang="ts">
  import '../app.css';
  import { theme } from '$lib/stores/theme';
  import { setContext, onMount, onDestroy, untrack } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  type NavigationFn = (value: string | URL) => void; // eslint-disable-line no-unused-vars

  const gotoUnsafe: NavigationFn = goto as unknown as NavigationFn;

  import { authStore, type AuthState } from '$lib/data/stores/authStore';
  import { userStore } from '$lib/data/stores/userStore';
  import { friendStore } from '$lib/data/stores/friendStore';
  import { serverStore } from '$lib/data/stores/serverStore';
  import { chatStore, messagesByChatId, activeChannelId, activeChatId, activeChatType } from '$lib/data/stores/chatStore';
  import { CREATE_GROUP_CONTEXT_KEY, FRIENDS_LAYOUT_DATA_CONTEXT_KEY } from '$lib/data/contextKeys';
  import type { FriendsLayoutContext } from '$lib/data/contextTypes';
  import { getListen } from '$services/tauri';
  import type { AepMessage } from '$lib/models/AepMessage';
  import type { Friend } from '$lib/models/Friend';
  import type { Server } from '$lib/models/Server';
  import type { Message } from '$lib/models/Message';
  import type { User } from '$lib/models/User';
  import type { Chat } from '$lib/models/Chat';
  import InitialSetup from '$lib/components/InitialSetup.svelte';
  import LoadingOverlay from '$lib/components/LoadingOverlay.svelte';
  import Sidebar from '$lib/components/sidebars/Sidebar.svelte';
  import ServerSidebar from '$lib/components/sidebars/ServerSidebar.svelte';
  import MemberSidebar from '$lib/components/sidebars/MemberSidebar.svelte';
  import DirectMessageList from '$lib/components/lists/DirectMessageList.svelte';
  import { UserRoundPlus } from '@lucide/svelte';
  import ServerManagementModal from '$lib/components/modals/ServerManagementModal.svelte';
  import UserCardModal from '$lib/components/modals/UserCardModal.svelte';
  import ProfileModal from '$lib/components/modals/ProfileModal.svelte';
  import { ChatView } from '$features/chat';
  type ProfileModalSource = User & { pfpUrl?: string; bannerUrl?: string; isOnline?: boolean };

  let { children } = $props();

  const { subscribe } = userStore;
  let authState = $state<AuthState>({ status: 'checking', loading: true, error: null, onboarding: null, pendingDeviceLogin: null, requireTotpOnUnlock: false, passwordPolicy: 'unicode_required' });

  function navigateToUrl(url: URL) {
    const target = `${url.pathname}${url.search}`;
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    gotoUnsafe(target);
  }
  const unsubscribeAuth = authStore.subscribe((value) => {
    authState = value;
  });
  let currentUser = $state<User | null>(null);
  subscribe(value => {
    currentUser = value.me;
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeModal();
    }
  }

  $effect(() => {
    if ($theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  });

  let postAuthInitialized = $state(false);
  let unlistenHandlers: Array<() => void> = [];

  function clearUnlistenHandlers() {
    for (const handler of unlistenHandlers) {
      try {
        handler();
      } catch (error) {
        console.error('Failed to detach event listener:', error);
      }
    }
    unlistenHandlers = [];
  }

  async function bootstrapAfterAuthentication() {
    await serverStore.initialize();
    await friendStore.initialize();

    clearUnlistenHandlers();

    const storedActiveServerId = localStorage.getItem('activeServerId');
    const storedActiveChatId = localStorage.getItem('activeChatId');
    const storedActiveChatType = localStorage.getItem('activeChatType');
    const storedActiveChannelId = localStorage.getItem('activeChannelId');

    if (storedActiveServerId) {
      serverStore.setActiveServer(storedActiveServerId);
    }
    if (storedActiveChatId && storedActiveChatType) {
      chatStore.setActiveChat(storedActiveChatId, storedActiveChatType as 'dm' | 'server', storedActiveChannelId || undefined);
    }

    const listen = await getListen();
    if (listen) {
      const unlistenFriends = await listen<{ payload: Friend[] }>('friends-updated', (event) => {
        friendStore.handleFriendsUpdate(event.payload);
      });

      const unlistenServers = await listen<{ payload: Server[] }>('servers-updated', (event) => {
        serverStore.handleServersUpdate(event.payload);
      });

      const unlistenMessages = await listen<{ payload: { chatId: string; messages: Message[] } }>('messages-updated', (event) => {
        const { chatId, messages } = event.payload;
        chatStore.handleMessagesUpdate(chatId, messages);
      });

      const unlistenPresence = await listen<{ payload: AepMessage }>('new-message', (event) => {
        const receivedMessage: AepMessage = event.payload;
        if (receivedMessage.PresenceUpdate) {
          const { user_id, is_online } = receivedMessage.PresenceUpdate;
          friendStore.updateFriendPresence(user_id, is_online);
          serverStore.updateServerMemberPresence(user_id, is_online);
        } else if (receivedMessage.ChatMessage) {
          chatStore.handleNewMessageEvent(receivedMessage.ChatMessage);
        }
      });

      unlistenHandlers.push(unlistenFriends, unlistenServers, unlistenMessages, unlistenPresence);
    }
  }

  onMount(() => {
    authStore.bootstrap();
  });

  onDestroy(() => {
    unsubscribeAuth();
    clearUnlistenHandlers();
  });

  $effect(() => {
    if (authState.status !== 'authenticated') {
      postAuthInitialized = false;
      clearUnlistenHandlers();
      chatStore.clearActiveChat();
      serverStore.setActiveServer(null);
    }
  });

  $effect(() => {
    if (authState.status === 'authenticated' && !postAuthInitialized) {
      postAuthInitialized = true;
      bootstrapAfterAuthentication().catch((error) => console.error('Post-auth bootstrap failed:', error));
    }
  });

  let activeModal: string | null = $state(null);
  let modalProps: any = $state({});

  let allUsers = $derived([
    ...$friendStore.friends,
  ]);

  const currentChat = $derived.by(() => {
    const chatType = $activeChatType;
    const chatId = $activeChatId;
    const channelId = $activeChannelId;

    if (chatType === 'dm') {
      const friend = $friendStore.friends.find(f => f.id === chatId);
      if (friend) {
        return {
          type: 'dm',
          id: friend.id,
          friend: friend,
          messages: $messagesByChatId.get(friend.id) || []
        } as Chat;
      }
    } else if (chatType === 'server') {
      const server = $serverStore.servers.find(s => s.id === chatId);
      if (server && server.channels) {
        const channel = server.channels.find(c => c.id === channelId);
        if (channel) {
          return {
            type: 'channel',
            id: channel.id,
            name: channel.name,
            serverId: server.id,
            members: server.members,
            messages: $messagesByChatId.get(channel.id) || []
          } as Chat;
        }
      }
    }
    return null;
  });

  $effect(() => {
    const serverId = $serverStore.activeServerId;
    const servers = $serverStore.servers;
    const server = servers.find(s => s.id === serverId);

    if (server && server.channels && server.channels.length > 0) {
      const generalChannel = server.channels.find(c => c.name === 'general');
      const targetChannelId = generalChannel ? generalChannel.id : server.channels[0].id;

      untrack(() => {
        if ($activeChatType !== 'server' || $activeChatId !== server.id || $activeChannelId !== targetChannelId) {
          chatStore.setActiveChat(server.id, 'server', targetChannelId);
        }
      });
    }
  });

  function handleSelectChannel(serverId: string, channelId: string | null) {
    if (channelId) {
      chatStore.setActiveChat(serverId, 'server', channelId);
    }
  }

  function openModal(modalType: string, props = {}) {
    activeModal = modalType;
    modalProps = props;
  }

  function closeModal() {
    activeModal = null;
    modalProps = {};
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  function withProfileDefaults(user: User): ProfileModalSource {
    const source = user as ProfileModalSource;
    return {
      ...user,
      bio: source.bio ?? '',
      pfpUrl: source.pfpUrl ?? user.avatar,
      bannerUrl: source.bannerUrl ?? '',
      isOnline: source.isOnline ?? user.online ?? false,
      publicKey: source.publicKey ?? '',
    };
  }

  function computeUserCardPosition(clickX: number, clickY: number) {
    const CARD_WIDTH = 300;
    const CARD_HEIGHT = 410;
    const MARGIN = 16;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : CARD_WIDTH + MARGIN * 2;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : CARD_HEIGHT + MARGIN * 2;

    const safeX = Number.isFinite(clickX) ? clickX : viewportWidth - MARGIN;
    const safeY = Number.isFinite(clickY) ? clickY : viewportHeight - MARGIN;

    const x = clamp(safeX - CARD_WIDTH / 2, MARGIN, Math.max(MARGIN, viewportWidth - CARD_WIDTH - MARGIN));

    let y = safeY - CARD_HEIGHT - MARGIN;
    const maxY = Math.max(MARGIN, viewportHeight - CARD_HEIGHT - MARGIN);
    if (y < MARGIN) {
      y = clamp(safeY + MARGIN, MARGIN, maxY);
    } else {
      y = Math.min(y, maxY);
    }

    return { x, y };
  }

  function openUserCardModal(user: User, x: number, y: number, isServerMemberContext: boolean) {
    const normalizedUser = withProfileDefaults(user);
    const position = computeUserCardPosition(x, y);
    openModal('userCard', {
      profileUser: normalizedUser,
      x: position.x,
      y: position.y,
      isServerMemberContext
    });
  }

  function toProfileModalUser(user: User) {
    const normalizedUser = withProfileDefaults(user);
    return {
      id: normalizedUser.id,
      name: normalizedUser.name ?? 'Unknown User',
      bio: normalizedUser.bio,
      pfpUrl: normalizedUser.pfpUrl,
      bannerUrl: normalizedUser.bannerUrl,
      isOnline: normalizedUser.isOnline,
      publicKey: normalizedUser.publicKey,
    };
  }

  function openDetailedProfileModal(user: User) {
    openModal('detailedProfile', {
      profileUser: toProfileModalUser(user),
      isFriend: $friendStore.friends.some(f => f.id === user.id)
    });
  }
  const pageState = {
    get friends() { return $friendStore.friends },
    get allUsers() { return allUsers },
    get currentChat() { return currentChat },
    openModal,
    closeModal,
    openUserCardModal,
    openDetailedProfileModal,
    messagesByChatId
  };

  setContext(CREATE_GROUP_CONTEXT_KEY, pageState);

  let activeTab = $state('All');

  $effect(() => {
    if ($page.url.pathname === '/friends/add') {
      activeTab = 'AddFriend';
    } else if ($page.url.pathname === '/friends' || $page.url.pathname === '/') {
      const tabParam = $page.url.searchParams.get('tab');
      activeTab = tabParam || 'All';
    }
  });

  setContext(FRIENDS_LAYOUT_DATA_CONTEXT_KEY, {
    get friends() {
      return $friendStore.friends;
    },
    get activeTab() {
      return activeTab;
    },
  } satisfies FriendsLayoutContext);

  const isAnySettingsPage = $derived($page.url.pathname.includes('/settings'));
  const isFriendsOrRootPage = $derived(($page.url.pathname === '/' || $page.url.pathname.startsWith('/friends')) && !$serverStore.activeServerId);

  $effect(() => {
    if (isAnySettingsPage) {
      serverStore.setActiveServer(null);
      chatStore.clearActiveChat();
    }
  });

</script>

<div class="flex h-screen bg-base-100 text-foreground">
  <LoadingOverlay show={authState.loading} />
  {#if authState.status !== 'authenticated' || !currentUser}
    <InitialSetup />
  {:else}
    {#if !isAnySettingsPage}
      <Sidebar onProfileClick={(x: number, y: number) => { if (currentUser) openUserCardModal(currentUser, x, y, false); }} onCreateJoinServerClick={() => openModal('serverManagement')} />
    {/if}
    {#if !isAnySettingsPage}
      {#if $serverStore.activeServerId}
        <ServerSidebar server={$serverStore.servers.find(s => s.id === $serverStore.activeServerId)!} onSelectChannel={handleSelectChannel} />
      {:else}
        <DirectMessageList
          friends={$friendStore.friends}
          onSelect={(id: string | null) => { if (id) chatStore.setActiveChat(id, 'dm'); }}
          onCreateGroupClick={() => {}}
        />
      {/if}
    {/if}
    <main class="flex-1 min-h-0 flex flex-col">
      {#if isFriendsOrRootPage}
        <div class="flex items-center justify-start px-4 pt-4 pb-2 border-b border-border sticky top-0 z-10 bg-card h-[55px]">
          <div class="flex space-x-2">
            <button class="px-3 py-1 rounded-md text-sm font-medium cursor-pointer" class:bg-muted={activeTab === 'All'} class:hover:bg-muted={activeTab !== 'All'} onclick={() => {
              const url = new URL($page.url);
              url.searchParams.set('tab', 'All');
              navigateToUrl(url);
            }}>All</button>
            <button class="px-3 py-1 rounded-md text-sm font-medium cursor-pointer" class:bg-muted={activeTab === 'Online'} class:hover:bg-muted={activeTab !== 'Online'} onclick={() => {
              const url = new URL($page.url);
              url.searchParams.set('tab', 'Online');
              navigateToUrl(url);
            }}>Online</button>
            <button class="px-3 py-1 rounded-md text-sm font-medium cursor-pointer" class:bg-muted={activeTab === 'Blocked'} class:hover:bg-muted={activeTab !== 'Blocked'} onclick={() => {
              const url = new URL($page.url);
              url.searchParams.set('tab', 'Blocked');
              navigateToUrl(url);
            }}>Blocked</button>
            <button class="px-3 py-1 rounded-md text-sm font-medium cursor-pointer" class:bg-muted={activeTab === 'Pending'} class:hover:bg-muted={activeTab !== 'Pending'} onclick={() => {
              const url = new URL($page.url);
              url.searchParams.set('tab', 'Pending');
              navigateToUrl(url);
            }}>Pending</button>
            <button class="flex items-center px-3 py-1 rounded-md bg-primary hover:bg-accent text-sm font-medium h-8 ml-4 cursor-pointer" class:bg-muted={activeTab === 'AddFriend'} class:hover:bg-accent={activeTab !== 'AddFriend'} onclick={() => // eslint-disable-next-line svelte/no-navigation-without-resolve
            gotoUnsafe('/friends/add')}>
              <UserRoundPlus size={10} class="mr-2" />
              Add Friend
            </button>
          </div>
        </div>
        {@render children()}
      {:else if $serverStore.activeServerId}
        <div class="flex flex-1">
          <ChatView chat={currentChat} />
          <MemberSidebar members={currentChat?.type === 'channel' ? currentChat.members : []} openUserCardModal={openUserCardModal} />
        </div>
      {:else}
        {@render children()}
      {/if}
    </main>
  {/if}
</div>

{#if activeModal === 'serverManagement'}
  <ServerManagementModal
    show={true}
    onclose={closeModal}
    onserverCreated={(server) => serverStore.addServer(server)}
  />
{/if}

{#if activeModal === 'userCard'}
  <UserCardModal {...modalProps} close={closeModal} openDetailedProfileModal={openDetailedProfileModal} />
{/if}

{#if activeModal === 'detailedProfile'}
  <ProfileModal {...modalProps} close={closeModal} />
{/if}








