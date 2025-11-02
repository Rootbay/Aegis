import { invoke } from "@tauri-apps/api/core";
import { toasts } from "$lib/stores/ToastStore";
import type {
  CreateWebhookInput,
  DeleteWebhookInput,
  UpdateWebhookInput,
  Webhook,
} from "$lib/features/servers/models/Webhook";

export type WebhookServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type OptimisticUpdate = () => void | (() => void);

export interface WebhookOperationOptions {
  optimisticUpdate?: OptimisticUpdate;
}

export type InvokeClient = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

interface BackendWebhook {
  id: string;
  server_id: string;
  name: string;
  url: string;
  channel_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function mapWebhook(backend: BackendWebhook): Webhook {
  return {
    id: backend.id,
    serverId: backend.server_id,
    name: backend.name,
    url: backend.url,
    channelId: backend.channel_id ?? undefined,
    createdBy: backend.created_by,
    createdAt: backend.created_at,
    updatedAt: backend.updated_at,
  };
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

async function withOptimistic<T>(
  action: () => Promise<T>,
  {
    optimisticUpdate,
    successMessage,
    failureMessage,
  }: {
    optimisticUpdate?: OptimisticUpdate;
    successMessage: string;
    failureMessage: string;
  },
): Promise<WebhookServiceResult<T>> {
  let rollback: ReturnType<OptimisticUpdate> | void = undefined;
  try {
    if (optimisticUpdate) {
      rollback = optimisticUpdate();
    }
    const data = await action();
    toasts.addToast(successMessage, "success");
    return { success: true, data };
  } catch (error) {
    if (typeof rollback === "function") {
      rollback();
    }
    const message = extractErrorMessage(error, failureMessage);
    toasts.showErrorToast(message);
    return { success: false, error: message };
  }
}

export interface WebhookService {
  fetchWebhooks(serverId: string): Promise<WebhookServiceResult<Webhook[]>>;
  createWebhook(
    input: CreateWebhookInput,
    options?: WebhookOperationOptions,
  ): Promise<WebhookServiceResult<Webhook>>;
  updateWebhook(
    input: UpdateWebhookInput,
    options?: WebhookOperationOptions,
  ): Promise<WebhookServiceResult<Webhook>>;
  deleteWebhook(
    input: DeleteWebhookInput,
    options?: WebhookOperationOptions,
  ): Promise<WebhookServiceResult<string>>;
}

export function createWebhookService(
  client: InvokeClient = invoke,
): WebhookService {
  return {
    async fetchWebhooks(serverId) {
      try {
        const response = await client<BackendWebhook[]>(
          "list_server_webhooks",
          {
            server_id: serverId,
          },
        );
        return { success: true, data: response.map(mapWebhook) };
      } catch (error) {
        const message = extractErrorMessage(error, "Failed to load webhooks.");
        toasts.showErrorToast(message);
        return { success: false, error: message };
      }
    },

    async createWebhook(input, options) {
      return withOptimistic(
        async () => {
          const response = await client<BackendWebhook>(
            "create_server_webhook",
            {
              request: {
                server_id: input.serverId,
                name: input.name,
                url: input.url,
                channel_id: input.channelId ?? null,
              },
            },
          );
          return mapWebhook(response);
        },
        {
          optimisticUpdate: options?.optimisticUpdate,
          successMessage: "Webhook created.",
          failureMessage: "Failed to create webhook.",
        },
      );
    },

    async updateWebhook(input, options) {
      return withOptimistic(
        async () => {
          const payload: Record<string, unknown> = {
            webhook_id: input.webhookId,
            server_id: input.serverId,
          };
          if (input.name !== undefined) {
            payload.name = input.name;
          }
          if (input.url !== undefined) {
            payload.url = input.url;
          }
          if (input.channelId !== undefined) {
            payload.channel_id = input.channelId;
          }
          const response = await client<BackendWebhook>(
            "update_server_webhook",
            {
              request: payload,
            },
          );
          return mapWebhook(response);
        },
        {
          optimisticUpdate: options?.optimisticUpdate,
          successMessage: "Webhook updated.",
          failureMessage: "Failed to update webhook.",
        },
      );
    },

    async deleteWebhook(input, options) {
      return withOptimistic(
        async () => {
          const response = await client<{ webhook_id: string }>(
            "delete_server_webhook",
            {
              request: {
                webhook_id: input.webhookId,
                server_id: input.serverId,
              },
            },
          );
          return response.webhook_id;
        },
        {
          optimisticUpdate: options?.optimisticUpdate,
          successMessage: "Webhook deleted.",
          failureMessage: "Failed to delete webhook.",
        },
      );
    },
  };
}

export const webhookService = createWebhookService();
