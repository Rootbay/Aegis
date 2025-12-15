<svelte:options runes={true} />

<script lang="ts">
  import { createEventDispatcher, onDestroy } from "svelte";

  const dispatch = createEventDispatcher();

  let {
    menuItems = [],
    show = false,
    onaction,
  }: {
    menuItems?: Array<{
      action?: string;
      label?: string;
      isSeparator?: boolean;
      data?: unknown;
    }>;
    show?: boolean;
    onaction?: (detail: { action?: string; itemData?: unknown }) => void;
  } = $props();
  type ContextMenuEntry = {
    trigger: (action: string) => void;
    hasAction: (action: string) => boolean;
  };

  const registryKey = "__contextMenuRegistry";
  const registry: ContextMenuEntry[] =
    (globalThis as any)[registryKey] ?? ((globalThis as any)[registryKey] = []);

  const entry: ContextMenuEntry = {
    trigger(action: string) {
      const target = menuItems.find((item) => item?.action === action);
      if (!target) return;
      const detail = { action: target.action, itemData: target.data };
      dispatch("action", detail);
      onaction?.(detail);
      console.log(detail);
    },
    hasAction(action: string) {
      return menuItems.some((item) => item?.action === action);
    },
  };

  registry.push(entry);

  onDestroy(() => {
    const index = registry.indexOf(entry);
    if (index >= 0) {
      registry.splice(index, 1);
    }
  });
</script>

{#if show}
  <div data-testid="context-menu-stub">
    {#each menuItems as item, index (item.action ?? item.label ?? index)}
      {#if item?.isSeparator}
        <div data-testid="context-menu-separator"></div>
      {:else}
        <button
          type="button"
          data-testid={`context-action-${item?.action ?? index}`}
          onclick={() => entry.trigger(item?.action ?? "")}
        >
          {item?.label}
        </button>
      {/if}
    {/each}
  </div>
{/if}
