export const FRIENDS_NAVIGATION_TABS = [
  "All",
  "Online",
  "Blocked",
  "Pending",
] as const;

export type FriendsNavigationTab = (typeof FRIENDS_NAVIGATION_TABS)[number];
