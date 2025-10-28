<script lang="ts">
  import { onMount } from "svelte";
  import {
    createAppController,
    type AppController,
  } from "../createAppController";

  export let onReady: (controller: AppController) => void = () => {};

  const controller = createAppController();

  onMount(() => {
    onReady(controller);
  });
</script>
