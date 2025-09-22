<script lang="ts">
  import { cn } from '$lib/utils';
  import type { HTMLAttributes } from 'svelte/elements';

  let { class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
  data-slot="sidebar-menu-item"
  class={cn('relative', className)}
  {...rest}
>
  <slot />
</div>
