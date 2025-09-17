<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import UserOptionsMenu from '$lib/components/context-menus/UserOptionsMenu.svelte';
  import ImageLightbox from '$lib/components/media/ImageLightbox.svelte';
  import { userStore } from '$lib/data/stores/userStore';
  import { serverStore } from '$lib/data/stores/serverStore';
  import { chatStore } from '$lib/data/stores/chatStore';
  import { toasts } from '$lib/data/stores/ToastStore';
  import { Star, CircleCheck, Plus, SendHorizontal, Trash, Ellipsis } from '@lucide/svelte';
  import type { Server } from '$lib/models/Server';
  import type { User } from '$lib/models/User';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { slide } from 'svelte/transition';
  
  type MutualGroup = { serverId: string; serverName: string; channelId: string; channelName: string };
  type UserOptionsEvent = { action: string };

  type Props = {
    profileUser: User;
    close?: () => void;
    isFriend?: boolean;
  };

  let { profileUser, close = () => {}, isFriend = false }: Props = $props();

  let selectedTab = $state<'friends' | 'servers' | 'groups'>('friends');

  let showLightbox = $state(false);
  let lightboxImageUrl = $state('');
  let copyFeedback = $state('');

  let showUserOptionsMenu = $state(false);
  let userOptionsMenuX = $state(0);
  let userOptionsMenuY = $state(0);

  let mutualServers = $state<Server[]>([]);
  let loadingMutualServers = $state(false);

  let mutualFriends = $state<User[]>([]);
  let loadingMutualFriends = $state(false);

  let mutualGroups = $state<MutualGroup[]>([]);
  let loadingMutualGroups = $state(false);

  let showInvitePicker = $state(false);
  let selectedServerId = $state<string | null>(null);

  let isMyProfile = $derived(profileUser?.id === $userStore.me?.id);

  async function computeMutualServers() {
    if (!profileUser?.id) {
      mutualServers = [];
      return;
    }
    loadingMutualServers = true;
    try {
      const servers = $serverStore.servers || [];
      for (const s of servers) {
        if (!s.members || s.members.length === 0) {
          await serverStore.fetchServerDetails(s.id);
        }
      }
      mutualServers = ($serverStore.servers || []).filter(s =>
        (s.members || []).some(m => m.id === profileUser.id)
      );
    } catch (e) {
      console.error('Failed to compute mutual servers:', e);
    } finally {
      loadingMutualServers = false;
    }
  }

  async function computeMutualGroups() {
    if (!profileUser?.id) {
      mutualGroups = [];
      return;
    }
    loadingMutualGroups = true;
    try {
      const servers = $serverStore.servers || [];
      for (const s of servers) {
        if (!s.channels || s.channels.length === 0 || !s.members || s.members.length === 0) {
          await serverStore.fetchServerDetails(s.id);
        }
      }
      const sharedServers = ($serverStore.servers || []).filter(s =>
        (s.members || []).some(m => m.id === profileUser.id)
      );
      const groups: MutualGroup[] = [];
      for (const s of sharedServers) {
        for (const ch of s.channels || []) {
          if (ch.private) {
            groups.push({ serverId: s.id, serverName: s.name, channelId: ch.id, channelName: ch.name });
          }
        }
      }
      mutualGroups = groups;
    } catch (e) {
      console.error('Failed to compute mutual groups:', e);
      mutualGroups = [];
    } finally {
      loadingMutualGroups = false;
    }
  }

  async function computeMutualFriends() {
    const meId = $userStore.me?.id;
    const otherId = profileUser?.id;
    mutualFriends = [];
    if (!meId || !otherId) return;
    loadingMutualFriends = true;
    try {
      const myFriendships: any[] = await invoke('get_friendships', { current_user_id: meId });
      const otherFriendships: any[] = await invoke('get_friendships', { current_user_id: otherId });
      const myFriendIds = new Set(
        (myFriendships || []).map((f: any) => (f.user_a_id === meId ? f.user_b_id : f.user_a_id))
      );
      const otherFriendIds = new Set(
        (otherFriendships || []).map((f: any) => (f.user_a_id === otherId ? f.user_b_id : f.user_a_id))
      );
      const mutualIds: string[] = Array.from(myFriendIds).filter(id => otherFriendIds.has(id));
      const users = await Promise.all(mutualIds.map(id => userStore.getUser(id)));
      mutualFriends = users.filter(Boolean) as User[];
    } catch (e) {
      console.error('Failed to compute mutual friends:', e);
      mutualFriends = [];
    } finally {
      loadingMutualFriends = false;
    }
  }

  $effect(() => {
    if (profileUser?.id) {
      computeMutualServers();
      computeMutualFriends();
      computeMutualGroups();
    }
  });

  $effect(() => {
    void $serverStore.servers;
    if (profileUser?.id) {
      computeMutualServers();
      computeMutualGroups();
    }
  });

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
    }
  }

  function copyPublicKey() {
    if (navigator.clipboard && profileUser?.publicKey) {
      navigator.clipboard.writeText(profileUser.publicKey).then(() => {
        copyFeedback = 'Copied!';
        setTimeout(() => (copyFeedback = ''), 2000);
      });
    }
  }

  function openLightbox(imageUrl: string) {
    lightboxImageUrl = imageUrl;
    showLightbox = true;
  }

  async function editProfile() {
    try {
      await goto(resolve('/settings/account'));
      close();
    } catch (e) {
      console.error('Failed to navigate to profile settings:', e);
      toasts.addToast('Failed to open profile settings.', 'error');
    }
  }

  async function addFriend() {
    if (!profileUser?.id || !$userStore.me?.id) return;
    try {
      await invoke('send_friend_request', { current_user_id: $userStore.me.id, target_user_id: profileUser.id });
      toasts.addToast('Friend request sent!', 'success');
    } catch (error: any) {
      console.error('Failed to send friend request:', error);
      toasts.addToast(error?.message || 'Failed to send friend request.', 'error');
    }
  }

  async function removeFriend() {
    try {
      const meId = $userStore.me?.id;
      if (!meId || !profileUser?.id) return;
      const friendships: any[] = await invoke('get_friendships', { current_user_id: meId });
      const fs = friendships.find(
        (f: any) =>
          (f.user_a_id === meId && f.user_b_id === profileUser.id) ||
          (f.user_b_id === meId && f.user_a_id === profileUser.id)
      );
      if (!fs) {
        toasts.addToast('Friendship not found.', 'error');
        return;
      }
      await invoke('remove_friendship', { friendshipId: fs.id });
      toasts.addToast('Friend removed.', 'success');
    } catch (error: any) {
      console.error('Failed to remove friend:', error);
      toasts.addToast(error?.message || 'Failed to remove friend.', 'error');
    }
  }

  async function sendMessage() {
    try {
      if (!profileUser?.id) return;
      await chatStore.setActiveChat(profileUser.id, 'dm');
      close();
    } catch (e) {
      console.error('Failed to open DM:', e);
      toasts.addToast('Failed to open direct messages.', 'error');
    }
  }

  function handleMoreOptions(event: MouseEvent) {
    event.preventDefault();
    userOptionsMenuX = event.clientX;
    userOptionsMenuY = event.clientY;
    showUserOptionsMenu = true;
  }

  async function handleUserOptionAction(event: CustomEvent<UserOptionsEvent>) {
    const action = event.detail.action as string;
    try {
      switch (action) {
        case 'copy_user_id':
          if (profileUser?.id && navigator.clipboard) {
            await navigator.clipboard.writeText(profileUser.id);
            toasts.addToast('User ID copied.', 'success');
          }
          break;
        case 'block': {
          const meId = $userStore.me?.id;
          if (meId && profileUser?.id) {
            await invoke('block_user', { current_user_id: meId, target_user_id: profileUser.id });
            toasts.addToast('User blocked.', 'success');
          }
          break;
        }
        case 'mute_user':
          toasts.addToast('User muted (local only).', 'info');
          break;
        case 'ignore':
          toasts.addToast('User ignored (local only).', 'info');
          break;
        case 'invite_to_server':
          openInvitePicker();
          break;
        case 'view_reviews':
          toasts.addToast('Reviews not implemented yet.', 'info');
          break;
        case 'add_to_group':
          toasts.addToast('Add to group not implemented yet.', 'info');
          break;
        case 'report':
          toasts.addToast('Report submitted.', 'success');
          break;
        default:
          console.log('Unhandled action:', action);
      }
    } catch (e: any) {
      console.error('User option failed:', action, e);
      toasts.addToast(e?.message || 'Action failed.', 'error');
    } finally {
      showUserOptionsMenu = false;
    }
  }

  function openInvitePicker() {
    const firstServer = $serverStore.servers?.[0];
    selectedServerId = firstServer ? firstServer.id : null;
    showInvitePicker = true;
  }

  async function sendServerInvite() {
    if (!selectedServerId || !profileUser?.id) return;
    try {
      await invoke('send_server_invite', { server_id: selectedServerId, user_id: profileUser.id });
      toasts.addToast('Invite sent.', 'success');
    } catch (e: any) {
      console.error('Failed to send server invite:', e);
      toasts.addToast(e?.message || 'Failed to send server invite.', 'error');
    } finally {
      showInvitePicker = false;
    }
  }
