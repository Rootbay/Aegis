import { describe, expect, it } from "vitest";
import { formatTimestamp } from "../time";

describe("formatTimestamp", () => {
  const reference = new Date("2024-01-01T12:00:00Z");
  const locale = "en";

  it("returns fallback when timestamp is missing", () => {
    expect(formatTimestamp(undefined, { now: reference, locale })).toBe("Just now");
  });

  it("returns null when fallback is explicitly null", () => {
    expect(formatTimestamp(undefined, { now: reference, fallback: null, locale })).toBe(
      null,
    );
  });

  it("formats values within an hour as relative minutes", () => {
    const oneMinuteAgo = new Date(reference.getTime() - 60_000);
    expect(formatTimestamp(oneMinuteAgo, { now: reference, locale })).toBe("1 minute ago");
  });

  it("formats values within a day as relative hours", () => {
    const twoHoursAhead = new Date(reference.getTime() + 2 * 60 * 60 * 1000);
    expect(formatTimestamp(twoHoursAhead, { now: reference, locale })).toBe("in 2 hours");
  });

  it("formats values older than five weeks as a calendar date", () => {
    const pastDate = new Date("2023-10-15T09:30:00Z");
    expect(formatTimestamp(pastDate, { now: reference, locale })).toBe("Oct 15, 2023, 9:30 AM");
  });

  it("falls back to the provided label when the timestamp is invalid", () => {
    expect(
      formatTimestamp("not-a-date", { now: reference, locale, fallback: "N/A" }),
    ).toBe("N/A");
  });
});
