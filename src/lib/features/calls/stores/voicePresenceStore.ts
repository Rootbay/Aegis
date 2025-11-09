import { writable, type Readable } from "svelte/store";

export interface VoicePresenceParticipantInput {
  userId?: string;
  user_id?: string;
  joinedAt?: number | string | Date | null;
  joined_at?: number | string | Date | null;
}

export interface VoicePresenceJoinedPayload {
  channelId: string;
  serverId?: string | null;
  participantId: string;
  joinedAt?: number | string | Date | null;
  updatedAt?: number | string | Date | null;
}

export interface VoicePresenceLeftPayload {
  channelId: string;
  participantId: string;
  updatedAt?: number | string | Date | null;
}

export interface VoicePresenceSnapshotPayload {
  channelId: string;
  serverId?: string | null;
  participants: Array<string | VoicePresenceParticipantInput>;
  updatedAt?: number | string | Date | null;
}

export interface VoiceChannelParticipantPresence {
  userId: string;
  joinedAt: number | null;
  serverId: string | null;
  lastSeenAt: number;
}

export interface VoiceChannelPresenceEntry {
  channelId: string;
  serverId: string | null;
  participants: Map<string, VoiceChannelParticipantPresence>;
  updatedAt: number;
}

type VoicePresenceState = Map<string, VoiceChannelPresenceEntry>;

type VoicePresenceStore = Readable<VoicePresenceState> & {
  syncChannelPresence: (payload: VoicePresenceSnapshotPayload) => void;
  markParticipantJoined: (payload: VoicePresenceJoinedPayload) => void;
  markParticipantLeft: (payload: VoicePresenceLeftPayload) => void;
  removeChannel: (channelId: string) => void;
  reset: () => void;
};

function coerceTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const parsed = Number.isFinite(Number(trimmed))
      ? Number(trimmed)
      : Date.parse(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
    return null;
  }
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  return null;
}

function coerceParticipantId(
  participant: string | VoicePresenceParticipantInput,
): string | null {
  if (typeof participant === "string") {
    const trimmed = participant.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  const candidate = participant.userId ?? participant.user_id;
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate.trim();
  }
  return null;
}

function coerceJoinedAt(
  participant: string | VoicePresenceParticipantInput,
  fallback: number,
): number {
  if (typeof participant === "string") {
    return fallback;
  }
  return coerceTimestamp(participant.joinedAt ?? participant.joined_at) ?? fallback;
}

function createVoicePresenceStore(): VoicePresenceStore {
  const { subscribe, set, update } = writable<VoicePresenceState>(new Map());

  const syncChannelPresence = (payload: VoicePresenceSnapshotPayload) => {
    if (!payload.channelId) {
      return;
    }
    const participants = Array.isArray(payload.participants)
      ? payload.participants
      : [];
    update((state) => {
      const next = new Map(state);
      const normalizedParticipants = new Map<string, VoiceChannelParticipantPresence>();
      const timestamp = coerceTimestamp(payload.updatedAt) ?? Date.now();
      for (const entry of participants) {
        const participantId = coerceParticipantId(entry);
        if (!participantId) {
          continue;
        }
        const joinedAt = coerceJoinedAt(entry, timestamp);
        normalizedParticipants.set(participantId, {
          userId: participantId,
          joinedAt,
          serverId: payload.serverId ?? null,
          lastSeenAt: timestamp,
        });
      }
      if (normalizedParticipants.size === 0) {
        next.delete(payload.channelId);
        return next;
      }
      next.set(payload.channelId, {
        channelId: payload.channelId,
        serverId: payload.serverId ?? null,
        participants: normalizedParticipants,
        updatedAt: timestamp,
      });
      return next;
    });
  };

  const markParticipantJoined = (payload: VoicePresenceJoinedPayload) => {
    if (!payload.channelId || !payload.participantId) {
      return;
    }
    const participantId = payload.participantId.trim();
    if (participantId.length === 0) {
      return;
    }
    update((state) => {
      const existing = state.get(payload.channelId);
      const timestamp = coerceTimestamp(payload.updatedAt) ?? Date.now();
      const joinedAt = coerceTimestamp(payload.joinedAt) ?? timestamp;
      const participants = new Map(
        existing?.participants ?? new Map<string, VoiceChannelParticipantPresence>(),
      );
      const serverId = payload.serverId ?? existing?.serverId ?? null;
      participants.set(participantId, {
        userId: participantId,
        joinedAt,
        serverId,
        lastSeenAt: timestamp,
      });
      const next = new Map(state);
      next.set(payload.channelId, {
        channelId: payload.channelId,
        serverId,
        participants,
        updatedAt: timestamp,
      });
      return next;
    });
  };

  const markParticipantLeft = (payload: VoicePresenceLeftPayload) => {
    if (!payload.channelId || !payload.participantId) {
      return;
    }
    const participantId = payload.participantId.trim();
    if (participantId.length === 0) {
      return;
    }
    update((state) => {
      const existing = state.get(payload.channelId);
      if (!existing) {
        return state;
      }
      if (!existing.participants.has(participantId)) {
        return state;
      }
      const participants = new Map(existing.participants);
      participants.delete(participantId);
      const timestamp = coerceTimestamp(payload.updatedAt) ?? Date.now();
      const next = new Map(state);
      if (participants.size === 0) {
        next.delete(payload.channelId);
      } else {
        next.set(payload.channelId, {
          channelId: payload.channelId,
          serverId: existing.serverId,
          participants,
          updatedAt: timestamp,
        });
      }
      return next;
    });
  };

  const removeChannel = (channelId: string) => {
    if (!channelId) {
      return;
    }
    update((state) => {
      if (!state.has(channelId)) {
        return state;
      }
      const next = new Map(state);
      next.delete(channelId);
      return next;
    });
  };

  const reset = () => {
    set(new Map());
  };

  return {
    subscribe,
    syncChannelPresence,
    markParticipantJoined,
    markParticipantLeft,
    removeChannel,
    reset,
  };
}

export const voicePresenceStore = createVoicePresenceStore();
export type { VoicePresenceState };
