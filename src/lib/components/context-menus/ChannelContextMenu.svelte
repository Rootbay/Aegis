<svelte:options runes={true} />

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Channel } from '$lib/features/channels/models/Channel';

  type ChannelContextMenuDetail = {
    action: string;
    channelId: string;
  };

  type ChannelContextMenuHandler = (detail: ChannelContextMenuDetail) => void; // eslint-disable-line no-unused-vars

  type ChannelContextMenuProps = {
    x: number;
    y: number;
    channel: Channel;
    onaction?: ChannelContextMenuHandler;
    onclose?: () => void;
  };

  let { x, y, channel, onaction, onclose }: ChannelContextMenuProps = $props();

  function handleAction(action: string) {
    onaction?.({ action, channelId: channel.id });
  }

  let contextMenuElement: HTMLElement | null = null;

  function handleClickOutside(event: MouseEvent) {
    if (contextMenuElement && !contextMenuElement.contains(event.target as Node)) {
      onclose?.();
    }
  }

  function handleScroll() {
    onclose?.();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onclose?.();
    }
  }

  onMount(() => {
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('contextmenu', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('click', handleClickOutside);
    window.removeEventListener('contextmenu', handleClickOutside);
    window.removeEventListener('scroll', handleScroll, true);
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div
  class="absolute z-50 bg-card border border-zinc-700 rounded-md shadow-lg py-1 w-48 text-sm"
  style="left: {x}px; top: {y}px;"
  bind:this={contextMenuElement}
>
  {#if channel.channel_type === 'text'}
    <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('mark_as_read')}>Mark As Read</button>
    <div class="border-t border-zinc-600 my-1"></div>
    <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('invite_people')}>Invite People</button>
    <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('copy_link')}>Copy Link</button>
    <div class="border-t border-zinc-600 my-1"></div>
    <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('mute_channel')}>Mute Channel</button>
    <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('notification_settings')}>Notification Settings</button>
    <div class="border-t border-zinc-600 my-1"></div>
    <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('edit_channel')}>Edit Channel</button>
    <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('duplicate_channel')}>Duplicate Channel</button>
    <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('create_text_channel')}>Create Text Channel</button>
    <button class="w-full text-left px-4 py-2 text-red-400 hover:bg-red-500/20" onclick={() => handleAction('delete_channel')}>Delete Channel</button>
    <div class="border-t border-zinc-600 my-1"></div>
    <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('copy_channel_id')}>Copy Channel ID</button>
  {:else if channel.channel_type === 'voice'}
    <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('mark_as_read')}>Mark As Read</button>
    <div class="border-t border-zinc-600 my-1"></div>
    <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('invite_people')}>Invite People</button>
    <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('copy_link')}>Copy Link</button>
    <div class="border-t border-zinc-600 my-1"></div>
    <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('open_chat')}>Open Chat</button>
    <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('hide_names')}>Hide Names</button>
    <div class="border-t border-zinc-600 my-1"></div>
    <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('mute_channel')}>Mute Channel</button>
    <div class="border-t border-zinc-600 my-1"></div>
    <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('edit_channel')}>Edit Channel</button>
    <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('duplicate_channel')}>Duplicate Channel</button>
    <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('create_voice_channel')}>Create Voice Channel</button>
    <button class="w-full text-left px-4 py-2 text-red-400 hover:bg-red-500/20" onclick={() => handleAction('delete_channel')}>Delete Channel</button>
    <div class="border-t border-zinc-600 my-1"></div>
    <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('copy_channel_id')}>Copy Channel ID</button>
  {/if}
</div>
