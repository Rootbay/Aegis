import type { Chat } from "../models/Chat";
import type { User } from "../../auth/models/User";

export function getTypingStatusLabel(
  chat: Chat | null,
  typingUserIds: string[],
  currentUser: User | null | undefined,
): string {
  if (!chat || typingUserIds.length === 0) {
    return "";
  }

  const lookup = new Map<string, string>();

  if (chat.type === "dm" && chat.friend) {
    lookup.set(chat.friend.id, chat.friend.name ?? chat.friend.id);
  }

  if ((chat.type === "group" || chat.type === "channel") && chat.members) {
    chat.members.forEach((member: User) => {
      lookup.set(member.id, member.name ?? member.id);
    });
  }

  if (currentUser) {
    lookup.set(currentUser.id, currentUser.name ?? currentUser.id);
  }

  const names = typingUserIds
    .map((id) => lookup.get(id) ?? "Someone")
    .filter((name, index, array) => array.indexOf(name) === index);

  if (names.length === 0) {
    return "";
  }
  if (names.length === 1) {
    return `${names[0]} is typing...`;
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]} are typing...`;
  }
  return `${names[0]}, ${names[1]}, and ${names.length - 2} others are typing...`;
}
