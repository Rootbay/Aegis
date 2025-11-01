import { derived, get, writable, type Readable } from "svelte/store";
import * as Y from "yjs";
import { getInvoke } from "$lib/services/tauri";
import type { InvokeFn } from "$lib/services/tauri";
import { userStore } from "$lib/stores/userStore";

type CollaborationSessionKind = "document" | "whiteboard";

export type { CollaborationSessionKind };

export interface CollaborationParticipant {
  id: string;
  displayName?: string;
  avatarUrl?: string;
  lastActiveAt: number;
}

export interface CollaborationUpdatePayload {
  documentId: string;
  update: number[];
  kind: CollaborationSessionKind;
  senderId?: string;
  participants?: string[];
  timestamp?: string;
}

export interface CollaborationSessionView {
  documentId: string;
  kind: CollaborationSessionKind;
  content: Readable<string>;
  participants: Readable<CollaborationParticipant[]>;
  isConnected: Readable<boolean>;
  doc: Y.Doc;
  updateContent: (value: string) => void;
  annotateParticipant: (participant: CollaborationParticipant) => void;
}

interface InternalSession {
  documentId: string;
  kind: CollaborationSessionKind;
  doc: Y.Doc;
  text: Y.Text;
  contentStore: ReturnType<typeof writable<string>>;
  participantsStore: ReturnType<
    typeof writable<Map<string, CollaborationParticipant>>
  >;
  connectedStore: ReturnType<typeof writable<boolean>>;
  cleanup: () => void;
  view: CollaborationSessionView;
  applyRemoteUpdate: (payload: CollaborationUpdatePayload) => void;
  setParticipants: (ids: Iterable<string>) => void;
  updateContent: (value: string) => void;
  annotateParticipant: (participant: CollaborationParticipant) => void;
}

interface StartSessionOptions {
  initialContent?: string;
  kind?: CollaborationSessionKind;
  participants?: CollaborationParticipant[];
}

const invokeCache: {
  current: InvokeFn | null;
  inflight: Promise<InvokeFn | null> | null;
} = {
  current: null,
  inflight: null,
};

async function resolveInvoke(): Promise<InvokeFn | null> {
  if (invokeCache.current) {
    return invokeCache.current;
  }

  if (!invokeCache.inflight) {
    invokeCache.inflight = getInvoke().then((result) => {
      invokeCache.current = result;
      invokeCache.inflight = null;
      return result;
    });
  }

  return invokeCache.inflight;
}

function toUint8Array(data: number[]): Uint8Array {
  return Uint8Array.from(data);
}

async function broadcastUpdate(
  documentId: string,
  kind: CollaborationSessionKind,
  update: Uint8Array,
  participants: string[],
): Promise<void> {
  const invoker = await resolveInvoke();
  if (!invoker) {
    return;
  }

  try {
    await invoker("send_collaboration_update", {
      documentId,
      kind,
      update: Array.from(update),
      participants,
    });
  } catch (error) {
    console.error("Failed to broadcast collaboration update", error);
  }
}

function getLocalParticipant(): CollaborationParticipant | null {
  const me = get(userStore).me;
  if (!me) return null;
  return {
    id: me.id,
    displayName: me.name,
    avatarUrl: me.avatar,
    lastActiveAt: Date.now(),
  };
}

function createInternalSession(
  documentId: string,
  kind: CollaborationSessionKind,
  options: StartSessionOptions = {},
): InternalSession {
  const doc = new Y.Doc();
  const text = doc.getText("content");
  const contentStore = writable("");
  const participantsStore = writable<Map<string, CollaborationParticipant>>(
    new Map(),
  );
  const connectedStore = writable(false);
  const localParticipant = getLocalParticipant();

  const applyInitialContent = (initialContent: string) => {
    doc.transact(() => {
      if (text.length > 0) {
        text.delete(0, text.length);
      }
      if (initialContent.length > 0) {
        text.insert(0, initialContent);
      }
    }, "bootstrap");
  };

  if (options.initialContent) {
    applyInitialContent(options.initialContent);
  }

  if (options.participants?.length) {
    participantsStore.set(
      options.participants.reduce((map, participant) => {
        const next = new Map(map);
        next.set(participant.id, participant);
        return next;
      }, new Map<string, CollaborationParticipant>()),
    );
  }

  if (localParticipant) {
    participantsStore.update((current) => {
      const next = new Map(current);
      next.set(localParticipant.id, localParticipant);
      return next;
    });
  }

  const updateContentStore = () => {
    contentStore.set(text.toString());
  };

  updateContentStore();

  const textObserver = () => {
    updateContentStore();
  };
  text.observe(textObserver);

  const updateListener = (update: Uint8Array, origin: unknown) => {
    if (origin === "remote" || origin === "bootstrap") {
      connectedStore.set(true);
      return;
    }

    connectedStore.set(true);
    const participantIds = Array.from(
      new Set(
        Array.from(get(participantsStore).keys()).concat(
          localParticipant ? [localParticipant.id] : [],
        ),
      ),
    );
    void broadcastUpdate(documentId, kind, update, participantIds);
  };

  doc.on("update", updateListener);

  const setParticipants = (ids: Iterable<string>) => {
    const now = Date.now();
    participantsStore.update((current) => {
      const next = new Map<string, CollaborationParticipant>();
      for (const id of ids) {
        const existing = current.get(id);
        next.set(id, {
          id,
          displayName: existing?.displayName,
          avatarUrl: existing?.avatarUrl,
          lastActiveAt: now,
        });
      }
      if (localParticipant) {
        const fromStore = next.get(localParticipant.id) ?? localParticipant;
        next.set(localParticipant.id, {
          ...fromStore,
          lastActiveAt: now,
        });
      }
      return next;
    });
  };

  const updateContent = (value: string) => {
    doc.transact(() => {
      if (text.length > 0) {
        text.delete(0, text.length);
      }
      if (value.length > 0) {
        text.insert(0, value);
      }
    }, "local");
  };

  const applyRemoteUpdate = (payload: CollaborationUpdatePayload) => {
    if (payload.participants) {
      setParticipants(payload.participants);
    }
    if (payload.update.length === 0) {
      return;
    }
    try {
      Y.applyUpdate(doc, toUint8Array(payload.update), "remote");
      connectedStore.set(true);
    } catch (error) {
      console.error("Failed to apply collaboration update", error);
    }
  };

  const annotateParticipant = (participant: CollaborationParticipant) => {
    participantsStore.update((current) => {
      const next = new Map(current);
      const existing = next.get(participant.id);
      next.set(participant.id, {
        id: participant.id,
        displayName: participant.displayName ?? existing?.displayName,
        avatarUrl: participant.avatarUrl ?? existing?.avatarUrl,
        lastActiveAt:
          participant.lastActiveAt ?? existing?.lastActiveAt ?? Date.now(),
      });
      return next;
    });
  };

  const participantsArray = derived(participantsStore, (map) => {
    return Array.from(map.values()).sort(
      (a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0),
    );
  });

  const view: CollaborationSessionView = {
    documentId,
    kind,
    content: { subscribe: contentStore.subscribe },
    participants: { subscribe: participantsArray.subscribe },
    isConnected: { subscribe: connectedStore.subscribe },
    doc,
    updateContent,
    annotateParticipant,
  };

  const cleanup = () => {
    doc.off("update", updateListener);
    text.unobserve(textObserver);
    doc.destroy();
  };

  const internalSession: InternalSession = {
    documentId,
    kind,
    doc,
    text,
    contentStore,
    participantsStore,
    connectedStore,
    cleanup,
    view,
    applyRemoteUpdate,
    setParticipants,
    updateContent,
    annotateParticipant,
  };

  return internalSession;
}

