import { derived, writable } from "svelte/store";

export const topics = ["Home", "Gaming", "Science", "Arts", "Community"] as const;
export type DiscoverPanelTopic = (typeof topics)[number];

export const searchTerm = writable("");
export const activeTopic = writable<DiscoverPanelTopic>("Home");

export const normalizedSearch = derived(searchTerm, (value) =>
  value.trim().toLowerCase(),
);
