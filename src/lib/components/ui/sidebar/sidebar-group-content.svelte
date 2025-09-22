<script lang="ts">
  import { cn } from '$lib/utils';
  import type { HTMLAttributes } from 'svelte/elements';

  let { class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
  data-slot="sidebar-group-content"
  class={cn('px-2 pb-2', className)}
  {...rest}
>
  <slot />
</div>
