import type { DirectMessageListEntry } from "$lib/features/chat/stores/directMessageRoster";

export interface SearchResults {
  dms: DirectMessageListEntry[];
  groups: DirectMessageListEntry[];
}

const isDirectMessage = (entry: DirectMessageListEntry) => entry.type === "dm";

const isGroupChat = (entry: DirectMessageListEntry) => entry.type === "group";

export function computeSearchResults(
  entries: DirectMessageListEntry[],
  searchTerm: string,
): SearchResults {
  const normalizedTerm = searchTerm.trim().toLowerCase();
  const source =
    normalizedTerm.length > 0
      ? entries.filter((entry) =>
          entry.name.toLowerCase().includes(normalizedTerm),
        )
      : entries;

  return {
    dms: source.filter(isDirectMessage),
    groups: source.filter(isGroupChat),
  };
}