</script>

<div class="modal-overlay" onclick={close} onkeydown={handleKeyDown} role="presentation">
    <div class="modal-content flex" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }} role="dialog" aria-modal="true" aria-labelledby="profile-username" tabindex="-1">
    <div class="w-[400px] flex flex-col rounded-tl-lg bg-card">
      <div class="profile-header">
        <button class="close-button" onclick={close} aria-label="Close profile">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <button class="banner" style="background-image: url({profileUser?.bannerUrl || ''})" onclick={() => openLightbox(profileUser?.bannerUrl || '')} aria-label="View banner image"></button>
        <div class="pfp-container">
          <button class="pfp-container-button" onclick={() => profileUser?.pfpUrl && openLightbox(profileUser.pfpUrl)} aria-label="View profile picture">
            <img class="pfp" src={profileUser?.pfpUrl || ''} alt={(profileUser?.name || 'Unknown User') + "'s profile picture"} />
          </button>
         <div class:online={profileUser?.online} class="online-status" title={profileUser?.online ? 'Online' : 'Offline'}></div>
        </div>
      </div>
      
      <div class="profile-info">
        <h2 id="profile-username" class="username text-white">{profileUser?.name || 'Unknown User'}</h2>
        <div class="flex items-center text-sm text-gray-200 mb-4">
          <span>{profileUser?.tag || ''}</span>
        </div>
        <div class="server-tag text-xs text-gray-400 mb-2">
          AEGIS
        </div>
        <div class="badges flex space-x-1 mb-4">
          <Star class="w-4 h-4 text-white" />
          <CircleCheck class="w-4 h-4 text-white" />
        </div>

        <div class="action-buttons-detailed">
          {#if isMyProfile}
            <button class="primary-action" onclick={editProfile}>
              <Plus />
              <span>Edit Profile</span>
            </button>
          {:else if isFriend}
            <button class="primary-action" onclick={sendMessage}>
              <SendHorizontal />
              <span>Message</span>
            </button>
            <button class="icon-button" onclick={removeFriend} aria-label="Remove Friend">
              <Trash />
            </button>
          {:else}
            <button class="primary-action" onclick={addFriend}>
              <Plus />
              <span>Add Friend</span>
            </button>
            <button class="primary-action" onclick={sendMessage} aria-label="Message">
              <SendHorizontal />
              <span>Message</span>
            </button>
          {/if}
          <button class="icon-button" onclick={handleMoreOptions} aria-label="More options">
            <Ellipsis />
          </button>
        </div>

        <p class="bio">{profileUser?.bio || ''}</p>

        <div class="connections-section mt-4">
          <h3 class="text-xs text-gray-400 uppercase font-semibold mb-2">Connections</h3>
          <div class="flex items-center space-x-2">
            <a href="https://www.twitch.tv/your_twitch_channel" target="_blank" rel="noopener noreferrer" class="flex items-center p-2 bg-zinc-700 rounded-md hover:bg-zinc-600 transition-colors">
              <img src="https://www.svgrepo.com/show/303147/twitch-logo.svg" alt="Twitch Logo" class="w-5 h-5 mr-2">
              <span class="text-sm font-medium text-white">Twitch</span>
            </a>
          </div>
        </div>

        <div class="note-section mt-4">
          <h3 class="text-xs text-gray-400 uppercase font-semibold mb-2">Note</h3>
          <textarea class="w-full p-2 bg-zinc-700 text-white border-none focus:border-gray-300 hover:border-gray-300 rounded-md text-sm" rows="3" placeholder="Add a private note about this user..."></textarea>
        </div>

        {#if isMyProfile}
          <div class="my-identity-section">
            <div class="qr-section">
              <h3>Share Your QR Code</h3>
              <img class="qr-code" src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data={profileUser?.publicKey || ''}" alt="Your QR Code" />
            </div>
            <div class="public-key-section">
              <h3>
                Your Public Key
                {#if copyFeedback}
                  <span class="copy-feedback" transition:slide>
                    {copyFeedback}
                  </span>
                {/if}
              </h3>
              <button class="key-display" onclick={copyPublicKey} title="Copy public key">
                {profileUser?.publicKey || ''}
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <div class="flex-grow p-4 rounded-tr-lg rounded-br-lg">
      <div class="flex border-b border-gray-200 mb-4">
        <button
          class="px-4 py-2 text-sm font-medium border-b-2 {selectedTab === 'friends' ? 'border-blue-300 text-blue-300' : 'border-transparent text-gray-300 hover:text-blue-300'} cursor-pointer"
          onclick={() => (selectedTab = 'friends')}
        >Mutual Friends</button>
        <button
          class="px-4 py-2 text-sm font-medium border-b-2 {selectedTab === 'servers' ? 'border-blue-300 text-blue-300' : 'border-transparent text-gray-300 hover:text-blue-300'} cursor-pointer"
          onclick={() => (selectedTab = 'servers')}
        >Mutual Servers</button>
        <button
          class="px-4 py-2 text-sm font-medium border-b-2 {selectedTab === 'groups' ? 'border-blue-300 text-blue-300' : 'border-transparent text-gray-300 hover:text-blue-300'} cursor-pointer"
          onclick={() => (selectedTab = 'groups')}
        >Mutual Groups</button>
      </div>
      <div>
        {#if selectedTab === 'friends'}
          {#if loadingMutualFriends}
            <p class="text-gray-300 text-sm">Loading mutual friends...</p>
          {:else if mutualFriends.length === 0}
            <p class="text-gray-300 text-sm">No mutual friends found.</p>
          {:else}
            <ul class="text-gray-200 text-sm space-y-1">
              {#each mutualFriends as u (u.id)}
                <li class="flex items-center gap-2">
                  <img src={u.avatar} alt={(u.name || 'User') + " avatar"} class="w-5 h-5 rounded-full" />
                  <span>{u.name}</span>
                </li>
              {/each}
            </ul>
          {/if}
        {:else if selectedTab === 'servers'}
          {#if loadingMutualServers}
            <p class="text-gray-300 text-sm">Loading mutual serversâ€¦</p>
          {:else if mutualServers.length === 0}
            <p class="text-gray-300 text-sm">No mutual servers found.</p>
          {:else}
            <ul class="text-gray-200 text-sm space-y-1">
              {#each mutualServers as s (s.id)}
                <li class="flex items-center gap-2">
                  <span class="inline-block w-2 h-2 rounded-full bg-zinc-500"></span>
                  <span>{s.name}</span>
                </li>
              {/each}
            </ul>
          {/if}
        {:else if selectedTab === 'groups'}
          {#if loadingMutualGroups}
            <p class="text-gray-300 text-sm">Loading mutual groupsâ€¦</p>
          {:else if mutualGroups.length === 0}
            <p class="text-gray-300 text-sm">No mutual groups found.</p>
          {:else}
            <ul class="text-gray-200 text-sm space-y-1">
              {#each mutualGroups as g (g.channelId)}
                <li class="flex items-center gap-2">
                  <span class="inline-block w-2 h-2 rounded-full bg-zinc-500"></span>
                  <span>{g.serverName} â€¢ #{g.channelName}</span>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
    </div>
  </div>
</div>

{#if showLightbox}
  <ImageLightbox imageUrl={lightboxImageUrl} show={showLightbox} onClose={() => (showLightbox = false)} />
{/if}

{#if showUserOptionsMenu}
  <UserOptionsMenu
    x={userOptionsMenuX}
    y={userOptionsMenuY}
    show={showUserOptionsMenu}
    onclose={() => (showUserOptionsMenu = false)}
    onaction={handleUserOptionAction}
  />
{/if}

{#if showInvitePicker}
  <div class="modal-overlay" role="presentation" onclick={() => (showInvitePicker = false)} onkeydown={(e) => e.key === 'Escape' && (showInvitePicker = false)} tabindex="-1">
    <div class="invite-picker" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Invite to server" tabindex="0" onkeydown={(e) => e.key === 'Escape' && (showInvitePicker = false)}>
      <h3 class="text-white mb-3">Invite to Server</h3>
      {#if $serverStore.servers.length === 0}
        <p class="text-gray-300 text-sm">You have no servers to invite from.</p>
      {:else}
        <select class="w-full p-2 bg-zinc-700 text-white rounded mb-3" bind:value={selectedServerId}>
          {#each $serverStore.servers as s (s.id)}
            <option value={s.id}>{s.name}</option>
          {/each}
        </select>
        <div class="flex gap-2 justify-end">
          <button class="icon-button" onclick={() => (showInvitePicker = false)}>Cancel</button>
          <button class="primary-action" disabled={!selectedServerId} onclick={sendServerInvite}>Send Invite</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: color-mix(in srgb, var(--color-foreground) 70%, transparent);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }
  .modal-content {
    background: var(--color-card);
    border-radius: 16px;
    width: fit-content;
    max-width: 90%;
    max-height: 90%;
    overflow: hidden;
    box-shadow: 0 10px 30px color-mix(in srgb, var(--color-foreground) 12%, transparent);
    padding: 48px 36px 0 48px;
  }
  .profile-header {
    position: relative;
    height: 140px;
  }
  .banner {
    background-color: var(--color-muted);
    background-size: cover;
    background-position: center;
    width: 100%;
    height: 100px;
  }
  .pfp-container {
    position: absolute;
    left: 24px;
    top: 50px;
    border: 5px solid var(--color-primary-foreground);
    border-radius: 50%;
    background-color: var(--color-card);
  }

  .pfp-container-button {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    border-radius: 50%;
    display: block;
    width: 80px;
    height: 80px;
    overflow: hidden;
  }

  .pfp {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }
  .online-status {
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 20px;
    height: 20px;
    background-color: var(--color-muted);
    border-radius: 50%;
    border: 3px solid #ffffff;
  }
  .online-status.online {
    background-color: var(--color-primary);
  }
  .profile-info {
    padding: 4px 32px 32px;
    text-align: left;
  }
  .username {
    margin: 0;
    font-size: 1.5rem;
  }
  .bio {
    margin: 4px 0 0;
    color: var(--color-muted-foreground);
    font-size: 0.95rem;
  }
  .action-buttons-detailed {
    display: flex;
    gap: 12px;
  }
  .primary-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 12px;
    font-size: 0.8rem;
    font-weight: 600;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    background-color: var(--color-primary);
    color: var(--color-primary-foreground);
    transition: background-color 0.2s;
  }
  .primary-action:hover {
    background-color: color-mix(in oklch, var(--color-primary) 82%, var(--color-foreground) 18%);
  }
  .icon-button {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    background-color: color-mix(in srgb, var(--color-background) 75%, var(--color-foreground) 25%);
    color: var(--color-card-foreground);
    transition: background-color 0.2s;
  }
  .icon-button:hover {
    background-color: color-mix(in srgb, var(--color-background) 65%, var(--color-foreground) 35%);
  }
  .my-identity-section {
    background-color: color-mix(in srgb, var(--color-background) 80%, var(--color-foreground) 20%);
    padding: 16px 24px;
    border-top: 1px solid var(--color-border);
  }
  h3 {
    margin: 0 0 8px;
    font-size: 0.8rem;
    color: var(--color-card-foreground);
    text-transform: uppercase;
    font-weight: 600;
  }
  .qr-section {
    text-align: center;
    margin-bottom: 16px;
  }
  .qr-code {
    border-radius: 8px;
  }
  .key-display {
    background-color: color-mix(in srgb, var(--color-background) 70%, var(--color-foreground) 30%);
    padding: 12px;
    border-radius: 8px;
    font-family: monospace;
    word-break: break-all;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background-color 0.2s;
    color: var(--color-card-foreground);
  }
  .key-display:hover {
    background-color: color-mix(in srgb, var(--color-background) 60%, var(--color-foreground) 40%);
  }
  .copy-feedback {
    display: inline-block;
    margin-left: 8px;
    font-size: 0.8rem;
    color: var(--color-primary);
    font-weight: 600;
  }

  .close-button {
    position: absolute;
    top: 10px;
    right: 10px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-muted-foreground);
    z-index: 10;
    padding: 5px;
    border-radius: 50%;
    transition: background-color 0.2s;
  }

  .close-button:hover {
    background-color: color-mix(in srgb, var(--color-foreground) 10%, transparent);
  }

  .invite-picker {
    background: var(--color-popover);
    padding: 16px;
    border-radius: 12px;
    min-width: 320px;
    box-shadow: 0 10px 30px color-mix(in srgb, var(--color-foreground) 20%, transparent);
  }
</style>
