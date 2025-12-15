<svelte:options runes={true} />

<script lang="ts">
  type ActionHandler = (act: string, catId: string) => void;
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
    onaction?.(action, categoryId);
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
    data-testid="category-context-mute"
    onclick={() => trigger("mute_category")}
  >
    Mute Category
  </button>
  <button
    type="button"
    data-testid="category-context-notifications"
    onclick={() => trigger("notification_settings")}
  >
    Notification Settings
  </button>
  <button
    type="button"
    data-testid="category-context-edit"
    onclick={() => trigger("edit_category")}
  >
    Edit Category
  </button>
  <button
    type="button"
    data-testid="category-context-close"
    onclick={() => onclose?.()}
  >
    Close
  </button>
</div>
