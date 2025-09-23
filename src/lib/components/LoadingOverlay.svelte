<script lang="ts">
  let { show = false } = $props();
</script>

{#if show}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/80 backdrop-blur-sm"
  >
    <div
      class="h-16 w-16 animate-spin rounded-full border-4 border-zinc-700 border-t-primary"
    ></div>
  </div>
{/if}
