<svelte:options runes={true} />

<script lang="ts">
  import { tick, createEventDispatcher } from "svelte";
  import { X, Search } from "@lucide/svelte";
  import {
    commandPaletteStore,
    type CommandPaletteCommand,
    type CommandPaletteSection,
  } from "./commandPaletteStore";

  const dispatch = createEventDispatcher<{
    close: void;
    execute: { command: CommandPaletteCommand };
  }>();

  const { isOpen, query, filteredCommands, highlightedIndex } =
    commandPaletteStore;

  let searchInput = $state<HTMLInputElement | null>(null);
  let dialogElement = $state<HTMLDivElement | null>(null);

  let groupedCommands = $derived.by(() => {
    const commands = $filteredCommands;
    const groups: Array<{
      title: CommandPaletteSection;
      items: Array<{ command: CommandPaletteCommand; index: number }>;
    }> = [];
    const map = new Map<
      CommandPaletteSection,
      {
        title: CommandPaletteSection;
        items: Array<{ command: CommandPaletteCommand; index: number }>;
      }
    >();
    let index = 0;
    for (const command of commands) {
      let group = map.get(command.section);
      if (!group) {
        group = { title: command.section, items: [] };
        map.set(command.section, group);
        groups.push(group);
      }
      group.items.push({ command, index });
      index += 1;
    }
    return groups;
  });

  let activeDescendant = $derived.by(() => {
    const commands = $filteredCommands;
    const active = commands[$highlightedIndex];
    return active ? toDomId(active.id) : undefined;
  });

  $effect(() => {
    if ($isOpen) {
      tick().then(() => {
        searchInput?.focus();
        dialogElement?.setAttribute("aria-hidden", "false");
      });
    } else {
      dialogElement?.setAttribute("aria-hidden", "true");
    }
  });

  function toDomId(id: string) {
    return `command-option-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  }

  function closePalette() {
    commandPaletteStore.close();
    dispatch("close");
  }

  function executeCommand(command: CommandPaletteCommand | null) {
    if (!command) return;
    dispatch("execute", { command });
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      closePalette();
    }
  }

  function handleDialogKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      commandPaletteStore.moveSelection(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      commandPaletteStore.moveSelection(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const result = commandPaletteStore.executeHighlighted();
      executeCommand(result);
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      searchInput?.focus();
    }
  }

  function handleInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    commandPaletteStore.setQuery(target.value);
  }

  function handleClear() {
    if ($query.length === 0) {
      closePalette();
      return;
    }
    commandPaletteStore.setQuery("");
    searchInput?.focus();
  }

  function handleOptionClick(index: number) {
    const result = commandPaletteStore.executeAt(index);
    executeCommand(result);
  }

  function handleOptionMouseEnter(index: number) {
    commandPaletteStore.setHighlightedIndex(index);
  }
</script>

{#if $isOpen}
  <div
    class="fixed inset-0 z-[60] flex items-start justify-center bg-background/80 backdrop-blur-sm p-4"
    role="presentation"
    onclick={handleBackdropClick}
  >
    <div
      bind:this={dialogElement}
      role="dialog"
      aria-modal="true"
      aria-labelledby="command-palette-title"
      aria-describedby="command-palette-description"
      aria-hidden="true"
      class="w-full max-w-2xl rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
      tabindex="-1"
      onkeydown={handleDialogKeydown}
    >
      <div class="flex items-center border-b border-border px-4 py-3">
        <label
          class="flex flex-1 items-center gap-2"
          for="command-palette-search"
        >
          <Search class="size-4 text-muted-foreground" aria-hidden="true" />
          <span id="command-palette-title" class="sr-only">Command palette</span
          >
          <input
            bind:this={searchInput}
            id="command-palette-search"
            class="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            type="search"
            placeholder="Search commands"
            autocomplete="off"
            value={$query}
            oninput={handleInput}
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="command-palette-list"
            aria-activedescendant={activeDescendant}
          />
        </label>
        <button
          type="button"
          class="ml-2 inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={$query.length ? "Clear search" : "Close command palette"}
          onclick={handleClear}
        >
          <X class="size-4" aria-hidden="true" />
        </button>
      </div>
      <p id="command-palette-description" class="sr-only">
        Use arrow keys to navigate, Enter to execute, Escape to close.
      </p>
      {#if groupedCommands.length === 0}
        <div class="px-4 py-6 text-sm text-muted-foreground">
          No commands found.
        </div>
      {:else}
        <div class="max-h-[60vh] overflow-y-auto px-2 py-2" role="presentation">
          <ul
            id="command-palette-list"
            role="listbox"
            aria-labelledby="command-palette-title"
            class="flex flex-col gap-2"
          >
            {#each groupedCommands as group (group.title)}
              <li
                class="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {group.title}
              </li>
              {#each group.items as item (item.command.id)}
                <li>
                  <button
                    type="button"
                    id={toDomId(item.command.id)}
                    role="option"
                    aria-selected={item.index === $highlightedIndex}
                    data-active={item.index === $highlightedIndex
                      ? "true"
                      : undefined}
                    class="flex w-full flex-col items-start gap-1 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                    onclick={() => handleOptionClick(item.index)}
                    onmouseenter={() => handleOptionMouseEnter(item.index)}
                  >
                    <span class="font-medium">{item.command.label}</span>
                    {#if item.command.description}
                      <span class="text-xs text-muted-foreground">
                        {item.command.description}
                      </span>
                    {/if}
                  </button>
                </li>
              {/each}
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  </div>
{/if}
