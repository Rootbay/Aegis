<script lang="ts" generics="T">
  export let x = 0;
  export let y = 0;
  export let show = false;
  interface ContextMenuItem {
    label?: string;
    action?: string;
    isDestructive?: boolean;
    isSeparator?: boolean;
    data?: T;
  }

  export let menuItems: ContextMenuItem[] = [];
  export let onAction: (action: { action: string, itemData: T | null }) => void;
  export let onClose: () => void;

  function handleClickOutside(event?: Event) {
    if (event) {
      event.preventDefault();
    }
    show = false;
    onClose();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleClickOutside();
    }
  }

  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
  }

  function handleInnerClick(event: MouseEvent) {
    event.stopPropagation();
  }

  function handleInnerKeydown(event: KeyboardEvent) {
    event.stopPropagation();
  }

  function dispatchAction(action: string, itemData: T | null = null) {
    onAction({ action, itemData });
    onClose();
  }
</script>

{#if show}
  <div
    class="fixed inset-0 z-[10000]"
    onclick={handleClickOutside}
    oncontextmenu={handleClickOutside}
    onkeydown={handleKeydown}
    role="button"
    tabindex="-1"
  >
    <div
      class="absolute bg-gray-700 text-white rounded-lg shadow-lg p-2 z-[10001] border border-gray-600 w-[178px]"
      style="left: {x}px; top: {y}px;"
      onclick={handleInnerClick}
      oncontextmenu={handleContextMenu}
      onkeydown={handleInnerKeydown}
      role="menu"
      tabindex="0"
    >
      {#each menuItems as item, i (i)}
        {#if item.isSeparator}
          <div class="border-t border-gray-600 my-1"></div>
        {:else}
          <button
            class="block w-full text-left p-2 text-sm hover:bg-gray-600 cursor-pointer rounded-md"
            class:text-red-400={item.isDestructive}
            onclick={() => item.action && dispatchAction(item.action, item.data)}
          >
            {item.label || ''}
          </button>
        {/if}
      {/each}
    </div>
  </div>
{/if}
