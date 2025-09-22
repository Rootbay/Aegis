<script lang="ts">
  import { cn } from '$lib/utils';
  import type { HTMLAttributes } from 'svelte/elements';

  let { class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
  data-slot="sidebar-header"
  class={cn('flex h-[55px] items-center gap-3 border-b border-border px-4 text-foreground', className)}
  {...rest}
>
  <slot />
</div>
