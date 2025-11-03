<svelte:options runes={true} />

<script lang="ts">
  import "../app.css";
  import { getContext } from "svelte";
  import { createAppController } from "$lib/layout/createAppController";
  import AppLayoutShell from "$lib/layout/app/AppLayoutShell.svelte";
  import { FRIENDS_LAYOUT_DATA_CONTEXT_KEY } from "$lib/contextKeys";
  import type { FriendsLayoutContext } from "$lib/contextTypes";

  let { children } = $props();

  const controller = createAppController();
  const friendsLayoutContext = getContext<FriendsLayoutContext | undefined>(
    FRIENDS_LAYOUT_DATA_CONTEXT_KEY,
  );
  const friendsLoading = $derived(() => friendsLayoutContext?.loading ?? false);
</script>

<AppLayoutShell {controller} {friendsLoading} {children} />
