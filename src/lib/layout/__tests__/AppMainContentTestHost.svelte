<script lang="ts">
  import { onMount } from "svelte";
  import AppMainContent from "../app/AppMainContent.svelte";
  import {
    createAppController,
    type AppController,
  } from "../createAppController";

  export let onReady: (controller: AppController) => void = (_controller) => {};

  const controller = createAppController();

  onMount(() => {
    onReady(controller);
  });
</script>

<AppMainContent {controller} />
