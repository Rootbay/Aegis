<svelte:options runes={true} />

<script lang="ts">
  import type { Channel } from "$lib/features/channels/models/Channel";

  type ChannelActionDetail = { action: string; channelId: string };
  type ChannelActionHandler = (detail: ChannelActionDetail) => void;
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
    onclick={() =>
      onaction?.({ action: "invite_people", channelId: channel.id })}
  >
    Invite People
  </button>
  <button
    type="button"
    data-testid="channel-context-close"
    onclick={() => onclose?.()}
  >
    Close
  </button>
</div>
