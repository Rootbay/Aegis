<svelte:options runes={true} />

<script lang="ts">
  let { chat } = $props<{ chat: unknown }>();
  void chat;
</script>

<div data-testid="chat-view-stub"></div>
