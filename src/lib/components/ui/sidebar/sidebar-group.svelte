<script lang="ts">
  import { cn } from "$lib/utils";
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  type GroupProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
    children?: Snippet;
  };

  let { class: className, children, ...rest }: GroupProps = $props();
</script>

<section
  data-slot="sidebar-group"
  class={cn("flex flex-col gap-1", className)}
  {...rest}
>
  {@render children?.()}
</section>
