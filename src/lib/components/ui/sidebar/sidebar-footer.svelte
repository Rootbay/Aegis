<script lang="ts">
  import { cn } from "$lib/utils";
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  type FooterProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
    children?: Snippet;
  };

  let { class: className, children, ...rest }: FooterProps = $props();
</script>

<footer
  data-slot="sidebar-footer"
  class={cn("border-t border-border px-4 py-3", className)}
  {...rest}
>
  {@render children?.()}
</footer>
