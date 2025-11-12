<script lang="ts">
  import type { Channel } from "$lib/features/channels/models/Channel";
  import { v4 as uuidv4 } from "uuid";
  import { Hash, Volume2, Plus, Pencil, Trash, X, Check } from "@lucide/svelte";
  import {
    SLOWMODE_PRESETS,
    buildSlowmodeOptions,
    normalizeSlowmodeValue,
  } from "$lib/features/channels/utils/slowmode";

  type UnaryHandler<T> = (value: T) => void; // eslint-disable-line no-unused-vars

  type ChannelManagementProps = {
    channels?: Channel[];
    onadd_channel?: UnaryHandler<Channel>;
    onupdate_channel?: UnaryHandler<Channel>;
    ondelete_channel?: UnaryHandler<string>;
  };

  let {
    channels = [],
    onadd_channel,
    onupdate_channel,
    ondelete_channel,
  }: ChannelManagementProps = $props();

  let newChannelName = $state("");
  let newChannelType = $state<"text" | "voice">("text");
  let newChannelSlowmode = $state(0);
  let editingChannel = $state<Channel | null>(null);
  let editingChannelName = $state("");
  let editingChannelType = $state<"text" | "voice">("text");
  let editingChannelSlowmode = $state(0);

  let newChannelSlowmodeOptions = buildSlowmodeOptions();
  let editingChannelSlowmodeOptions = buildSlowmodeOptions();

  $effect(() => {
    newChannelSlowmodeOptions = buildSlowmodeOptions([
      ...SLOWMODE_PRESETS,
      newChannelSlowmode,
    ]);
  });

  $effect(() => {
    editingChannelSlowmodeOptions = buildSlowmodeOptions([
      ...SLOWMODE_PRESETS,
      editingChannelSlowmode,
    ]);
  });

  $effect(() => {
    if (newChannelType === "voice") {
      newChannelSlowmode = 0;
    }
  });

  $effect(() => {
    if (editingChannelType === "voice") {
      editingChannelSlowmode = 0;
    }
  });

  function addChannel() {
    if (newChannelName.trim()) {
      const newChannel: Channel = {
        id: uuidv4(),
        name: newChannelName.trim(),
        server_id: "",
        channel_type: newChannelType,
        private: false,
        position: channels.length,
        category_id: null,
        rate_limit_per_user:
          newChannelType === "text" ? newChannelSlowmode : 0,
      };
      onadd_channel?.(newChannel);
      newChannelName = "";
      newChannelSlowmode = 0;
    }
  }

  function startEditChannel(channel: Channel) {
    editingChannel = { ...channel };
    editingChannelName = channel.name;
    editingChannelType = channel.channel_type;
    editingChannelSlowmode = channel.rate_limit_per_user ?? 0;
  }

  function saveEditChannel() {
    if (editingChannel && editingChannelName.trim()) {
      onupdate_channel?.({
        ...editingChannel,
        name: editingChannelName.trim(),
        channel_type: editingChannelType,
        rate_limit_per_user:
          editingChannelType === "text" ? editingChannelSlowmode : 0,
      });
      editingChannel = null;
      editingChannelName = "";
      editingChannelSlowmode = 0;
    }
  }

  function cancelEditChannel() {
    editingChannel = null;
    editingChannelName = "";
    editingChannelSlowmode = 0;
  }

  function deleteChannel(channelId: string) {
    if (confirm("Are you sure you want to delete this channel?")) {
      ondelete_channel?.(channelId);
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
      onkeydown={(e) => {
        if (e.key === "Enter") addChannel();
      }}
      class="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-ring"
    />
    <select
      bind:value={newChannelType}
      class="bg-muted border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="text">Text</option>
      <option value="voice">Voice</option>
    </select>
    <button
      onclick={addChannel}
      class="bg-primary hover:bg-accent text-foreground p-2 rounded-md flex items-center justify-center"
    >
      <Plus size={12} />
    </button>
  </div>

  {#if newChannelType === "text"}
    <div class="flex items-center gap-2 mb-4">
      <label class="text-xs font-semibold uppercase text-muted-foreground">
        Slowmode
      </label>
      <select
        class="flex-1 bg-muted border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        onchange={(event) => {
          const target = event.target as HTMLSelectElement;
          newChannelSlowmode = normalizeSlowmodeValue(target.value);
        }}
      >
        {#each newChannelSlowmodeOptions as option (option.value)}
          <option value={option.value} selected={option.value === newChannelSlowmode}>
            {option.label}
          </option>
        {/each}
      </select>
    </div>
  {/if}

  <div class="space-y-2">
    {#each channels as channel (channel.id)}
      <div class="bg-muted/50 p-3 rounded-lg flex items-center justify-between">
        <span class="font-medium flex items-center gap-2">
          {#if channel.channel_type === "text"}
            <Hash size={20} />
          {:else}
            <Volume2 size={20} />
          {/if}
          {channel.name}
        </span>
        <div>
          <button
            onclick={() => startEditChannel(channel)}
            class="text-muted-foreground hover:text-foreground mr-2"
            ><Pencil size={12} /></button
          >
          <button
            onclick={() => deleteChannel(channel.id)}
            class="text-destructive hover:text-destructive/80"
            ><Trash size={12} /></button
          >
        </div>
      </div>
      {#if editingChannel?.id === channel.id}
        <div class="bg-muted/50 p-4 rounded-lg mt-2 space-y-4">
          <div class="flex items-center gap-4">
            <label
              for="editChannelName"
              class="text-sm font-medium text-muted-foreground w-24"
              >Channel Name</label
            >
            <input
              type="text"
              id="editChannelName"
              bind:value={editingChannelName}
              class="flex-1 bg-muted border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div class="flex items-center gap-4">
            <label
              for="editChannelType"
              class="text-sm font-medium text-muted-foreground w-24"
              >Channel Type</label
            >
            <select
              id="editChannelType"
              bind:value={editingChannelType}
              class="flex-1 bg-muted border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="text">Text</option>
              <option value="voice">Voice</option>
            </select>
          </div>
          {#if editingChannelType === "text"}
            <div class="flex items-center gap-4">
              <label class="text-sm font-medium text-muted-foreground w-24">
                Slowmode
              </label>
              <select
                class="flex-1 bg-muted border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                onchange={(event) => {
                  const target = event.target as HTMLSelectElement;
                  editingChannelSlowmode = normalizeSlowmodeValue(target.value);
                }}
              >
                {#each editingChannelSlowmodeOptions as option (option.value)}
                  <option value={option.value} selected={option.value === editingChannelSlowmode}>
                    {option.label}
                  </option>
                {/each}
              </select>
            </div>
          {/if}
          <div class="flex justify-end gap-2 mt-4">
            <button
              onclick={cancelEditChannel}
              class="px-4 py-2 bg-base-400 hover:bg-base-500 text-foreground rounded-md font-semibold"
            >
              <X size={10} class="inline-block mr-1" /> Cancel
            </button>
            <button
              onclick={saveEditChannel}
              class="px-4 py-2 bg-primary hover:bg-accent text-foreground rounded-md font-semibold"
            >
              <Check size={10} class="inline-block mr-1" /> Save
            </button>
          </div>
        </div>
      {/if}
    {/each}
  </div>
</div>
