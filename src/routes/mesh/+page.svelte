<svelte:options runes={true} />

<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";

  onMount(() => {
    void goto((resolve as any)("/settings/network#mesh-explorer"));
  });
</script>

<p class="px-6 py-8 text-sm text-muted-foreground">
  Redirecting to Mesh Explorer in Settings…
</p>
