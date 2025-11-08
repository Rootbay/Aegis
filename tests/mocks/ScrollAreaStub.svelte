<svelte:options runes={true} />

<script lang="ts">
  let { children } = $props<{ children?: () => unknown }>();
</script>

<div data-testid="scroll-area-stub" class="flex-1 overflow-auto">
  {@render children?.()}
</div>
