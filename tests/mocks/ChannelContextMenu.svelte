<svelte:options runes={true} />

<script lang="ts">
  import type { Channel } from "$lib/features/channels/models/Channel";

  type ChannelActionHandler = (act: string, chanId: string) => void;
  type CloseHandler = () => void;

  let {
    channel,
    onaction,
    onclose,
  }: {
    channel: Channel;
    onaction?: ChannelActionHandler;
    onclose?: CloseHandler;
  } = $props();
</script>

<div data-testid="channel-context-menu">
  <button
    type="button"
    data-testid="channel-context-invite"
    onclick={() => onaction?.("invite_people", channel.id)}
  >
    Invite People
  </button>
  <button
    type="button"
    data-testid="channel-context-mute"
    onclick={() => onaction?.("mute_channel", channel.id)}
  >
    Toggle Mute
  </button>
  <button
    type="button"
    data-testid="channel-context-close"
    onclick={() => onclose?.()}
  >
    Close
  </button>
</div>