type SessionRecord = ReturnType<typeof createInternalSession>;

function createCollaborationStore() {
  const sessions = writable<Map<string, SessionRecord>>(new Map());
  const activeSessionId = writable<string | null>(null);

  const ensureSession = (
    documentId: string,
    kind: CollaborationSessionKind,
    options: StartSessionOptions = {},
  ): SessionRecord => {
    let existing: SessionRecord | undefined;
    sessions.update((current) => {
      const next = new Map(current);
      existing = next.get(documentId);
      if (!existing) {
        const created = createInternalSession(documentId, kind, options);
        next.set(documentId, created);
        existing = created;
      }
      return next;
    });
    if (!existing) {
      throw new Error("Failed to create collaboration session");
    }
    return existing;
  };

  const openSession = (
    documentId: string,
    options: StartSessionOptions & { kind?: CollaborationSessionKind } = {},
  ): CollaborationSessionView => {
    const kind = options.kind ?? "document";
    const session = ensureSession(documentId, kind, options);
    activeSessionId.set(documentId);
    return session.view;
  };

  const closeSession = (documentId: string) => {
    sessions.update((current) => {
      const next = new Map(current);
      const target = next.get(documentId);
      if (target) {
        target.cleanup();
        next.delete(documentId);
      }
      return next;
    });
    activeSessionId.update((current) =>
      current === documentId ? null : current,
    );
  };

  const receiveRemoteUpdate = (payload: CollaborationUpdatePayload) => {
    const { documentId, kind } = payload;
    const session = ensureSession(
      documentId,
      payload.kind ?? kind ?? "document",
      {},
    );
    session.applyRemoteUpdate(payload);
  };

  const updateParticipants = (
    documentId: string,
    participants: Iterable<string>,
  ) => {
    sessions.update((current) => {
      const next = new Map(current);
      const target = next.get(documentId);
      if (target && "setParticipants" in target) {
        (
          target as SessionRecord & {
            setParticipants: (ids: Iterable<string>) => void;
          }
        ).setParticipants(participants);
      }
      return next;
    });
  };

  const annotateParticipant = (
    documentId: string,
    participant: CollaborationParticipant,
  ) => {
    sessions.update((current) => {
      const next = new Map(current);
      const target = next.get(documentId);
      if (target && "annotateParticipant" in target) {
        (
          target as SessionRecord & {
            annotateParticipant: (
              participant: CollaborationParticipant,
            ) => void;
          }
        ).annotateParticipant(participant);
      }
      return next;
    });
  };

  const sessionsView = derived(sessions, (map) => {
    const next = new Map<string, CollaborationSessionView>();
    for (const [id, session] of map.entries()) {
      next.set(id, session.view);
    }
    return next;
  });

  const activeSession = derived(
    [sessionsView, activeSessionId],
    ([map, activeId]) => {
      if (!activeId) return null;
      return map.get(activeId) ?? null;
    },
  );

  return {
    sessions: { subscribe: sessionsView.subscribe } as Readable<
      Map<string, CollaborationSessionView>
    >,
    activeSessionId: { subscribe: activeSessionId.subscribe },
    activeSession,
    openSession,
    closeSession,
    receiveRemoteUpdate,
    updateParticipants,
    annotateParticipant,
  };
}

export const collaborationStore = createCollaborationStore();

export function generateCollaborationDocumentId(prefix = "collab") {
  const sanitizedPrefix =
    prefix
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "")
      .trim() || "collab";
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${sanitizedPrefix}-${crypto.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `${sanitizedPrefix}-${random}`;
}
