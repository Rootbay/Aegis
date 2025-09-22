<script lang="ts">
  import { cn } from '$lib/utils';
  import type { ButtonHTMLAttributes } from 'svelte/elements';

  type SidebarMenuButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    active?: boolean;
  };

  let {
    class: className,
    active = false,
    ...rest
  }: SidebarMenuButtonProps = $props();
</script>

<button
  type="button"
  data-slot="sidebar-menu-button"
  data-active={active}
  class={cn(
    'flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
    active ? 'bg-muted text-foreground' : 'hover:bg-muted/80',
    className
  )}
  {...rest}
>
  <slot />
</button>
