<script lang="ts">
  import { cn } from "$lib/utils";
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  type MenuProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
    children?: Snippet;
  };

  let { class: className, children, ...rest }: MenuProps = $props();
</script>

<nav
  data-slot="sidebar-menu"
  class={cn("flex flex-col gap-1", className)}
  {...rest}
>
  {@render children?.()}
</nav>
