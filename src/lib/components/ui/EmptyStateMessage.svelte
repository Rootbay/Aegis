<svelte:options runes={true} />

<script lang="ts">
  let { activeTab } = $props<{ activeTab: string }>();
</script>

{#if activeTab === 'Pending'}
  <p class="text-muted-foreground text-center mt-8">No pending friend requests.</p>
{:else}
  <p class="text-muted-foreground text-center mt-8">No friends to display in this category.</p>
{/if}
