export interface Webhook {
  id: string;
  serverId: string;
  name: string;
  url: string;
  channelId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  pending?: boolean;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  channelId?: string;
  serverId: string;
}

export interface UpdateWebhookInput {
  webhookId: string;
  name?: string;
  url?: string;
  channelId?: string | null;
  serverId: string;
}

export interface DeleteWebhookInput {
  webhookId: string;
  serverId: string;
}
