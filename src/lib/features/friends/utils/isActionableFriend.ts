import type { Friend } from "$lib/features/friends/models/Friend";

const BLOCKING_RELATIONSHIP_STATUSES = new Set([
  "blocked",
  "blocked_by_a",
  "blocked_by_b",
]);

const NON_ACTIONABLE_FRIEND_STATUSES = new Set(["pending", "blocked"]);

const normalizeStatus = (value: string | undefined | null) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export function isActionableFriend(friend: Friend): boolean {
  const relationship = normalizeStatus(friend.relationshipStatus);
  if (
    relationship === "pending" ||
    BLOCKING_RELATIONSHIP_STATUSES.has(relationship)
  ) {
    return false;
  }

  const status = normalizeStatus(friend.status);
  if (NON_ACTIONABLE_FRIEND_STATUSES.has(status)) {
    return false;
  }

  return true;
}
