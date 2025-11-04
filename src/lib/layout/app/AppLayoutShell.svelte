<svelte:options runes={true} />

<script lang="ts">
  import InitialSetup from "$lib/features/auth/components/auth/InitialSetup.svelte";
  import AppModals from "$lib/layout/AppModals.svelte";
  import CommandPalette from "$lib/features/navigation/CommandPalette.svelte";
  import { theme } from "$lib/stores/theme";
  import { bindDocumentTheme } from "$lib/theme/bindDocumentTheme";
  import AppSidebarRegion from "./AppSidebarRegion.svelte";
  import AppMainContent from "./AppMainContent.svelte";
  import type { AppController } from "./types";

  let {
    controller,
    children,
  }: {
    controller: AppController;
    children: () => unknown;
  } = $props();

  const {
    modal: { activeModal, modalProps },
    allUsers,
    handlers,
    friendsLoading,
    shouldShowInitialSetup,
  } = controller;

  bindDocumentTheme(theme);
</script>

<svelte:window onkeydown={handlers.handleKeydown} />

<div
  class="flex h-screen bg-base-100 text-foreground"
  data-friends-loading={$friendsLoading ? "true" : undefined}
>
  {#if $shouldShowInitialSetup}
    <InitialSetup />
  {:else}
    <AppSidebarRegion {controller} />
    <AppMainContent {controller} {children} />
  {/if}
</div>

<AppModals
  activeModal={$activeModal}
  modalProps={$modalProps}
  allUsers={$allUsers}
  closeModal={handlers.closeModal}
/>

<CommandPalette on:close={handlers.closeCommandPalette} />
