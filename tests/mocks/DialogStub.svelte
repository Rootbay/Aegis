<svelte:options runes={true} />

<script lang="ts">
  import { setContext } from "svelte";
  import { dialogContextKey } from "./ui-dialog-context";

  let {
    open = false,
    onOpenChange,
    children,
  }: {
    open?: boolean;
    onOpenChange?: (value: boolean) => void;
    children?: () => unknown;
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
