<svelte:options runes={true} />

<script lang="ts">
  import InitialSetup from "$lib/features/auth/components/auth/InitialSetup.svelte";
  import AppModals from "$lib/layout/AppModals.svelte";
  import CommandPalette from "$lib/features/navigation/CommandPalette.svelte";
  import { theme } from "$lib/stores/theme";
  import { applyDocumentTheme } from "$lib/theme/applyDocumentTheme";
  import AppSidebarRegion from "./AppSidebarRegion.svelte";
  import AppMainContent from "./AppMainContent.svelte";
  import type { AppController } from "./types";

  let {
    controller,
    friendsLoading,
    children,
  }: {
    controller: AppController;
    friendsLoading: () => boolean;
    children: () => unknown;
  } = $props();

  const { authState, currentUser, modal, allUsers, handlers } = controller;

  const showInitialSetup = $derived(
    $authState.status !== "authenticated" || !$currentUser,
  );

  $effect(() => {
    applyDocumentTheme($theme);
  });
</script>

<svelte:window onkeydown={handlers.handleKeydown} />

<div
  class="flex h-screen bg-base-100 text-foreground"
  data-friends-loading={friendsLoading() ? "true" : undefined}
>
  {#if showInitialSetup}
    <InitialSetup />
  {:else}
    <AppSidebarRegion {controller} />
    <AppMainContent {controller} {children} />
  {/if}
</div>

<AppModals
  activeModal={$modal.activeModal}
  modalProps={$modal.modalProps}
  allUsers={$allUsers}
  closeModal={handlers.closeModal}
/>

<CommandPalette on:close={handlers.closeCommandPalette} />
