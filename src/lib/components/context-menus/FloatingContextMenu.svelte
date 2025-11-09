<svelte:options runes={true} />

<script lang="ts" generics="T">
  import {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
  } from "$lib/components/ui/context-menu";

  type ContextMenuItemConfig<TData> = {
    label?: string;
    action?: string;
    isDestructive?: boolean;
    isSeparator?: boolean;
    disabled?: boolean;
    data?: TData | null;
  };

  type ContextMenuHandler<TData> = ({
    action,
    itemData,
  }: {
    action: string;
    itemData: TData | null;
  }) => void;

  let {
    x = 0,
    y = 0,
    show = $bindable(false),
    menuItems = [],
    onaction,
    onclose,
  }: {
    x?: number;
    y?: number;
    show?: boolean;
    menuItems?: ContextMenuItemConfig<T>[];
    onaction?: ContextMenuHandler<T>;
    onclose?: () => void;
  } = $props();

  let open = $state(show);
  let prevOpen = $state(show);
  let contentRef = $state<HTMLElement | null>(null);

  $effect(() => {
    if (show !== open) {
      open = show;
    }
  });

  $effect(() => {
    if (open === prevOpen) return;

    if (!open && prevOpen) {
      show = false;
      onclose?.();
    }

    if (open && !prevOpen) {
      show = true;
    }

    prevOpen = open;
  });

  function closeMenu() {
    open = false;
  }

  function handleSelect(item: ContextMenuItemConfig<T>) {
    if (item.disabled || !item.action) return;
    onaction?.({ action: item.action, itemData: item.data ?? null });
    closeMenu();
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

  function updatePosition() {
    if (!contentRef || typeof window === "undefined") return;

    const { innerWidth, innerHeight } = window;
    const rect = contentRef.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(x, innerWidth - rect.width - 4));
    const offsetY = Math.max(0, Math.min(y, innerHeight - rect.height - 4));

    contentRef.style.left = `${offsetX}px`;
    contentRef.style.top = `${offsetY}px`;
  }

  $effect(() => {
    updatePosition();
  });
</script>

<svelte:window on:resize={updatePosition} />

{#if open}
  <div
    class="fixed inset-0 z-[10000]"
    role="presentation"
    tabindex="-1"
    onclick={closeMenu}
    oncontextmenu={handleOverlayContextMenu}
    onkeydown={handleKeydown}
  >
    <ContextMenu bind:open>
      <ContextMenuTrigger style="display: none" />
      <ContextMenuContent
        bind:ref={contentRef}
        portalProps={{ disabled: true }}
        class="w-44"
        style={`position: fixed; left: ${x}px; top: ${y}px;`}
        onclick={stopPropagation}
        onkeydown={handleKeydown}
        oncontextmenu={preventContextMenu}
      >
        {#each menuItems as item, index (index)}
          {#if item.isSeparator}
            <ContextMenuSeparator />
          {:else}
            <ContextMenuItem
              variant={item.isDestructive ? "destructive" : "default"}
              disabled={item.disabled}
              onselect={() => handleSelect(item)}
            >
              {item.label ?? ""}
            </ContextMenuItem>
          {/if}
        {/each}
      </ContextMenuContent>
    </ContextMenu>
  </div>
{/if}
