<svelte:options runes={true} />

<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    tag = "div",
    class: className = "",
    children,
  }: {
    tag?: string;
    class?: string;
    children?: Snippet;
  } = $props();
</script>

<svelte:element this={tag} class={className} data-testid={`dialog-${tag}-stub`}>
  {@render children?.()}
</svelte:element>
