<svelte:options runes={true} />

<script lang="ts">
  import { setContext } from "svelte";
  import type { Snippet } from "svelte";
  import { dialogContextKey } from "./ui-dialog-context";

  let {
    open = false,
    onOpenChange,
    children,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: Snippet;
  } = $props();

  function closeDialog(nextOpen = false) {
    onOpenChange?.(nextOpen);
  }

  setContext(dialogContextKey, {
    close: () => closeDialog(false),
    setOpen: closeDialog,
  });

  $effect(() => {
    onOpenChange?.(open);
  });
</script>

<div data-testid="dialog-root-stub">
  {@render children?.()}
</div>
