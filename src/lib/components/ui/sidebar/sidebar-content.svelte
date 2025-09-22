<script lang="ts">
  import { cn } from '$lib/utils';
  import type { HTMLAttributes } from 'svelte/elements';

  let { class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
  data-slot="sidebar-content"
  class={cn('flex-1 overflow-hidden', className)}
  {...rest}
>
  <slot />
</div>
