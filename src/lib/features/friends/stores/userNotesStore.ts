import { persistentStore } from "$lib/stores/persistentStore";

const STORAGE_KEY = "user-notes";

export type UserNotes = Record<string, string>;

const backing = persistentStore<UserNotes>(STORAGE_KEY, {});

function setNote(userId: string, note: string) {
  if (!userId) {
    return;
  }

  backing.update((current) => {
    const next = { ...current };

    if (note.trim().length === 0) {
      if (userId in next) {
        delete next[userId];
        return next;
      }
      return current;
    }

    if (next[userId] === note) {
      return current;
    }

    next[userId] = note;
    return next;
  });
}

function clearNote(userId: string) {
  if (!userId) {
    return;
  }

  backing.update((current) => {
    if (!(userId in current)) {
      return current;
    }

    const { [userId]: _removed, ...rest } = current;
    return rest;
  });
}

export const userNotesStore = {
  subscribe: backing.subscribe,
  setNote,
  clearNote,
};
