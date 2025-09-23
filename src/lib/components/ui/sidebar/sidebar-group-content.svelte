<script lang="ts">
  import { cn } from "$lib/utils";
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  type GroupContentProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
    children?: Snippet;
  };

  let { class: className, children, ...rest }: GroupContentProps = $props();
</script>

<div
  data-slot="sidebar-group-content"
  class={cn("px-2 pb-2", className)}
  {...rest}
>
  {@render children?.()}
</div>
