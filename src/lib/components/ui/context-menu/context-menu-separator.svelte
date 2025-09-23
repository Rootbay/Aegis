<script lang="ts">
  import { cn } from "$lib/utils.js";
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";

  let { class: className, ...restProps }: ContextMenuPrimitive.SeparatorProps =
    $props();
</script>

<ContextMenuPrimitive.Separator
  data-slot="context-menu-separator"
  class={cn("-mx-1 my-1 h-px bg-border", className)}
  {...restProps}
/>
