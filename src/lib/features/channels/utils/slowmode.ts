const DEFAULT_PRESETS = [
  0,
  5,
  10,
  15,
  30,
  60,
  120,
  300,
  600,
  900,
  1800,
  3600,
  7200,
  21600,
] as const;

export type SlowmodePreset = (typeof DEFAULT_PRESETS)[number] | number;

export const SLOWMODE_PRESETS: SlowmodePreset[] = [...DEFAULT_PRESETS];

export function formatSlowmodeDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "Off";
  }

  const rounded = Math.floor(seconds);
  if (rounded < 60) {
    return `${rounded} ${rounded === 1 ? "second" : "seconds"}`;
  }

  if (rounded < 3600) {
    const minutes = Math.floor(rounded / 60);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }

  const hours = Math.floor(rounded / 3600);
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

export function buildSlowmodeOptions(
  presets: SlowmodePreset[] = SLOWMODE_PRESETS,
): { value: number; label: string }[] {
  const seen = new Set<number>();
  const options: { value: number; label: string }[] = [];
  for (const value of presets) {
    const normalized = normalizeSlowmodeValue(value);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    options.push({
      value: normalized,
      label: formatSlowmodeDuration(normalized),
    });
  }
  options.sort((a, b) => a.value - b.value);
  return options;
}

export function normalizeSlowmodeValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }
  return 0;
}
