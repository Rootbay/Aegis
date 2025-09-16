<svelte:options runes={true} />

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  const props = $props<{
    x: number;
    y: number;
    onaction?: (detail: { action: string }) => void;
    onclose?: () => void;
  }>();

  let { x, y, onaction, onclose } = props;

  let contextMenuElement: HTMLElement;

  function handleAction(action: string) {
    onaction?.({ action });
  }

  function handleClickOutside(event: MouseEvent) {
    if (contextMenuElement && !contextMenuElement.contains(event.target as Node)) {
      onclose?.();
    }
  }

  function handleScroll() {
    onclose?.();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onclose?.();
    }
  }

  onMount(() => {
    setTimeout(() => {
      window.addEventListener('click', handleClickOutside);
      window.addEventListener('contextmenu', handleClickOutside);
    }, 0);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('click', handleClickOutside);
    window.removeEventListener('contextmenu', handleClickOutside);
    window.removeEventListener('scroll', handleScroll, true);
    window.removeEventListener('keydown', handleKeydown);
  });
</script>


<div
  class="absolute z-50 bg-card border border-zinc-700 rounded-md shadow-lg py-1 w-48 text-sm"
  style="left: {x}px; top: {y}px;"
  bind:this={contextMenuElement}
>
  <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('hide_muted_channels')}>Hide Muted Channels</button>
  <div class="border-t border-zinc-600 my-1"></div>
  <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('create_channel')}>Create Channel</button>
  <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('create_category')}>Create Category</button>
  <button class="w-full text-left px-4 py-2 hover:bg-zinc-600" onclick={() => handleAction('invite_people')}>Invite People</button>
</div>




