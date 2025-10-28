import { browser } from "$app/environment";
import { get, writable, type Readable } from "svelte/store";
import { getInvoke, getListen, type InvokeFn } from "$lib/services/tauri";
import { serverStore } from "$lib/features/servers/stores/serverStore";
import type {
  CreateServerEventInput,
  ServerEvent,
  ServerEventStatus,
  UpdateServerEventInput,
} from "$lib/features/servers/models/ServerEvent";

interface ServerEventsState {
  events: ServerEvent[];
  loading: boolean;
  error: string | null;
  activeServerId: string | null;
  initialized: boolean;
}

type ServerEventBackend = {
  id: string;
  server_id: string;
  title: string;
  description?: string | null;
  channel_id?: string | null;
  scheduled_for: string;
  created_by: string;
  created_at: string;
  status: ServerEventStatus;
  cancelled_at?: string | null;
};

interface ServerEventsStore extends Readable<ServerEventsState> {
  initialize: () => Promise<void>;
  refresh: (serverId?: string | null) => Promise<void>;
  createEvent: (input: CreateServerEventInput) => Promise<ServerEvent | null>;
  updateEvent: (input: UpdateServerEventInput) => Promise<ServerEvent | null>;
  cancelEvent: (eventId: string) => Promise<ServerEvent | null>;
  teardown: () => void;
}

const initialState: ServerEventsState = {
  events: [],
  loading: false,
  error: null,
  activeServerId: null,
  initialized: false,
};

function mapBackendEvent(event: ServerEventBackend): ServerEvent {
  return {
    id: event.id,
    serverId: event.server_id,
    title: event.title,
    description: event.description ?? undefined,
    channelId: event.channel_id ?? undefined,
    scheduledFor: event.scheduled_for,
    createdBy: event.created_by,
    createdAt: event.created_at,
    status: event.status,
    cancelledAt: event.cancelled_at ?? undefined,
  };
}

function sortEvents(events: ServerEvent[]): ServerEvent[] {
  return [...events].sort((a, b) => {
    const aTime = Date.parse(a.scheduledFor);
    const bTime = Date.parse(b.scheduledFor);
    if (Number.isNaN(aTime) && Number.isNaN(bTime))
      return a.title.localeCompare(b.title);
    if (Number.isNaN(aTime)) return 1;
    if (Number.isNaN(bTime)) return -1;
    return aTime - bTime;
  });
}

function upsertEvent(
  existing: ServerEvent[],
  next: ServerEvent,
): ServerEvent[] {
  const filtered = existing.filter((event) => event.id !== next.id);
  return sortEvents([...filtered, next]);
}

function removeEvent(existing: ServerEvent[], eventId: string): ServerEvent[] {
  return existing.filter((event) => event.id !== eventId);
}

