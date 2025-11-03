import { derived, type Readable } from "svelte/store";
import { connectivityStore } from "$lib/stores/connectivityStore";
import { settings } from "$lib/features/settings/stores/settings";
import type { ConnectivityBindings } from "./types";
import type { ConnectivityState } from "$lib/stores/connectivityStore";

export function createConnectivityBindings(): ConnectivityBindings {
  const state: Readable<ConnectivityState> = {
    subscribe: connectivityStore.subscribe,
  };

  const statusMessage = connectivityStore.statusMessage;
  const fallbackMessage = connectivityStore.fallbackMessage;
  const showBridgePrompt = derived(
    [state, settings],
    ([connectivity, appSettings]) =>
      connectivity.bridgeSuggested && appSettings.enableBridgeMode === false,
  );

  return {
    state,
    statusMessage,
    fallbackMessage,
    showBridgePrompt,
  };
}
