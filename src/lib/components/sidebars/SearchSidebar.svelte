<script lang="ts">
  import { ArrowDown, ArrowUp, Search as SearchIcon, X } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import {
    Sidebar,
    SidebarHeader,
    SidebarContent,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
  } from "$lib/components/ui/sidebar";
  import { chatSearchStore } from "$lib/features/chat/stores/chatSearchStore";

  function handlePrev() {
    chatSearchStore.jumpToMatch(false);
  }

  function handleNext() {
    chatSearchStore.jumpToMatch(true);
  }

  function clearSearch() {
    chatSearchStore.clearSearch();
  }
</script>

<Sidebar class="hidden lg:flex" aria-label="Search results">
  <SidebarHeader class="px-4 py-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <SearchIcon class="h-4 w-4 text-muted-foreground" />
        <h2 class="text-sm font-semibold text-foreground">Search</h2>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="h-7 w-7 text-muted-foreground hover:text-foreground"
        onclick={clearSearch}
        aria-label="Clear search"
      >
        <X class="h-4 w-4" />
      </Button>
    </div>
  </SidebarHeader>
  <SidebarContent class="flex">
    <ScrollArea class="h-full w-full">
      {#if !$chatSearchStore.query}
        <div
          class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground"
        >
          <SearchIcon class="h-10 w-10 text-muted-foreground/60" />
          <div>
            <p class="font-medium text-foreground">Start typing to search</p>
            <p>Use the filters to narrow results quickly.</p>
          </div>
        </div>
      {:else if !$chatSearchStore.matches.length}
        <div
          class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground"
        >
          <SearchIcon class="h-10 w-10 text-muted-foreground/60" />
          <div>
            <p class="font-medium text-foreground">No results found</p>
            <p>Try adjusting your filters for "{$chatSearchStore.query}".</p>
          </div>
        </div>
      {:else}
        <div class="flex flex-col gap-4 p-4">
          <SidebarGroup class="space-y-3">
            <SidebarGroupLabel class="flex items-center justify-between">
              <span
                class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >Matches</span
              >
              <span class="text-xs font-semibold text-foreground">
                {$chatSearchStore.activeMatchIndex + 1} / {$chatSearchStore
                  .matches.length}
              </span>
            </SidebarGroupLabel>
            <SidebarGroupContent class="space-y-3">
              <div class="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="h-8"
                  onclick={handlePrev}
                >
                  <ArrowUp class="mr-1 h-3.5 w-3.5" /> Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="h-8"
                  onclick={handleNext}
                >
                  Next <ArrowDown class="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
              <p class="text-xs text-muted-foreground">
                Use these controls to jump between matches in the conversation.
              </p>
            </SidebarGroupContent>
          </SidebarGroup>
        </div>
      {/if}
    </ScrollArea>
  </SidebarContent>
</Sidebar>
