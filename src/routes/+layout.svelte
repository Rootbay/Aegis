<svelte:options runes={true} />

<script lang="ts">
  import "../app.css";
  import { createAppController } from "$lib/layout/createAppController";
  import AppLayoutShell from "$lib/layout/app/AppLayoutShell.svelte";

  let { children } = $props();

  const controller = createAppController();
</script>

<AppLayoutShell {controller} {children} />
