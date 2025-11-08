<svelte:options runes={true} />

<script lang="ts">
  import {
    Sidebar,
  } from "$lib/components/ui/sidebar";
  import type { Chat } from "$lib/features/chat/models/Chat";
  import SearchResultsPanel from "./SearchResultsPanel.svelte";

  let { chat } = $props<{ chat: Chat | null }>();
</script>

<Sidebar class="hidden lg:flex" aria-label="Search results">
  <SearchResultsPanel {chat} variant="sidebar" class="flex-1" />
</Sidebar>
