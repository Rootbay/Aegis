<script lang="ts">
  import { cn } from '$lib/utils';
  import type { HTMLAttributes } from 'svelte/elements';

  let { class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<nav
  data-slot="sidebar-menu"
  class={cn('flex flex-col gap-1', className)}
  {...rest}
>
  <slot />
</nav>
