export type TimestampInput = string | number | Date | null | undefined;

export interface FormatTimestampOptions {
  /**
   * Reference date used for relative calculations. Defaults to `new Date()`.
   */
  now?: Date;
  /**
   * Locale passed to the underlying Intl formatters.
   */
  locale?: string | string[];
  /**
   * Label to return when the timestamp is missing or invalid. Use `null` to
   * hide the label entirely.
   */
  fallback?: string | null;
}

const SECONDS_IN_MINUTE = 60;
const SECONDS_IN_HOUR = SECONDS_IN_MINUTE * 60;
const SECONDS_IN_DAY = SECONDS_IN_HOUR * 24;
const SECONDS_IN_WEEK = SECONDS_IN_DAY * 7;

export function formatTimestamp(
  timestamp: TimestampInput,
  options: FormatTimestampOptions = {},
): string | null {
  const { now = new Date(), locale, fallback = "Just now" } = options;

  if (timestamp == null) {
    return fallback;
  }

  const date =
    timestamp instanceof Date
      ? timestamp
      : typeof timestamp === "number" || typeof timestamp === "string"
        ? new Date(timestamp)
        : null;

  if (!date || Number.isNaN(date.getTime())) {
    return fallback;
  }

  const diffMs = date.getTime() - now.getTime();
  const diffSeconds = diffMs / 1000;
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 45) {
    return fallback;
  }

  const relativeFormatter = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
  });

  if (absSeconds < SECONDS_IN_HOUR) {
    const minutes = Math.round(diffSeconds / SECONDS_IN_MINUTE);
    return relativeFormatter.format(minutes, "minute");
  }

  if (absSeconds < SECONDS_IN_DAY) {
    const hours = Math.round(diffSeconds / SECONDS_IN_HOUR);
    return relativeFormatter.format(hours, "hour");
  }

  if (absSeconds < SECONDS_IN_WEEK) {
    const days = Math.round(diffSeconds / SECONDS_IN_DAY);
    return relativeFormatter.format(days, "day");
  }

  const weeks = Math.round(diffSeconds / SECONDS_IN_WEEK);
  if (absSeconds < SECONDS_IN_WEEK * 5) {
    return relativeFormatter.format(weeks, "week");
  }

  const includeYear = date.getFullYear() !== now.getFullYear();
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
  });

  return dateFormatter.format(date);
}
