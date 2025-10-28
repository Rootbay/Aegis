import { get, writable, type Readable } from "svelte/store";
import { serverStore } from "$lib/features/servers/stores/serverStore";
import type { Webhook } from "$lib/features/servers/models/Webhook";
import {
  webhookService,
  type WebhookService,
} from "$lib/features/servers/services/webhookService";

interface ServerWebhooksState {
  webhooks: Webhook[];
  loading: boolean;
  error: string | null;
  initialized: boolean;
  activeServerId: string | null;
}

export interface ServerWebhooksStore extends Readable<ServerWebhooksState> {
  initialize: () => Promise<void>;
  refresh: (serverId?: string | null) => Promise<void>;
  createWebhook: (input: {
    name: string;
    url: string;
    channelId?: string;
    serverId?: string;
  }) => Promise<Webhook | null>;
  updateWebhook: (
    webhookId: string,
    patch: { name?: string; url?: string; channelId?: string | null },
    serverId?: string,
  ) => Promise<Webhook | null>;
  deleteWebhook: (webhookId: string, serverId?: string) => Promise<boolean>;
  teardown: () => void;
}

const initialState: ServerWebhooksState = {
  webhooks: [],
  loading: false,
  error: null,
  initialized: false,
  activeServerId: null,
};

function sortWebhooks(webhooks: Webhook[]): Webhook[] {
  return [...webhooks].sort((a, b) => a.name.localeCompare(b.name));
}

