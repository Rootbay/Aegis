<svelte:options runes={true} />

<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import ServerBackgroundContextMenu from '$lib/components/context-menus/ServerBackgroundContextMenu.svelte';
  import CategoryContextMenu from '$lib/components/context-menus/CategoryContextMenu.svelte';
  import ChannelContextMenu from '$lib/components/context-menus/ChannelContextMenu.svelte';
  import { serverStore } from '$lib/data/stores/serverStore';
  import { chatStore } from '$lib/data/stores/chatStore';
  import { toasts } from '$lib/data/stores/ToastStore';
  import type { Channel } from '$lib/models/Channel';
  import { Bell, Plus, Settings, ChevronDown, Hash, X, CircleX } from '@lucide/svelte';
  import type { Server } from '$lib/models/Server';
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { v4 as uuidv4 } from 'uuid';

  let { server, onSelectChannel } = $props<{ server: Server, onSelectChannel: any }>();

  const { activeChannelId } = chatStore;

  let showCreateChannelModal = $state(false);
  let newChannelName = $state('');
  let newChannelType = $state<'text' | 'voice'>('text');
  let newChannelPrivate = $state(false);

  let showDropdown = $state(false);
  let dropdownElement: HTMLElement | undefined = $state();

  let showCategoryContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let contextMenuCategoryId = $state('');

  let showChannelContextMenu = $state(false);
  let channelContextMenuX = $state(0);
  let channelContextMenuY = $state(0);
  let selectedChannelForContextMenu = $state<Channel | null>(null);

  let showServerBackgroundContextMenu = $state(false);
  let serverBackgroundContextMenuX = $state(0);
  let serverBackgroundContextMenuY = $state(0);

  let textChannelsCollapsed = $state(false);
  let hideMutedChannels = $state(false);
  let textChannelsContainer: HTMLElement | undefined = $state();
  let textChannelsHeight = $state('0px');
  let mutedChannelIds = $state<Set<string>>(new Set());

  let isResizing = $state(false);
  let rafId: number | null = $state(null);
  let initialX = $state(0);
  let initialWidth = $state(0);
  let sidebarWidth = $state(parseInt(localStorage.getItem('serverSidebarWidth') || '240'));

  const TEXT_COLLAPSED_KEY = 'serverSidebar.textCollapsed';

  function gotoResolved(path: string) {
    const url = new URL(path, $page.url);
    goto(url);
  }

  function slugifyChannelName(name: string) {
    return name.trim().toLowerCase().replace(/\s+/g, '-');
  }

  function startResize(e: MouseEvent) {
    isResizing = true;
    initialX = e.clientX;
    initialWidth = sidebarWidth;
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResize);
  }

  function resize(e: MouseEvent) {
    if (!isResizing) return;
    const targetWidth = Math.max(200, Math.min(400, initialWidth + (e.clientX - initialX)));
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      sidebarWidth = targetWidth;
      rafId = null;
    });
  }

  function stopResize() {
    isResizing = false;
    localStorage.setItem('serverSidebarWidth', sidebarWidth.toString());
    window.removeEventListener('mousemove', resize);
    window.removeEventListener('mouseup', stopResize);
  }

  function toggleDropdown() {
    showDropdown = !showDropdown;
  }

  function handleClickOutside(event: MouseEvent) {
    if (dropdownElement && !dropdownElement.contains(event.target as Node)) {
      showDropdown = false;
    }
  }

  onMount(() => {
    window.addEventListener('click', handleClickOutside);

    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAllContextMenus();
    };
    const handleGlobalScroll = () => closeAllContextMenus();
    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('scroll', handleGlobalScroll, true);

    try {
      const tc = localStorage.getItem(TEXT_COLLAPSED_KEY);
      if (tc !== null) textChannelsCollapsed = tc === 'true';
      const hm = localStorage.getItem('serverSidebar.hideMuted');
      if (hm !== null) hideMutedChannels = hm === 'true';
    } catch (e) {
      void e;
    }

    mutedChannelIds = loadMutedChannels();

    if (textChannelsContainer) {
      textChannelsHeight = `${textChannelsContainer.scrollHeight}px`;
    }

    return () => {
      window.removeEventListener('keydown', handleGlobalKeydown);
      window.removeEventListener('scroll', handleGlobalScroll, true);
    };
  });

  onDestroy(() => {
    window.removeEventListener('click', handleClickOutside);
    if (rafId) cancelAnimationFrame(rafId);
  });

  function handleServerSettingsClick() {
    gotoResolved(`/channels/${server.id}/settings`);
    showDropdown = false;
  }

  function handleInvitePeople() {
    const path = `/inv/${server.id}`;
    const link = (typeof window !== 'undefined' && window.location?.origin)
      ? `${window.location.origin}${path}`
      : path;
    navigator.clipboard.writeText(link)
      .then(() => toasts.addToast('Invite link copied.', 'success'))
      .catch(() => toasts.addToast('Failed to copy invite link.', 'error'));
    showDropdown = false;
  }

  function handleCreateChannelClick() {
    showCreateChannelModal = true;
    showDropdown = false;
  }

  function handleCreateCategory() {
    toasts.addToast('Create Category not yet implemented.', 'info');
    showDropdown = false;
  }

  function handleCreateEvent() {
    toasts.addToast('Create Event not yet implemented.', 'info');
    showDropdown = false;
  }

  function handleNotificationSettings() {
    gotoResolved('/settings/notifications');
    showDropdown = false;
  }

  function closeAllContextMenus() {
    showCategoryContextMenu = false;
    showChannelContextMenu = false;
    showServerBackgroundContextMenu = false;
    selectedChannelForContextMenu = null;
  }

  function clampToViewport(x: number, y: number, approxWidth = 220, approxHeight = 260) {
    const maxX = Math.max(0, (window.innerWidth || 0) - approxWidth - 8);
    const maxY = Math.max(0, (window.innerHeight || 0) - approxHeight - 8);
    return { x: Math.min(x, maxX), y: Math.min(y, maxY) };
  }

  async function handleLeaveServer() {
    if (confirm(`Are you sure you want to leave the server "${server.name}"?`)) {
      try {
        await invoke('leave_server', { serverId: server.id });
        serverStore.removeServer(server.id);
        serverStore.setActiveServer(null);
        gotoResolved('/friends?tab=All');
      } catch (error) {
        console.error('Failed to leave server:', error);
        toasts.addToast('Failed to leave server. Please try again.', 'error');
      }
    }
    showDropdown = false;
  }

  async function createChannel() {
    if (!newChannelName.trim()) return;

    const newChannel: Channel = {
      id: uuidv4(),
      server_id: server.id,
      name: slugifyChannelName(newChannelName),
      channel_type: newChannelType,
      private: newChannelPrivate,
    };

    try {
      await invoke('create_channel', { channel: newChannel });
      serverStore.addChannelToServer(server.id, newChannel);
      toasts.addToast('Channel created.', 'success');
      if (newChannel.channel_type === 'text') {
        onSelectChannel(server.id, newChannel.id);
      }
      newChannelName = '';
      newChannelType = 'text';
      newChannelPrivate = false;
      showCreateChannelModal = false;
    } catch (error) {
      console.error('Failed to create channel:', error);
      toasts.addToast('Failed to create channel.', 'error');
    }
  }

  async function handleDeleteChannel(channelId: string) {
    try {
      await invoke('delete_channel', { channelId: channelId });
      const current = server.channels || [];
      const updated = current.filter((c: Channel) => c.id !== channelId);
      let nextChannelId: string | null = null;
      const remainingText = updated.find((c: Channel) => c.channel_type === 'text');
      nextChannelId = remainingText?.id || updated[0]?.id || null;

      serverStore.updateServer(server.id, { channels: updated });
      if ($activeChannelId === channelId) {
        onSelectChannel(server.id, nextChannelId);
      }
    } catch (error) {
      console.error('Failed to delete channel:', error);
      toasts.addToast('Failed to delete channel.', 'error');
    }
  }

  function handleCategoryContextMenu(event: MouseEvent, categoryId: string) {
    event.preventDefault();
    event.stopPropagation();

    closeAllContextMenus();
    const pos = clampToViewport(event.clientX, event.clientY);
    contextMenuX = pos.x;
    contextMenuY = pos.y;
    contextMenuCategoryId = categoryId;
    showCategoryContextMenu = true;
  }

  function handleCategoryAction({ action, categoryId }: { action: string; categoryId: string }) {
    toasts.addToast(`Action: ${action} on category: ${categoryId}`, 'info');
    showCategoryContextMenu = false;
  }

  function handleChannelContextMenu(event: MouseEvent, channel: Channel) {
    event.preventDefault();
    event.stopPropagation();
    
    closeAllContextMenus();
    const pos = clampToViewport(event.clientX, event.clientY);
    channelContextMenuX = pos.x;
    channelContextMenuY = pos.y;
    selectedChannelForContextMenu = channel;
    showChannelContextMenu = true;
  }

  function getChannelById(id: string) {
    return server.channels.find((c: Channel) => c.id === id);
  }

  function buildChannelLink(channelId: string) {
    const path = `/channels/${server.id}/${channelId}`;
    try {
      if (typeof window !== 'undefined' && window.location?.origin) {
        return `${window.location.origin}${path}`;
      }
    } catch (e) {
      void e;
    }
    return path;
  }

  const MUTED_CHANNELS_KEY = 'mutedChannels';
  function loadMutedChannels(): Set<string> {
    try {
      const raw = localStorage.getItem(MUTED_CHANNELS_KEY);
      if (!raw) return new Set();
      return new Set(JSON.parse(raw));
    } catch {
      return new Set();
    }
  }
  function saveMutedChannels(setVals: Set<string>) {
    try {
      localStorage.setItem(MUTED_CHANNELS_KEY, JSON.stringify(Array.from(setVals)));
    } catch (e) {
      void e;
    }
  }

  async function handleChannelAction({ action, channelId }: { action: string; channelId: string }) {

    try {
      switch (action) {
        case 'delete_channel': {
          const channelName = getChannelById(channelId)?.name || 'this channel';
          const confirmed = confirm(`Delete ${channelName}? This cannot be undone.`);
          if (confirmed) {
            await handleDeleteChannel(channelId);
            toasts.addToast('Channel deleted.', 'success');
          }
          break;
        }
        case 'create_text_channel': {
          newChannelType = 'text';
          showCreateChannelModal = true;
          break;
        }
        case 'create_voice_channel': {
          newChannelType = 'voice';
          showCreateChannelModal = true;
          break;
        }
        case 'edit_channel': {
          const ch = getChannelById(channelId);
          if (!ch) break;
          const newName = prompt('Rename channel', ch.name)?.trim();
          if (newName && newName !== ch.name) {
            const updatedName = slugifyChannelName(newName);
            const updatedChannels = (server.channels || []).map((c: Channel) => c.id === ch.id ? { ...c, name: updatedName } : c);
            serverStore.updateServer(server.id, { channels: updatedChannels });
            toasts.addToast('Channel renamed.', 'success');
          }
          break;
        }
        case 'duplicate_channel': {
          const orig = getChannelById(channelId);
          if (!orig) break;
          const dup: Channel = {
            id: uuidv4(),
            server_id: server.id,
            name: `${orig.name}-copy`,
            channel_type: orig.channel_type,
            private: orig.private,
          };
          try {
            await invoke('create_channel', { channel: dup });
            serverStore.addChannelToServer(server.id, dup);
            toasts.addToast('Channel duplicated.', 'success');
          } catch (e) {
            console.error('Failed to duplicate channel:', e);
            toasts.addToast('Failed to duplicate channel.', 'error');
          }
          break;
        }
        case 'copy_channel_id': {
          await navigator.clipboard.writeText(channelId);
          toasts.addToast('Channel ID copied.', 'success');
          break;
        }
        case 'copy_link': {
          const link = buildChannelLink(channelId);
          await navigator.clipboard.writeText(link);
          toasts.addToast('Channel link copied.', 'success');
          break;
        }
        case 'open_chat': {
          onSelectChannel(server.id, channelId);
          break;
        }
        case 'mark_as_read': {
          toasts.addToast('Marked as read (local).', 'info');
          break;
        }
        case 'mute_channel': {
          const muted = loadMutedChannels();
          if (muted.has(channelId)) {
            muted.delete(channelId);
            toasts.addToast('Channel unmuted (local).', 'info');
          } else {
            muted.add(channelId);
            toasts.addToast('Channel muted (local).', 'info');
          }
          saveMutedChannels(muted);
          mutedChannelIds = new Set(muted);
          break;
        }
        case 'hide_names': {
          toasts.addToast('Hide names not implemented yet.', 'info');
          break;
        }
        case 'notification_settings': {
          gotoResolved('/settings/notifications');
          break;
        }
        case 'invite_people': {
          toasts.addToast('Invites not implemented yet.', 'info');
          break;
        }
        default: {
          console.debug('Unhandled channel action:', action, channelId);
        }
      }
    } finally {
      showChannelContextMenu = false;
    }
  }

  function handleServerBackgroundContextMenu(event: MouseEvent) {
    event.preventDefault();
    closeAllContextMenus();
    const pos = clampToViewport(event.clientX, event.clientY);
    serverBackgroundContextMenuX = pos.x;
    serverBackgroundContextMenuY = pos.y;
    showServerBackgroundContextMenu = true;
  }

  function handleServerBackgroundAction({ action }: { action: string }) {
    switch (action) {
      case 'create_channel':
        showCreateChannelModal = true;
        break;
      case 'create_category':
        toasts.addToast('Create category not implemented yet.', 'info');
        break;
      case 'invite_people':
        handleInvitePeople();
        break;
      case 'hide_muted_channels':
        try {
          const key = 'serverSidebar.hideMuted';
          const current = localStorage.getItem(key) === 'true';
          localStorage.setItem(key, (!current).toString());
          toasts.addToast(`${!current ? 'Hiding' : 'Showing'} muted channels (local).`, 'info');
        } catch (e) { console.error(e) }
        break;
      default:
        console.debug('Unhandled server background action', action);
    }
    showServerBackgroundContextMenu = false;
  }

  function handleInviteToChannelClick(channel: Channel, event?: MouseEvent) {
    event?.stopPropagation();
    const link = buildChannelLink(channel.id);
    navigator.clipboard.writeText(link).then(() => {
      toasts.addToast('Channel link copied.', 'success');
    }).catch(() => {
      toasts.addToast('Failed to copy link.', 'error');
    });
  }

  function handleChannelSettingsClick(channel: Channel, event?: MouseEvent) {
    event?.stopPropagation();
    gotoResolved(`/channels/${server.id}/settings?tab=channels`);
  }
