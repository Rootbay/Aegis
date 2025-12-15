<svelte:options runes={true} />

<script module lang="ts">
  export type ContextMenuItemConfig<TData> = {
    label?: string;
    action?: string;
    isDestructive?: boolean;
    isSeparator?: boolean;
    disabled?: boolean;
    data?: TData | null;
    closeOnSelect?: boolean;
  };

  // eslint-disable-next-line no-unused-vars
  export type ContextMenuHandler<TData> = (detail: {
    action: string;
    itemData: TData | null;
  }) => void;
</script>

<script lang="ts" generics="T">
  let {
    x = 0,
    y = 0,
    show = $bindable(false),
    menuItems = [],
    onaction,
    onclose,
    menuWidth = 220,
  }: {
    x?: number;
    y?: number;
    show?: boolean;
    menuItems?: ContextMenuItemConfig<T>[];
    onaction?: ContextMenuHandler<T>;
    onclose?: () => void;
    menuWidth?: number;
  } = $props();

  let open = $state(show);
  let prevOpen = $state(show);

  function closeMenu() {
    if (!open) return;
    open = false;
    show = false;
    onclose?.();
  }

  $effect(() => {
    if (show !== open) {
      open = show;
    }
  });

  $effect(() => {
    if (open === prevOpen) return;

    if (!open && prevOpen) {
      onclose?.();
    }

    prevOpen = open;
  });

  function handleSelect(item: ContextMenuItemConfig<T>) {
    if (item.disabled || !item.action) return;
    onaction?.({ action: item.action, itemData: item.data ?? null });
    if (item.closeOnSelect ?? true) {
      closeMenu();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    }
  }

  function handleOverlayContextMenu(event: MouseEvent) {
    event.preventDefault();
    closeMenu();
  }

  function preventContextMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function stopPropagation(event: Event) {
    event.stopPropagation();
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-10000"
    role="presentation"
    tabindex="-1"
    onclick={closeMenu}
    oncontextmenu={handleOverlayContextMenu}
    onkeydown={handleKeydown}
  >
      <div
        tabindex="0"
        class="fixed bg-popover border border-border shadow-lg rounded-md overflow-hidden p-2"
        role="menu"
        style={`left: ${x}px; top: ${y}px; width: ${menuWidth}px; min-width: ${menuWidth}px;`}
        onclick={stopPropagation}
      onkeydown={handleKeydown}
      oncontextmenu={preventContextMenu}
    >
      {#each menuItems as item, index (index)}
        {#if item.isSeparator}
          <div class="h-px bg-border my-1" ></div>
        {:else}
            <button
              type="button"
              class={`w-full px-3 py-1.5 text-sm text-left outline-none transition-colors cursor-pointer rounded-sm ${item.isDestructive ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-muted/50"}`}
              disabled={item.disabled}
              onclick={() => handleSelect(item)}
            >
            {item.label ?? ""}
          </button>
        {/if}
      {/each}
    </div>
  </div>
{/if}
