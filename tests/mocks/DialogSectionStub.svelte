<svelte:options runes={true} />

<script lang="ts">
  let {
    tag = "div",
    class: className = "",
    children,
  }: {
    tag?: keyof HTMLElementTagNameMap;
    class?: string;
    children?: () => unknown;
  } = $props();
</script>

<svelte:element this={tag} class={className} data-testid={`dialog-${tag}-stub`}>
  {@render children?.()}
</svelte:element>
