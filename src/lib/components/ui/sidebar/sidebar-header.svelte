<script lang="ts">
  import { cn } from "$lib/utils";
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  type HeaderProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
    children?: Snippet;
  };

  let { class: className, children, ...rest }: HeaderProps = $props();
</script>

<div
  data-slot="sidebar-header"
  class={cn(
    "flex h-[55px] items-center gap-3 border-b border-border px-4 text-foreground",
    className,
  )}
  {...rest}
>
  {@render children?.()}
</div>
