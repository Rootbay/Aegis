<script lang="ts">
  import { cn } from '$lib/utils';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  type ContentProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
    children?: Snippet;
  };

  let { class: className, children, ...rest }: ContentProps = $props();
</script>

<div
  data-slot="sidebar-content"
  class={cn('flex-1 overflow-hidden', className)}
  {...rest}
>
  {@render children?.()}
</div>
