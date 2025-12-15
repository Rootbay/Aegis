<svelte:options runes={true} />

<script lang="ts">
  import { getContext } from "svelte";
  import type { Snippet } from "svelte";
  import { dialogContextKey } from "./ui-dialog-context";

  let {
    asChild = false,
    children,
  }: {
    asChild?: boolean;
    children?: Snippet<[{ close: (val?: boolean) => void }]>;
  } = $props();

  const dialog = getContext<{ close: (value?: boolean) => void } | undefined>(
    dialogContextKey,
  );

  function close(val?: boolean) {
    dialog?.close(val);
    console.log(val);
  }
</script>

{#if asChild}
  {@render children?.({ close })}
{:else}
  <button type="button" onclick={() => close(false)}>
    {@render children?.({ close })}
  </button>
{/if}
