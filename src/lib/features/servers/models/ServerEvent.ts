export type ServerEventStatus = "scheduled" | "cancelled" | "completed";

export interface ServerEvent {
  id: string;
  serverId: string;
  title: string;
  description?: string;
  channelId?: string;
  scheduledFor: string;
  createdBy: string;
  createdAt: string;
  status: ServerEventStatus;
  cancelledAt?: string;
}

export type CreateServerEventInput = {
  serverId: string;
  title: string;
  description?: string;
  channelId?: string;
  scheduledFor: string;
};

export type UpdateServerEventInput = {
  eventId: string;
  title?: string;
  description?: string | null;
  channelId?: string | null;
  scheduledFor?: string;
};
