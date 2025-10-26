<svelte:options runes={true} />

<script lang="ts">
  type ActionDetail = { action: string };
  type ActionHandler = (detail: ActionDetail) => void;
  type ChildrenRenderer = () => any;

  let {
    onaction,
    children,
  }: {
    onaction?: ActionHandler;
    children?: ChildrenRenderer;
  } = $props();
</script>

<div data-testid="server-background-menu">
  {@render children?.()}
  <button
    type="button"
    data-testid="server-background-create-category"
    onclick={() => onaction?.({ action: "create_category" })}
  >
    Create Category
  </button>
  <button
    type="button"
    data-testid="server-background-invite"
    onclick={() => onaction?.({ action: "invite_people" })}
  >
    Invite People
  </button>
</div>