export function createServerEventsStore(): ServerEventsStore {
  const store = writable<ServerEventsState>(initialState);
  const { subscribe, update, set } = store;

  let invokeHandle: InvokeFn | null = null;
  let initializationPromise: Promise<void> | null = null;
  let eventListenerUnsubs: Array<() => void> = [];
  let serverStoreUnsubscribe: (() => void) | null = null;

  const ensureInvoke = async (): Promise<InvokeFn | null> => {
    if (invokeHandle) {
      return invokeHandle;
    }
    try {
      invokeHandle = await getInvoke();
    } catch (error) {
      console.warn("Failed to acquire Tauri invoke handle", error);
      invokeHandle = null;
    }
    return invokeHandle;
  };

  const handleBackendEvent = (payload: ServerEventBackend) => {
    if (!payload || !payload.server_id) {
      return;
    }
    const event = mapBackendEvent(payload);
    update((state) => {
      if (state.activeServerId !== event.serverId) {
        return state;
      }
      return {
        ...state,
        events: upsertEvent(state.events, event),
        error: null,
      };
    });
  };

  const handleBackendDeletion = (payload: {
    id: string;
    server_id: string;
  }) => {
    if (!payload?.id || !payload?.server_id) {
      return;
    }
    update((state) => {
      if (state.activeServerId !== payload.server_id) {
        return state;
      }
      return {
        ...state,
        events: removeEvent(state.events, payload.id),
      };
    });
  };

  const subscribeToBackendEvents = async () => {
    const listenFn = await getListen();
    if (!listenFn) {
      console.warn(
        "Tauri listen function unavailable; server events will not auto-refresh.",
      );
      return;
    }

    const listeners: Array<[string, (event: { payload: unknown }) => void]> = [
      [
        "server-event-created",
        ({ payload }) => {
          if (payload && typeof payload === "object") {
            handleBackendEvent(payload as ServerEventBackend);
          }
        },
      ],
      [
        "server-event-updated",
        ({ payload }) => {
          if (payload && typeof payload === "object") {
            handleBackendEvent(payload as ServerEventBackend);
          }
        },
      ],
      [
        "server-event-cancelled",
        ({ payload }) => {
          if (payload && typeof payload === "object") {
            handleBackendEvent(payload as ServerEventBackend);
          }
        },
      ],
      [
        "server-event-deleted",
        ({ payload }) => {
          if (payload && typeof payload === "object") {
            const data = payload as { id: string; server_id: string };
            handleBackendDeletion(data);
          }
        },
      ],
    ];

    for (const [eventName, handler] of listeners) {
      try {
        const unsubscribe = await listenFn(eventName, handler);
        eventListenerUnsubs.push(unsubscribe);
      } catch (error) {
        console.warn(`Failed to subscribe to ${eventName}`, error);
      }
    }
  };

  const watchActiveServer = () => {
    if (serverStoreUnsubscribe) {
      return;
    }
    serverStoreUnsubscribe = serverStore.subscribe((serverState) => {
      const nextActive = serverState.activeServerId ?? null;
      const currentState = get(store);

      if (nextActive && nextActive !== currentState.activeServerId) {
        void refresh(nextActive);
      } else if (!nextActive && currentState.activeServerId !== null) {
        set({
          ...currentState,
          activeServerId: null,
          events: [],
          loading: false,
        });
      }
    });
  };

  const refresh = async (serverId?: string | null) => {
    const targetServerId = serverId ?? get(store).activeServerId;
    if (!targetServerId) {
      update((state) => ({
        ...state,
        loading: false,
        error: null,
        events: serverId ? [] : state.events,
        activeServerId: serverId ?? state.activeServerId,
      }));
      return;
    }

    update((state) => ({
      ...state,
      loading: true,
      error: null,
      activeServerId: targetServerId,
    }));

    const invokeFn = await ensureInvoke();
    if (!invokeFn) {
      update((state) => ({
        ...state,
        loading: false,
        error: "Server events unavailable while offline.",
      }));
      return;
    }

    try {
      const response = await invokeFn<ServerEventBackend[]>(
        "list_server_events",
        {
          server_id: targetServerId,
        },
      );
      const events = Array.isArray(response)
        ? sortEvents(response.map((event) => mapBackendEvent(event)))
        : [];
      update((state) => ({
        ...state,
        events,
        loading: false,
        error: null,
        activeServerId: targetServerId,
      }));
    } catch (error) {
      console.error("Failed to load server events", error);
      update((state) => ({
        ...state,
        loading: false,
        error:
          error instanceof Error ? error.message : "Failed to load events.",
      }));
    }
  };

  const initialize = async () => {
    if (!browser) {
      return;
    }

    if (initializationPromise) {
      await initializationPromise;
      return;
    }

    initializationPromise = (async () => {
      await subscribeToBackendEvents();
      watchActiveServer();
      update((state) => ({ ...state, initialized: true }));
      const activeServerId = get(serverStore).activeServerId;
      if (activeServerId) {
        await refresh(activeServerId);
      }
    })()
      .catch((error) => {
        console.error("Failed to initialize server events store", error);
      })
      .finally(() => {
        initializationPromise = null;
      });

    await initializationPromise;
  };

  const createEvent = async (
    input: CreateServerEventInput,
  ): Promise<ServerEvent | null> => {
    const invokeFn = await ensureInvoke();
    if (!invokeFn) {
      return null;
    }

    try {
      const response = await invokeFn<ServerEventBackend>(
        "create_server_event",
        {
          server_id: input.serverId,
          title: input.title,
          description: input.description ?? null,
          channel_id: input.channelId ?? null,
          scheduled_for: input.scheduledFor,
        },
      );
      const event = mapBackendEvent(response);
      update((state) => {
        if (state.activeServerId !== event.serverId) {
          return state;
        }
        return {
          ...state,
          events: upsertEvent(state.events, event),
        };
      });
      return event;
    } catch (error) {
      console.error("Failed to create server event", error);
      return null;
    }
  };

  const updateEvent = async (
    input: UpdateServerEventInput,
  ): Promise<ServerEvent | null> => {
    const invokeFn = await ensureInvoke();
    if (!invokeFn) {
      return null;
    }

    const payload: Record<string, unknown> = {
      event_id: input.eventId,
    };
    if (input.title !== undefined) payload.title = input.title;
    if (input.description !== undefined)
      payload.description = input.description;
    if (input.channelId !== undefined) payload.channel_id = input.channelId;
    if (input.scheduledFor !== undefined)
      payload.scheduled_for = input.scheduledFor;

    try {
      const response = await invokeFn<ServerEventBackend>(
        "update_server_event",
        payload,
      );
      const event = mapBackendEvent(response);
      update((state) => {
        if (state.activeServerId !== event.serverId) {
          return state;
        }
        return {
          ...state,
          events: upsertEvent(state.events, event),
        };
      });
      return event;
    } catch (error) {
      console.error("Failed to update server event", error);
      return null;
    }
  };

  const cancelEvent = async (eventId: string): Promise<ServerEvent | null> => {
    const invokeFn = await ensureInvoke();
    if (!invokeFn) {
      return null;
    }

    try {
      const response = await invokeFn<ServerEventBackend>(
        "cancel_server_event",
        {
          event_id: eventId,
        },
      );
      const event = mapBackendEvent(response);
      update((state) => {
        if (state.activeServerId !== event.serverId) {
          return state;
        }
        return {
          ...state,
          events: upsertEvent(state.events, event),
        };
      });
      return event;
    } catch (error) {
      console.error("Failed to cancel server event", error);
      return null;
    }
  };

  const teardown = () => {
    for (const unsubscribe of eventListenerUnsubs) {
      try {
        unsubscribe();
      } catch (error) {
        console.warn("Failed to unsubscribe server events listener", error);
      }
    }
    eventListenerUnsubs = [];

    if (serverStoreUnsubscribe) {
      try {
        serverStoreUnsubscribe();
      } catch (error) {
        console.warn("Failed to unsubscribe server store listener", error);
      }
      serverStoreUnsubscribe = null;
    }

    invokeHandle = null;
    set(initialState);
  };

  return {
    subscribe,
    initialize,
    refresh,
    createEvent,
    updateEvent,
    cancelEvent,
    teardown,
  };
}

export const serverEventsStore = createServerEventsStore();
