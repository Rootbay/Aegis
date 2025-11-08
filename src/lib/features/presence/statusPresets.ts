export const PRESENCE_STATUS_OPTIONS = [
  { key: "available", label: "I'm available" },
  { key: "safe", label: "I'm safe" },
  { key: "rendezvous", label: "Heading to the rendezvous" },
] as const;

export type PresenceStatusKey =
  (typeof PRESENCE_STATUS_OPTIONS)[number]["key"];

const PRESENCE_STATUS_LABEL_LOOKUP = new Map<PresenceStatusKey, string>(
  PRESENCE_STATUS_OPTIONS.map((option) => [option.key, option.label]),
);

export const DEFAULT_PRESENCE_STATUS_KEY: PresenceStatusKey =
  PRESENCE_STATUS_OPTIONS[0].key;

export function isPresenceStatusKey(value: unknown): value is PresenceStatusKey {
  return typeof value === "string" && PRESENCE_STATUS_LABEL_LOOKUP.has(value as PresenceStatusKey);
}

export function resolvePresenceStatusLabel(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const preset = PRESENCE_STATUS_LABEL_LOOKUP.get(trimmed as PresenceStatusKey);
  return preset ?? trimmed;
}
