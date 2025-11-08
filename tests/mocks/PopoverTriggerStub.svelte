<svelte:options runes={true} />

<script lang="ts">
  let { class: className = "", children } = $props<{
    class?: string;
    children?: () => unknown;
  }>();
</script>

<div class={className} data-testid="popover-trigger-stub">
  {@render children?.()}
</div>
