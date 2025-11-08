<svelte:options runes={true} />

<script lang="ts">
  let {
    open = false,
    onOpenChange,
    children,
  }: {
    open?: boolean;
    onOpenChange?: (value: boolean) => void;
    children?: () => unknown;
  } = $props();

  $effect(() => {
    onOpenChange?.(open);
  });
</script>

<div data-testid="dialog-root-stub">
  {@render children?.()}
</div>