</script>

<div class="bg-muted/50 flex flex-col relative" style="width: {sidebarWidth}px;" oncontextmenu={(e) => handleServerBackgroundContextMenu(e)} role="region" aria-label="Server sidebar">
  {#if server}
    <header class="relative h-[55px] border-b border-border/50 shadow-sm {showDropdown ? 'bg-base-400/50' : 'hover:bg-base-400/50'}" bind:this={dropdownElement}>
      <button
        class="w-full h-full flex items-center justify-between font-bold text-lg truncate transition-colors cursor-pointer pr-8"
        onclick={toggleDropdown}
      >
        <div class="flex items-center font-bold text-lg truncate px-4 py-2">
          {server.name}
        </div>
        <ChevronDown size={10} class="mr-6" />
      </button>

      {#if showDropdown}
        <div class="absolute top-full left-1/2 -translate-x-1/2 w-[218px] bg-muted border border-border rounded-md shadow-lg z-10 mt-1 p-2 transition-all duration-300 ease-in-out origin-top {showDropdown ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-0 pointer-events-none'}">
          <button class="w-full text-left p-2 text-sm hover:bg-base-400/50 flex items-center cursor-pointer rounded-md" onclick={handleServerSettingsClick}>
            <Settings size={10} class="mr-2" /> Server Settings
          </button>
          <button class="w-full text-left p-2 text-sm hover:bg-base-400/50 flex items-center cursor-pointer rounded-md" onclick={handleInvitePeople}>
            <Plus size={10} class="mr-2" /> Invite People
          </button>
          <button class="w-full text-left p-2 text-sm hover:bg-base-400/50 flex items-center cursor-pointer rounded-md" onclick={handleCreateChannelClick}>
            <Plus size={10} class="mr-2" /> Create Channel
          </button>
          <button class="w-full text-left p-2 text-sm hover:bg-base-400/50 flex items-center cursor-pointer rounded-md" onclick={handleCreateCategory}>
            <Plus size={10} class="mr-2" /> Create Category
          </button>
          <button class="w-full text-left p-2 text-sm hover:bg-base-400/50 flex items-center cursor-pointer rounded-md" onclick={handleCreateEvent}>
            <Plus size={10} class="mr-2" /> Create Event
          </button>
          <div class="border-t border-border/50 my-1"></div>
          <button class="w-full text-left p-2 text-sm hover:bg-base-400/50 flex items-center cursor-pointer rounded-md" onclick={handleNotificationSettings}>
            <Bell size={10} class="mr-2" /> Notification Settings
          </button>
          <div class="border-t border-border/50 my-1"></div>
          <button class="w-full text-left p-2 text-sm text-destructive hover:bg-red-500/20 flex items-center cursor-pointer rounded-md" onclick={handleLeaveServer}>
            <CircleX size={10} class="mr-2" /> Leave Server
          </button>
        </div>
        {/if}
    </header>
    <div role="button" tabindex="0" class="flex-grow overflow-y-auto px-2">
      <div class="flex justify-between items-center py-1 mt-4">
        <div
          role="button"
          tabindex="0"
          class="flex items-center cursor-pointer group"
          onclick={() => {
          textChannelsCollapsed = !textChannelsCollapsed;
          try {
            localStorage.setItem(TEXT_COLLAPSED_KEY, textChannelsCollapsed.toString());
          } catch (e) {
            void e;
          }
            if (!textChannelsCollapsed && textChannelsContainer) {
              textChannelsHeight = `${textChannelsContainer.scrollHeight}px`;
            } else {
              textChannelsHeight = '0px';
            }
          }}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              (e.currentTarget as HTMLElement).click();
            }
          }}
          oncontextmenu={(e) => handleCategoryContextMenu(e, 'text-channels')}
        >
          <div class="flex items-center">
            <h3
              class="text-sm font-semibold text-muted-foreground uppercase group-hover:text-foreground select-none"
              class:text-foreground={showCategoryContextMenu && contextMenuCategoryId === 'text-channels'}
            >
              Text Channels
            </h3>
            <ChevronDown
              size={10}
              class="ml-1 transition-transform duration-200 {textChannelsCollapsed ? 'rotate-[-90deg]' : ''}"
            />
          </div>
        </div>
        <button class="text-muted-foreground hover:text-foreground cursor-pointer" onclick={handleCreateChannelClick} aria-label="Create Channel">
          <Plus size={10} class="mr-2" />
        </button>
      </div>
      
      <div
        class="overflow-hidden transition-all duration-300 ease-in-out"
        style="max-height: {textChannelsCollapsed ? '0' : textChannelsHeight};"
        bind:this={textChannelsContainer}
      >
        {#if server && server.channels && server.channels.length > 0}
          {#each server.channels.filter((c: Channel) => c.channel_type === 'text' && (!hideMutedChannels || !mutedChannelIds.has(c.id))) as channel (channel.id)}
            <div
              role="button"
              tabindex="0"
              class="group w-full h-[34px] text-left py-2 px-2 flex items-center justify-between transition-colors cursor-pointer my-1 rounded-md
              {$activeChannelId === channel.id ? 'bg-primary/80 text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}"
              onclick={() => onSelectChannel(server.id, channel.id)}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { onSelectChannel(server.id, channel.id); } }}
              oncontextmenu={(e) => handleChannelContextMenu(e, channel)}
            >
              <div class="flex items-center truncate">
                <Hash size={10} class="mr-1" />
                <span class="truncate select-none ml-2">{channel.name}</span>
              </div>
              <div class="ml-auto flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button type="button" class="text-muted-foreground hover:text-foreground p-1 cursor-pointer" onclick={(event) => handleInviteToChannelClick(channel, event)} aria-label="Invite to channel">
                  <Plus size={10} />
                </button>
                <button type="button" class="text-muted-foreground hover:text-foreground p-1 cursor-pointer" onclick={(event) => handleChannelSettingsClick(channel, event)} aria-label="Channel settings">
                  <Settings size={10} />
                </button>
              </div>
            </div>
          {/each}
        {:else}
          <p class="text-xs text-muted-foreground px-2 py-1">No text channels yet.</p>
        {/if}
      </div>
    </div>
  {:else}
    <div role="button" tabindex="0" class="flex-grow overflow-y-auto" oncontextmenu={(e) => handleServerBackgroundContextMenu(e)}>
      <p class="text-xs text-muted-foreground px-2 py-1">No server selected.</p>
    </div>
  {/if}
  <button
    class="absolute top-0 right-0 w-2 h-full cursor-ew-resize"
    onmousedown={startResize}
    aria-label="Resize server sidebar"
  ></button>
</div>

  {#if showServerBackgroundContextMenu}
    <ServerBackgroundContextMenu
      x={serverBackgroundContextMenuX}
      y={serverBackgroundContextMenuY}
      onaction={handleServerBackgroundAction}
      onclose={() => showServerBackgroundContextMenu = false}
    />
  {/if}

  {#if showCategoryContextMenu}
    <CategoryContextMenu
      x={contextMenuX}
      y={contextMenuY}
      categoryId={contextMenuCategoryId}
      onaction={handleCategoryAction}
      onclose={() => showCategoryContextMenu = false}
    />
  {/if}

  {#if showChannelContextMenu && selectedChannelForContextMenu}
    <ChannelContextMenu
      x={channelContextMenuX}
      y={channelContextMenuY}
      channel={selectedChannelForContextMenu}
      onaction={handleChannelAction}
      onclose={() => { showChannelContextMenu = false; selectedChannelForContextMenu = null; }}
    />
  {/if}

{#if showCreateChannelModal}
  <div role="button" tabindex="0" class="fixed inset-0 flex items-center justify-center z-50" style="background-color: rgba(0, 0, 0, 0.5);" onclick={() => showCreateChannelModal = false}
      onkeydown={(e) => {
        if (e.key === 'Enter') {
          showCreateChannelModal = false;
        }
      }}
    >
    <div class="bg-card p-6 rounded-lg shadow-lg w-11/12 max-w-md">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold">Create New Channel</h2>
        <button onclick={() => showCreateChannelModal = false} class="text-muted-foreground hover:text-foreground cursor-pointer">
          <X size={12} />
        </button>
      </div>
      <input
        type="text"
        placeholder="channel-name"
        class="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring mb-4"
        bind:value={newChannelName}
        onkeydown={(e) => { if (e.key === 'Enter') { createChannel(); } }}
      />

      <div class="mb-4">
        <span class="block text-sm font-medium text-muted-foreground mb-2">Channel Type</span>
        <div class="flex space-x-4">
          <label for="channelTypeText" class="inline-flex items-center cursor-pointer">
            <input type="radio" id="channelTypeText" name="channelType" value="text" bind:group={newChannelType} class="form-radio text-highlight-100 bg-muted border-border" />
            <span class="ml-2 text-muted-foreground">Text</span>
          </label>
          <label for="channelTypeVoice" class="inline-flex items-center cursor-pointer">
            <input type="radio" id="channelTypeVoice" name="channelType" value="voice" bind:group={newChannelType} class="form-radio text-highlight-100 bg-muted border-border" />
            <span class="ml-2 text-muted-foreground">Voice</span>
          </label>
        </div>
      </div>

      <div class="mb-4">
        <label class="inline-flex items-center cursor-pointer">
          <input type="checkbox" bind:checked={newChannelPrivate} class="form-checkbox text-highlight-100 bg-muted border-border rounded" />
          <span class="ml-2 text-muted-foreground">Private Channel</span>
        </label>
      </div>

      <button
        class="w-full bg-primary text-foreground rounded-md px-4 py-2 flex items-center justify-center hover:bg-accent disabled:bg-highlight-300 disabled:cursor-not-allowed cursor-pointer"
        onclick={createChannel}
        disabled={!newChannelName.trim()}
      >
        <Plus size={10} class="mr-2" /> Create Channel
      </button>
    </div>
  </div>
{/if}







