<svelte:options runes={true} />

<script lang="ts">
  let { class: className = "", children } = $props<{
    class?: string;
    children?: () => unknown;
  }>();
</script>

<div data-testid="dialog-content-stub" class={className}>
  {@render children?.()}
</div>
