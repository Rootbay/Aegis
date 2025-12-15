<svelte:options runes={true} />

<script lang="ts" generics="T = unknown">
  let {
    items = [],
    renderItem,
    keyProp,
  } = $props<{
    items?: T[];
    renderItem?: (datum: T, pos: number) => any;
    keyProp?: string;
  }>();
</script>

<div data-testid="virtual-list-stub">
  {#if renderItem}
    {#each items as item, index (keyProp ? ((item as any)?.[keyProp] ?? index) : index)}
      {@render renderItem(item, index)}
    {/each}
  {/if}
</div>
