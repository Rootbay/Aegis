<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { toasts } from "$lib/stores/ToastStore";
  import { setContext } from "svelte";
  import { SERVER_LAYOUT_DATA_CONTEXT_KEY } from "$lib/contextKeys";
  import type { ServerLayoutContext } from "$lib/contextTypes";
  import { createServerLayoutController } from "$lib/layout/server/createServerLayoutController";

  let { children } = $props();

  const controller = createServerLayoutController({
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    navigate: (value) => goto(value),
    notifyError: (message) => toasts.addToast(message, "error"),
  });

  setContext<ServerLayoutContext>(
    SERVER_LAYOUT_DATA_CONTEXT_KEY,
    controller.context,
  );

  const serverIdStore = controller.serverId;

  $effect(() => {
    const activeServerId = page.params.serverId ?? null;
    if (activeServerId === $serverIdStore) {
      return;
    }
    controller.setActiveServerId(activeServerId);
  });
</script>

{@render children()}