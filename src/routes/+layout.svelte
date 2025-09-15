<svelte:window onkeydown={handleKeydown} />

<script lang="ts">
  import '../app.css';
  import { theme } from '$lib/stores/theme';
  import { setContext, onMount, onDestroy, untrack } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { userStore } from '$lib/data/stores/userStore';
  import { friendStore } from '$lib/data/stores/friendStore';
  import { serverStore } from '$lib/data/stores/serverStore';
  import { chatStore, messagesByChatId, activeChannelId, activeChatId, activeChatType } from '$lib/data/stores/chatStore';
  import { CREATE_GROUP_CONTEXT_KEY, FRIENDS_LAYOUT_DATA_CONTEXT_KEY } from '$lib/data/contextKeys';
  import { getListen } from '$services/tauri';
  import type { AepMessage } from '$lib/models/AepMessage';
  import type { Friend } from '$lib/models/Friend';
  import type { Server } from '$lib/models/Server';
  import type { Message } from '$lib/models/Message';
  import type { User } from '$lib/models/User';
  import type { Chat } from '$lib/models/Chat';
  import InitialSetup from '$lib/components/InitialSetup.svelte';
  import Sidebar from '$lib/components/sidebars/Sidebar.svelte';
  import ServerSidebar from '$lib/components/sidebars/ServerSidebar.svelte';
  import MemberSidebar from '$lib/components/sidebars/MemberSidebar.svelte';
  import DirectMessageList from '$lib/components/lists/DirectMessageList.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { mdiAccountMultiplePlus } from '@mdi/js';
  import ServerManagementModal from '$lib/components/modals/ServerManagementModal.svelte';
  import UserCardModal from '$lib/components/modals/UserCardModal.svelte';
  import { ChatView } from '$features/chat';

  let { children } = $props();

  const { subscribe, init } = userStore;
  const state = $state({ me: null, loading: true });
  subscribe(value => {
    state.me = value.me;
    state.loading = value.loading;
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeModal();
    }
  }

  $effect(() => {
    console.log('Theme store value changed:', $theme);
    if ($theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      console.log('Added dark class to <html>');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      console.log('Removed dark class from <html>');
    }
    console.log('Current <html> classes:', document.documentElement.classList.value);
  });

  onMount(async () => {
    await init();
    await serverStore.initialize();

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
      const unlistenFriends = await listen('friends-updated', (event: { payload: Friend[] }) => {
        friendStore.handleFriendsUpdate(event.payload);
      });

      const unlistenServers = await listen('servers-updated', (event: { payload: Server[] }) => {
        serverStore.handleServersUpdate(event.payload);
      });

      const unlistenMessages = await listen('messages-updated', (event: { payload: { chatId: string, messages: Message[] } }) => {
        const { chatId, messages } = event.payload;
        chatStore.handleMessagesUpdate(chatId, messages);
      });

      const unlistenPresence = await listen('new-message', (event: { payload: AepMessage }) => {
        const receivedMessage: AepMessage = event.payload;
        if (receivedMessage.PresenceUpdate) {
          const { user_id, is_online } = receivedMessage.PresenceUpdate;
          friendStore.updateFriendPresence(user_id, is_online);
          serverStore.updateServerMemberPresence(user_id, is_online);
        } else if (receivedMessage.ChatMessage) {
          chatStore.handleNewMessageEvent(receivedMessage.ChatMessage);
        }
      });

      onDestroy(() => {
        unlistenFriends();
        unlistenServers();
        unlistenMessages();
        unlistenPresence();
      });
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

  function openUserCardModal(user: User, x: number, y: number, isServerMemberContext: boolean) {
    openModal('userCard', {
      profileUser: user,
      x: windowWidth - 260 - 305,
      y: y,
      isServerMemberContext: isServerMemberContext
    });
  }

  function openDetailedProfileModal(user: User) {
    openModal('detailedProfile', {
      profileUser: user,
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
  });

  const isAnySettingsPage = $derived($page.url.pathname.includes('/settings'));
  const isFriendsOrRootPage = $derived(($page.url.pathname === '/' || $page.url.pathname.startsWith('/friends')) && !$serverStore.activeServerId);

  $effect(() => {
    if (isAnySettingsPage) {
      serverStore.setActiveServer(null);
      chatStore.clearActiveChat();
    }
  });

  let windowWidth = $state(0);
</script>

<div class="flex h-screen bg-base-100 text-foreground">
  {#if !state.me}
    <InitialSetup />
  {:else}
    {#if !isAnySettingsPage}
      <Sidebar onProfileClick={(x: number, y: number) => openUserCardModal(state.me!, x, y, false)} onCreateJoinServerClick={() => openModal('serverManagement')} />
    {/if}
    {#if !isAnySettingsPage}
      {#if $serverStore.activeServerId}
        <ServerSidebar server={$serverStore.servers.find(s => s.id === $serverStore.activeServerId)!} onSelectChannel={handleSelectChannel} />
      {:else}
        <DirectMessageList
          friends={$friendStore.friends}
          onSelect={(id) => { if (id) chatStore.setActiveChat(id, 'dm'); }}
          onCreateGroupClick={() => {}}
        />
      {/if}
    {/if}
    <main class="flex-1 min-h-0 flex flex-col">
      {#if isFriendsOrRootPage}
        <div class="flex items-center justify-start px-4 pt-4 pb-2 border-b border-border sticky top-0 z-10 bg-card h-[55px]">
          <div class="flex space-x-2">
            <button class="px-3 py-1 rounded-md text-sm font-medium cursor-pointer" class:bg-muted={activeTab === 'All'} class:hover:bg-muted={activeTab !== 'All'} onclick={() => goto(resolve('/?tab=All'))}>All</button>
            <button class="px-3 py-1 rounded-md text-sm font-medium cursor-pointer" class:bg-muted={activeTab === 'Online'} class:hover:bg-muted={activeTab !== 'Online'} onclick={() => goto(resolve('/?tab=Online'))}>Online</button>
            <button class="px-3 py-1 rounded-md text-sm font-medium cursor-pointer" class:bg-muted={activeTab === 'Blocked'} class:hover:bg-muted={activeTab !== 'Blocked'} onclick={() => goto(resolve('/?tab=Blocked'))}>Blocked</button>
            <button class="px-3 py-1 rounded-md text-sm font-medium cursor-pointer" class:bg-muted={activeTab === 'Pending'} class:hover:bg-muted={activeTab !== 'Pending'} onclick={() => goto(resolve('/?tab=Pending'))}>Pending</button>
            <button class="flex items-center px-3 py-1 rounded-md bg-primary hover:bg-accent text-sm font-medium h-8 ml-4 cursor-pointer" class:bg-muted={activeTab === 'AddFriend'} class:hover:bg-accent={activeTab !== 'AddFriend'} onclick={() => goto(resolve('/friends/add'))}>
              <Icon data={mdiAccountMultiplePlus} size="6" clazz="mr-2" />
              Add Friend
            </button>
          </div>
        </div>
        {@render children()}
      {:else if $serverStore.activeServerId}
        <div class="flex flex-1">
          <ChatView chat={currentChat} />
          <MemberSidebar members={currentChat?.members || []} openUserCardModal={openUserCardModal} />
        </div>
      {:else}
        {@render children()}
      {/if}
    </main>
  {/if}
</div>

{#if activeModal === 'serverManagement'}
  <ServerManagementModal bind:show={activeModal} on:close={closeModal} on:serverCreated={(e) => serverStore.addServer(e.detail)} />
{/if}

{#if activeModal === 'userCard'}
  <UserCardModal {...modalProps} close={closeModal} openDetailedProfileModal={openDetailedProfileModal} />
{/if}
