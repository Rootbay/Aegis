<script lang="ts">
  import { cn } from '$lib/utils';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  type GroupLabelProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
    children?: Snippet;
  };

  let { class: className, children, ...rest }: GroupLabelProps = $props();
</script>

<header
  data-slot="sidebar-group-label"
  class={cn('flex items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground', className)}
  {...rest}
>
  {@render children?.()}
</header>
