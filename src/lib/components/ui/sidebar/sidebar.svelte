<script lang="ts">
  import { cn } from '$lib/utils';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  type SidebarProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
    side?: 'left' | 'right';
    variant?: 'solid' | 'muted';
    children?: Snippet;
  };

  let {
    side = 'right',
    variant = 'solid',
    class: className,
    children,
    ...rest
  }: SidebarProps = $props();
</script>

<aside
  data-slot="sidebar"
  data-side={side}
  class={cn(
    'h-full min-h-0 w-[260px] shrink-0 flex-col text-muted-foreground backdrop-blur',
    side === 'left' ? 'border-r border-border' : 'border-l border-border',
    variant === 'muted' ? 'bg-muted/80' : 'bg-card/90',
    className
  )}
  {...rest}
>
  {@render children?.()}
</aside>
