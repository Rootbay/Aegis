<svelte:options runes={true} />

<script lang="ts">
  type ActionDetail = { action: string; categoryId: string };
  type ActionHandler = (detail: ActionDetail) => void;
  type CloseHandler = () => void;

  let {
    categoryId,
    onaction,
    onclose,
  }: {
    categoryId: string;
    onaction?: ActionHandler;
    onclose?: CloseHandler;
  } = $props();

  function trigger(action: string) {
    onaction?.({ action, categoryId });
  }
</script>

<div data-testid="category-context-menu">
  <button
    type="button"
    data-testid="category-context-create"
    onclick={() => trigger("create_channel")}
  >
    Create Channel
  </button>
  <button
    type="button"
    data-testid="category-context-close"
    onclick={() => onclose?.()}
  >
    Close
  </button>
</div>
