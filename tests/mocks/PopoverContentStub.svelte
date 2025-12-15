<svelte:options runes={true} />

<script lang="ts">
  let {
    class: className = "",
    children,
  } = $props<{
    class?: string;
    children?: (props: { close: (flag?: boolean) => void }) => unknown;
  }>();

  function close() {}
</script>

<div class={className} data-testid="popover-content-stub">
  {@render children?.({ close })}
</div>
