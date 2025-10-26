<svelte:options runes={true} />

<script lang="ts">
  type CloseHandler = () => void;

  let { onclose }: { onclose?: CloseHandler } = $props();
</script>

<div data-testid="category-context-menu">
  <button type="button" data-testid="category-context-close" onclick={() => onclose?.()}>
    Close
  </button>
</div>
