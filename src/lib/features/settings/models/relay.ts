export type RelayScope = "global" | "server";

export type RelayStatus = "unknown" | "healthy" | "degraded" | "offline";

export interface RelayConfig {
  id: string;
  label: string;
  urls: string[];
  username?: string;
  credential?: string;
  scope: RelayScope;
  serverIds: string[];
}

export interface RelayHealth {
  status: RelayStatus;
  lastCheckedAt: string | null;
  latencyMs: number | null;
  uptimePercent: number | null;
  error: string | null;
}

export interface RelayRecord {
  config: RelayConfig;
  health: RelayHealth;
}

export interface RelaySnapshot {
  id: string;
  label: string;
  urls: string[];
  scope: RelayScope;
  serverIds: string[];
  hasCredential: boolean;
  status?: RelayStatus;
  lastCheckedAt?: string | null;
  latencyMs?: number | null;
  uptimePercent?: number | null;
  error?: string | null;
}

export interface RelayHealthUpdate {
  relayId: string;
  status?: RelayStatus;
  latencyMs?: number | null;
  uptimePercent?: number | null;
  error?: string | null;
  checkedAt?: string | null;
}
