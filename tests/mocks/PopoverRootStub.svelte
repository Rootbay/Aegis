<svelte:options runes={true} />

<script lang="ts">
  let { children } = $props<{ children?: () => unknown }>();
</script>

<div data-testid="popover-root-stub">
  {@render children?.()}
</div>
