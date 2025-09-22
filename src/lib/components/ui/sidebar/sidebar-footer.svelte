<script lang="ts">
  import { cn } from '$lib/utils';
  import type { HTMLAttributes } from 'svelte/elements';

  let { class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<footer
  data-slot="sidebar-footer"
  class={cn('border-t border-border px-4 py-3', className)}
  {...rest}
>
  <slot />
</footer>
