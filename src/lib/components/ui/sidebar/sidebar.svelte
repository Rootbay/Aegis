<script lang="ts">
  import { cn } from '$lib/utils';
  import type { HTMLAttributes } from 'svelte/elements';

  type SidebarProps = HTMLAttributes<HTMLElement> & {
    side?: 'left' | 'right';
    variant?: 'solid' | 'muted';
  };

  let {
    side = 'right',
    variant = 'solid',
    class: className,
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
  <slot />
</aside>
