<svelte:options runes={true} />

<script lang="ts">
  let { class: className = "", as = "div", dataTestId, children } = $props<{
    class?: string;
    as?: keyof HTMLElementTagNameMap;
    dataTestId?: string;
    children?: () => unknown;
  }>();
</script>

<svelte:element this={as} class={className} data-testid={dataTestId}>
  {@render children?.()}
</svelte:element>
