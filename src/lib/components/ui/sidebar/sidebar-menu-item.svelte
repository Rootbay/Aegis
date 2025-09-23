<script lang="ts">
  import { cn } from "$lib/utils";
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  type MenuItemProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
    children?: Snippet;
  };

  let { class: className, children, ...rest }: MenuItemProps = $props();
</script>

<div data-slot="sidebar-menu-item" class={cn("relative", className)} {...rest}>
  {@render children?.()}
</div>