export function createServerWebhooksStore(
  service: WebhookService = webhookService,
): ServerWebhooksStore {
  const store = writable<ServerWebhooksState>({ ...initialState });
  const { subscribe, update, set } = store;

  let initializationPromise: Promise<void> | null = null;
  let serverStoreUnsubscribe: (() => void) | null = null;

  const getActiveServerId = () => get(store).activeServerId;

  const refreshStateForServer = async (serverId: string) => {
    update((state) => ({
      ...state,
      loading: true,
      error: null,
    }));

    const result = await service.fetchWebhooks(serverId);
    if (!result.success) {
      update((state) => {
        if (state.activeServerId !== serverId) {
          return state;
        }
        return {
          ...state,
          loading: false,
          error: result.error,
        };
      });
      return;
    }

    update((state) => {
      if (state.activeServerId !== serverId) {
        return state;
      }
      return {
        ...state,
        loading: false,
        error: null,
        webhooks: sortWebhooks(result.data),
      };
    });
  };

  const handleServerUpdate = (value: { activeServerId: string | null }) => {
    const nextId = value.activeServerId ?? null;
    let shouldRefresh = false;

    update((state) => {
      if (state.activeServerId === nextId) {
        return state;
      }
      shouldRefresh = nextId !== null;
      return {
        ...state,
        activeServerId: nextId,
        webhooks: nextId ? state.webhooks : [],
        loading: nextId ? state.loading : false,
        error: null,
      };
    });

    if (shouldRefresh && nextId) {
      void refresh(nextId);
    }
  };

  async function initialize() {
    if (initializationPromise) {
      return initializationPromise;
    }

    initializationPromise = (async () => {
      if (serverStoreUnsubscribe) {
        return;
      }
      serverStoreUnsubscribe = serverStore.subscribe(handleServerUpdate as any);
      update((state) => ({ ...state, initialized: true }));
      const activeId = getActiveServerId();
      if (activeId) {
        await refresh(activeId);
      }
    })();

    return initializationPromise;
  }

  async function refresh(serverId?: string | null) {
    const targetServerId = serverId ?? getActiveServerId();
    if (!targetServerId) {
      set({
        ...initialState,
        initialized: get(store).initialized,
      });
      return;
    }
    await refreshStateForServer(targetServerId);
  }

  async function createWebhook(
    input: { name: string; url: string; channelId?: string; serverId?: string },
  ): Promise<Webhook | null> {
    const activeServerId = input.serverId ?? getActiveServerId();
    if (!activeServerId) {
      update((state) => ({
        ...state,
        error: "Select a server before creating webhooks.",
      }));
      return null;
    }

    const placeholderId = `optimistic-${Date.now()}`;
    const timestamp = new Date().toISOString();
    const placeholder: Webhook = {
      id: placeholderId,
      serverId: activeServerId,
      name: input.name,
      url: input.url,
      channelId: input.channelId ?? undefined,
      createdBy: "pending",
      createdAt: timestamp,
      updatedAt: timestamp,
      pending: true,
    };

    const result = await service.createWebhook(
      {
        serverId: activeServerId,
        name: input.name,
        url: input.url,
        channelId: input.channelId,
      },
      {
        optimisticUpdate: () => {
          update((state) => {
            if (state.activeServerId !== activeServerId) {
              return state;
            }
            return {
              ...state,
              error: null,
              webhooks: sortWebhooks([placeholder, ...state.webhooks]),
            };
          });
          return () => {
            update((state) => ({
              ...state,
              webhooks: state.webhooks.filter(
                (webhook) => webhook.id !== placeholderId,
              ),
            }));
          };
        },
      },
    );

    if (!result.success) {
      update((state) => {
        if (state.activeServerId !== activeServerId) {
          return state;
        }
        return { ...state, error: result.error };
      });
      return null;
    }

    update((state) => {
      if (state.activeServerId !== activeServerId) {
        return state;
      }
      const filtered = state.webhooks.filter(
        (webhook) => webhook.id !== placeholderId,
      );
      return {
        ...state,
        error: null,
        webhooks: sortWebhooks([...filtered, result.data]),
      };
    });

    return result.data;
  }

  async function updateWebhook(
    webhookId: string,
    patch: { name?: string; url?: string; channelId?: string | null },
    serverId?: string,
  ): Promise<Webhook | null> {
    const activeServerId = serverId ?? getActiveServerId();
    if (!activeServerId) {
      update((state) => ({
        ...state,
        error: "Select a server before updating webhooks.",
      }));
      return null;
    }

    const current = get(store).webhooks.find((w) => w.id === webhookId);
    if (!current) {
      update((state) => ({
        ...state,
        error: "Webhook not found.",
      }));
      return null;
    }

    const result = await service.updateWebhook(
      {
        webhookId,
        serverId: activeServerId,
        name: patch.name,
        url: patch.url,
        channelId: patch.channelId,
      },
      {
        optimisticUpdate: () => {
          update((state) => {
            if (state.activeServerId !== activeServerId) {
              return state;
            }
            return {
              ...state,
              webhooks: state.webhooks.map((webhook) =>
                webhook.id === webhookId
                  ? {
                      ...webhook,
                      name: patch.name ?? webhook.name,
                      url: patch.url ?? webhook.url,
                      channelId:
                        patch.channelId === undefined
                          ? webhook.channelId
                          : patch.channelId ?? undefined,
                      pending: true,
                    }
                  : webhook,
              ),
            };
          });
          return () => {
            update((state) => {
              if (state.activeServerId !== activeServerId) {
                return state;
              }
              return {
                ...state,
                webhooks: state.webhooks.map((webhook) =>
                  webhook.id === webhookId ? current : webhook,
                ),
              };
            });
          };
        },
      },
    );

    if (!result.success) {
      update((state) => {
        if (state.activeServerId !== activeServerId) {
          return state;
        }
        return { ...state, error: result.error };
      });
      return null;
    }

    update((state) => {
      if (state.activeServerId !== activeServerId) {
        return state;
      }
      return {
        ...state,
        error: null,
        webhooks: sortWebhooks(
          state.webhooks.map((webhook) =>
            webhook.id === webhookId ? result.data : webhook,
          ),
        ),
      };
    });

    return result.data;
  }

  async function deleteWebhook(
    webhookId: string,
    serverId?: string,
  ): Promise<boolean> {
    const activeServerId = serverId ?? getActiveServerId();
    if (!activeServerId) {
      update((state) => ({
        ...state,
        error: "Select a server before deleting webhooks.",
      }));
      return false;
    }

    const currentState = get(store);
    const index = currentState.webhooks.findIndex((w) => w.id === webhookId);
    if (index === -1) {
      update((state) => ({
        ...state,
        error: "Webhook not found.",
      }));
      return false;
    }
    const snapshot = currentState.webhooks[index];

    const result = await service.deleteWebhook(
      { webhookId, serverId: activeServerId },
      {
        optimisticUpdate: () => {
          update((state) => {
            if (state.activeServerId !== activeServerId) {
              return state;
            }
            return {
              ...state,
              webhooks: state.webhooks.filter((webhook) =>
                webhook.id !== webhookId
              ),
            };
          });
          return () => {
            update((state) => {
              if (state.activeServerId !== activeServerId) {
                return state;
              }
              const next = [...state.webhooks];
              next.splice(index, 0, snapshot);
              return { ...state, webhooks: next };
            });
          };
        },
      },
    );

    if (!result.success) {
      update((state) => {
        if (state.activeServerId !== activeServerId) {
          return state;
        }
        return { ...state, error: result.error };
      });
      return false;
    }

    update((state) => {
      if (state.activeServerId !== activeServerId) {
        return state;
      }
      return {
        ...state,
        error: null,
        webhooks: state.webhooks.filter((webhook) => webhook.id !== webhookId),
      };
    });

    return true;
  }

  function teardown() {
    serverStoreUnsubscribe?.();
    serverStoreUnsubscribe = null;
    initializationPromise = null;
    set({ ...initialState });
  }

  return {
    subscribe,
    initialize,
    refresh,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    teardown,
  };
}

export const serverWebhooksStore = createServerWebhooksStore();
