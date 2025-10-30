import type { TurnServerConfig } from "$lib/features/settings/stores/settings";

export const DEFAULT_STUN_SERVER: Readonly<RTCIceServer> = Object.freeze({
  urls: "stun:stun.l.google.com:19302",
});

function getTurnServersEnvRaw(): string | undefined {
  try {
    const fromImportMeta =
      typeof import.meta !== "undefined"
        ? (import.meta as unknown as { env?: Record<string, unknown> }).env
        : undefined;
    const envValue = fromImportMeta?.VITE_TURN_SERVERS;
    if (typeof envValue === "string" && envValue.trim().length > 0) {
      return envValue;
    }
  } catch (error) {
    console.warn("Failed to read VITE_TURN_SERVERS from import.meta.env", error);
  }

  if (typeof process !== "undefined" && process.env?.VITE_TURN_SERVERS) {
    const value = process.env.VITE_TURN_SERVERS;
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function splitUrls(value: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item): item is string => item.length > 0);
  }

  return value
    .split(/[\s,]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function createIceServerFromConfig(
  config: TurnServerConfig,
): RTCIceServer | null {
  const urls = config.urls.map((url) => url.trim()).filter((url) => url.length > 0);
  if (urls.length === 0) {
    return null;
  }

  const iceServer: RTCIceServer = {
    urls: urls.length === 1 ? urls[0] : urls,
  };

  if (config.username && config.username.trim().length > 0) {
    iceServer.username = config.username.trim();
  }

  if (config.credential && config.credential.length > 0) {
    iceServer.credential = config.credential;
  }

  return iceServer;
}

type EnvTurnEntry = Partial<{
  url: unknown;
  urls: unknown;
  username: unknown;
  credential: unknown;
}>;

function coerceEnvEntry(entry: EnvTurnEntry): TurnServerConfig | null {
  const urlsSource =
    entry.urls ?? (typeof entry.url === "string" ? entry.url : undefined);

  if (typeof urlsSource === "undefined") {
    return null;
  }

  const urls = splitUrls(urlsSource as string | string[]);
  if (urls.length === 0) {
    return null;
  }

  const usernameValue =
    typeof entry.username === "string"
      ? entry.username.trim()
      : entry.username != null
        ? String(entry.username).trim()
        : "";

  const credentialValue =
    typeof entry.credential === "string"
      ? entry.credential
      : entry.credential != null
        ? String(entry.credential)
        : "";

  return {
    urls,
    username: usernameValue.length > 0 ? usernameValue : undefined,
    credential: credentialValue.length > 0 ? credentialValue : undefined,
  } satisfies TurnServerConfig;
}

function parseJsonTurnValue(raw: string): TurnServerConfig[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) =>
          typeof entry === "object" && entry
            ? coerceEnvEntry(entry as EnvTurnEntry)
            : null,
        )
        .filter((value): value is TurnServerConfig => value !== null);
    }

    if (typeof parsed === "object" && parsed) {
      const single = coerceEnvEntry(parsed as EnvTurnEntry);
      return single ? [single] : [];
    }
  } catch (error) {
    console.warn("Failed to parse TURN server JSON", error);
  }

  return [];
}

function parseFallbackTurnValue(raw: string): TurnServerConfig[] {
  const urls = splitUrls(raw);
  if (urls.length === 0) {
    return [];
  }
  return [
    {
      urls,
    },
  ];
}

function canonicalIceServerKey(server: RTCIceServer): string {
  const urls = Array.isArray(server.urls)
    ? server.urls.join(",")
    : server.urls;
  const username = server.username ?? "";
  const credential = server.credential ?? "";
  return `${urls}|${username}|${credential}`;
}

function dedupeIceServers(servers: RTCIceServer[]): RTCIceServer[] {
  const seen = new Set<string>();
  const result: RTCIceServer[] = [];

  for (const server of servers) {
    const key = canonicalIceServerKey(server);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(server);
  }

  return result;
}

export function getEnvTurnServers(): RTCIceServer[] {
  const raw = getTurnServersEnvRaw();
  if (!raw) {
    return [];
  }

  const fromJson = parseJsonTurnValue(raw);
  const configs = fromJson.length > 0 ? fromJson : parseFallbackTurnValue(raw);
  return configs
    .map((config) => createIceServerFromConfig(config))
    .filter((value): value is RTCIceServer => value !== null);
}

export function getIceServersFromConfig(
  configs: TurnServerConfig[],
): RTCIceServer[] {
  const fromSettings = configs
    .map((config) => createIceServerFromConfig(config))
    .filter((value): value is RTCIceServer => value !== null);

  const combined = [DEFAULT_STUN_SERVER, ...getEnvTurnServers(), ...fromSettings];
  return dedupeIceServers(combined);
}

