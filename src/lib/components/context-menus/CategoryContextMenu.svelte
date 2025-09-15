<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let x: number;
  export let y: number;
  export let categoryId: string;
  export let onAction: (action: { action: string, categoryId: string }) => void;
  export let onClose: () => void;

  let contextMenuElement: HTMLElement;

  function handleAction(action: string) {
    onAction({ action, categoryId });
  }

  function handleClickOutside(event: MouseEvent) {
    if (contextMenuElement && !contextMenuElement.contains(event.target as Node)) {
      onClose();
    }
  }

  onMount(() => {
    setTimeout(() => {
      window.addEventListener('click', handleClickOutside);
      window.addEventListener('contextmenu', handleClickOutside);
    }, 0);
  });

  onDestroy(() => {
    window.removeEventListener('click', handleClickOutside);
    window.removeEventListener('contextmenu', handleClickOutside);
  });
</script>

<div
  class="fixed bg-card border border-zinc-700 rounded-md shadow-lg z-50 text-white text-sm"
  style="left: {x}px; top: {y}px;"
  bind:this={contextMenuElement}
>
  <button class="w-full text-left px-3 py-2 hover:bg-zinc-700" onclick={() => handleAction('collapse_category')}>Collapse Category</button>
  <button class="w-full text-left px-3 py-2 hover:bg-zinc-700" onclick={() => handleAction('collapse_all')}>Collapse All Categories</button>
  <div class="border-t border-zinc-700 my-1"></div>
  <button class="w-full text-left px-3 py-2 hover:bg-zinc-700" onclick={() => handleAction('mute_category')}>Mute Category</button>
  <button class="w-full text-left px-3 py-2 hover:bg-zinc-700" onclick={() => handleAction('notification_settings')}>Notification Settings</button>
  <div class="border-t border-zinc-700 my-1"></div>
  <button class="w-full text-left px-3 py-2 hover:bg-zinc-700" onclick={() => handleAction('edit_category')}>Edit Category</button>
  <button class="w-full text-left px-3 py-2 text-red-400 hover:bg-red-500/20" onclick={() => handleAction('delete_category')}>Delete Category</button>
  <div class="border-t border-zinc-700 my-1"></div>
  <button class="w-full text-left px-3 py-2 hover:bg-zinc-700" onclick={() => handleAction('copy_id')}>Copy Category ID</button>
</div>
