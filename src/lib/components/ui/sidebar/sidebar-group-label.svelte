<script lang="ts">
  import { cn } from '$lib/utils';
  import type { HTMLAttributes } from 'svelte/elements';

  let { class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<header
  data-slot="sidebar-group-label"
  class={cn('flex items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground', className)}
  {...rest}
>
  <slot />
</header>
