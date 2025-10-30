import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_STUN_SERVER,
  getEnvTurnServers,
  getIceServersFromConfig,
} from "./iceServers";
import type { TurnServerConfig } from "$lib/features/settings/stores/settings";

const originalEnv = process.env.VITE_TURN_SERVERS;

beforeEach(() => {
  delete process.env.VITE_TURN_SERVERS;
});

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env.VITE_TURN_SERVERS;
  } else {
    process.env.VITE_TURN_SERVERS = originalEnv;
  }
});

describe("ICE server configuration helpers", () => {
  it("returns an empty list when no environment variable is set", () => {
    expect(getEnvTurnServers()).toEqual([]);
  });

  it("parses TURN servers from JSON environment values", () => {
    process.env.VITE_TURN_SERVERS = JSON.stringify([
      {
        urls: ["turn:relay.example.com:3478"],
        username: "relay-user",
        credential: "relay-pass",
      },
    ]);

    const envServers = getEnvTurnServers();
    expect(envServers).toHaveLength(1);
    expect(envServers[0]).toMatchObject({
      urls: "turn:relay.example.com:3478",
      username: "relay-user",
      credential: "relay-pass",
    });
  });

  it("supports simple comma or space separated TURN URLs", () => {
    process.env.VITE_TURN_SERVERS = "turn:one.example:3478 turn:two.example:3478";

    const envServers = getEnvTurnServers();
    expect(envServers).toHaveLength(1);
    expect(envServers[0].urls).toEqual([
      "turn:one.example:3478",
      "turn:two.example:3478",
    ]);
  });

  it("merges default, environment, and settings TURN servers", () => {
    process.env.VITE_TURN_SERVERS = JSON.stringify({
      urls: "turn:env.example:3478",
      username: "env-user",
      credential: "env-pass",
    });

    const configs: TurnServerConfig[] = [
      {
        urls: ["turn:custom.example:3478"],
        username: "custom-user",
        credential: "custom-pass",
      },
    ];

    const iceServers = getIceServersFromConfig(configs);
    expect(iceServers[0]).toMatchObject(DEFAULT_STUN_SERVER);
    expect(iceServers).toHaveLength(3);
    expect(iceServers[1]).toMatchObject({
      urls: "turn:env.example:3478",
      username: "env-user",
      credential: "env-pass",
    });
    expect(iceServers[2]).toMatchObject({
      urls: "turn:custom.example:3478",
      username: "custom-user",
      credential: "custom-pass",
    });
  });
});

