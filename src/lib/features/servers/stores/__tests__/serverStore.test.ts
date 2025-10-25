import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";

import { createServerStore } from "../serverStore";
import type { Server } from "$lib/features/servers/models/Server";
import type { Channel } from "$lib/features/channels/models/Channel";
import { serverCache } from "$lib/utils/cache";

const baseServer: Server = {
  id: "server-1",
  name: "Server One",
  owner_id: "owner-1",
  channels: [],
  members: [],
  roles: [],
};

const textChannel: Channel = {
  id: "channel-1",
  name: "general",
  server_id: baseServer.id,
  channel_type: "text",
  private: false,
};

describe("serverStore social event helpers", () => {
  beforeEach(() => {
    serverCache.clear();
  });

  it("adds servers when they are created", () => {
    const store = createServerStore();
    store.handleServersUpdate([]);

    store.addServer(baseServer);

    const state = get(store);
    expect(state.servers).toHaveLength(1);
    expect(state.servers[0]).toMatchObject({ id: baseServer.id });
  });

  it("appends channels created remotely", () => {
    const store = createServerStore();
    store.handleServersUpdate([{ ...baseServer }]);

    store.addChannelToServer(baseServer.id, textChannel);

    const state = get(store);
    expect(state.servers[0].channels).toContainEqual(textChannel);
  });

  it("removes channels when they are deleted", () => {
    const store = createServerStore();
    store.handleServersUpdate([{ ...baseServer, channels: [textChannel] }]);

    store.removeChannelFromServer(baseServer.id, textChannel.id);

    const state = get(store);
    expect(state.servers[0].channels).toHaveLength(0);
  });

  it("removes servers when they are deleted", () => {
    const store = createServerStore();
    store.handleServersUpdate([{ ...baseServer }]);

    store.removeServer(baseServer.id);

    const state = get(store);
    expect(state.servers).toHaveLength(0);
  });
});
