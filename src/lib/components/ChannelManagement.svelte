<script lang="ts">
  import type { Channel } from '$lib/models/Channel';
  import { v4 as uuidv4 } from 'uuid';
  import { Hash, Volume2, Plus, Pencil, Trash, X, Check } from '@lucide/svelte';

  export let channels: Channel[] = [];
  export let onAddChannel: (channel: Channel) => void;
  export let onUpdateChannel: (channel: Channel) => void;
  export let onDeleteChannel: (channelId: string) => void;

  let newChannelName = '';
  let newChannelType: 'text' | 'voice' = 'text';
  let editingChannel: Channel | null = null;
  let editingChannelName = '';
  let editingChannelType: 'text' | 'voice' = 'text';

  function addChannel() {
    if (newChannelName.trim()) {
      const newChannel: Channel = {
        id: uuidv4(),
        name: newChannelName.trim(),
        server_id: '',
        channel_type: newChannelType,
        private: false,
      };
      onAddChannel(newChannel);
      newChannelName = '';
    }
  }

  function startEditChannel(channel: Channel) {
    editingChannel = { ...channel };
    editingChannelName = channel.name;
    editingChannelType = channel.channel_type;
  }

  function saveEditChannel() {
    if (editingChannel && editingChannelName.trim()) {
      onUpdateChannel({ ...editingChannel, name: editingChannelName.trim(), channel_type: editingChannelType });
      editingChannel = null;
      editingChannelName = '';
    }
  }

  function cancelEditChannel() {
    editingChannel = null;
    editingChannelName = '';
  }

  function deleteChannel(channelId: string) {
    if (confirm('Are you sure you want to delete this channel?')) {
      onDeleteChannel(channelId);
      if (editingChannel?.id === channelId) {
        editingChannel = null;
      }
    }
  }
</script>

<div class="space-y-4">
  <h3 class="text-xl font-semibold text-white">Channel Management</h3>

  <div class="flex gap-2 mb-4">
    <input
      type="text"
      placeholder="New Channel Name"
      bind:value={newChannelName}
      onkeydown={(e) => { if (e.key === 'Enter') addChannel(); }}
      class="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-ring"
    />
    <select bind:value={newChannelType} class="bg-muted border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
      <option value="text">Text</option>
      <option value="voice">Voice</option>
    </select>
    <button onclick={addChannel} class="bg-primary hover:bg-accent text-foreground p-2 rounded-md flex items-center justify-center">
      <Plus size={12} />
    </button>
  </div>

  <div class="space-y-2">
    {#each channels as channel (channel.id)}
      <div class="bg-muted/50 p-3 rounded-lg flex items-center justify-between">
        <span class="font-medium flex items-center gap-2">
          {#if channel.channel_type === 'text'}
            <Hash size={20} />
          {:else}
            <Volume2 size={20} />
          {/if}
          {channel.name}
        </span>
        <div>
          <button onclick={() => startEditChannel(channel)} class="text-muted-foreground hover:text-foreground mr-2"><Pencil size={12} /></button>
          <button onclick={() => deleteChannel(channel.id)} class="text-destructive hover:text-destructive/80"><Trash size={12} /></button>
        </div>
      </div>
      {#if editingChannel?.id === channel.id}
        <div class="bg-muted/50 p-4 rounded-lg mt-2 space-y-4">
          <div class="flex items-center gap-4">
            <label for="editChannelName" class="text-sm font-medium text-muted-foreground w-24">Channel Name</label>
            <input
              type="text"
              id="editChannelName"
              bind:value={editingChannelName}
              class="flex-1 bg-muted border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div class="flex items-center gap-4">
            <label for="editChannelType" class="text-sm font-medium text-muted-foreground w-24">Channel Type</label>
            <select
              id="editChannelType"
              bind:value={editingChannelType}
              class="flex-1 bg-muted border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="text">Text</option>
              <option value="voice">Voice</option>
            </select>
          </div>
          <div class="flex justify-end gap-2 mt-4">
            <button onclick={cancelEditChannel} class="px-4 py-2 bg-base-400 hover:bg-base-500 text-foreground rounded-md font-semibold">
              <X size={10} class="inline-block mr-1" /> Cancel
            </button>
            <button onclick={saveEditChannel} class="px-4 py-2 bg-primary hover:bg-accent text-foreground rounded-md font-semibold">
              <Check size={10} class="inline-block mr-1" /> Save
            </button>
          </div>
        </div>
      {/if}
    {/each}
  </div>
</div>
