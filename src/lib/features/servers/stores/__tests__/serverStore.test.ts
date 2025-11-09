import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";

import { createServerStore } from "../serverStore";
import type { Server } from "$lib/features/servers/models/Server";
import type { Channel } from "$lib/features/channels/models/Channel";
import { serverCache } from "$lib/utils/cache";
import { userStore } from "$lib/stores/userStore";

const baseServer: Server = {
  id: "server-1",
  name: "Server One",
  owner_id: "owner-1",
  channels: [],
  categories: [],
  members: [],
  roles: [],
};

const textChannel: Channel = {
  id: "channel-1",
  name: "general",
  server_id: baseServer.id,
  channel_type: "text",
  private: false,
  position: 0,
  category_id: null,
};

describe("serverStore social event helpers", () => {
  beforeEach(() => {
    serverCache.clear();
    userStore.__setStateForTesting?.({ me: null, loading: false });
  });

  afterEach(() => {
    userStore.__setStateForTesting?.({ me: null, loading: false });
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

  describe("channel access checks", () => {
    const buildMember = (
      id: string,
      name: string,
      roles: string[] = [],
    ) => ({
      id,
      name,
      avatar: `https://example.com/${id}.png`,
      online: true,
      roles,
      role_ids: roles,
      roleIds: roles,
    });

    it("allows access to non-private channels", () => {
      const store = createServerStore();
      const channel: Channel = {
        ...textChannel,
        private: false,
      };
      store.handleServersUpdate([
        {
          ...baseServer,
          channels: [channel],
          members: [buildMember("member-1", "Member One")],
        },
      ]);

      userStore.__setStateForTesting?.({
        me: buildMember("member-1", "Member One"),
        loading: false,
      });

      expect(
        store.canAccessChannel({
          serverId: baseServer.id,
          channelId: channel.id,
        }),
      ).toBe(true);
    });

    it("allows access to private channels for listed members", () => {
      const store = createServerStore();
      const privateChannel: Channel = {
        ...textChannel,
        id: "channel-private",
        private: true,
        allowed_user_ids: ["member-2"],
      };

      store.handleServersUpdate([
        {
          ...baseServer,
          channels: [privateChannel],
          members: [buildMember("member-2", "Member Two")],
        },
      ]);

      userStore.__setStateForTesting?.({
        me: buildMember("member-2", "Member Two"),
        loading: false,
      });

      expect(
        store.canAccessChannel({
          serverId: baseServer.id,
          channelId: privateChannel.id,
        }),
      ).toBe(true);
    });

    it("allows access to private channels via role membership", () => {
      const store = createServerStore();
      const privateChannel: Channel = {
        ...textChannel,
        id: "channel-role",
        private: true,
        allowed_role_ids: ["role-1"],
      };

      store.handleServersUpdate([
        {
          ...baseServer,
          channels: [privateChannel],
          members: [buildMember("member-3", "Member Three", ["role-1"])],
          roles: [
            {
              id: "role-1",
              name: "Role One",
              color: "#ffffff",
              hoist: false,
              mentionable: false,
              position: 0,
              permissions: {},
              member_ids: ["member-3"],
            },
          ],
        },
      ]);

      userStore.__setStateForTesting?.({
        me: buildMember("member-3", "Member Three", ["role-1"]),
        loading: false,
      });

      expect(
        store.canAccessChannel({
          serverId: baseServer.id,
          channelId: privateChannel.id,
        }),
      ).toBe(true);
    });

    it("grants access to the server owner", () => {
      const store = createServerStore();
      const privateChannel: Channel = {
        ...textChannel,
        id: "channel-owner",
        private: true,
        allowed_role_ids: [],
        allowed_user_ids: [],
      };

      store.handleServersUpdate([
        {
          ...baseServer,
          channels: [privateChannel],
          members: [
            buildMember(baseServer.owner_id, "Owner", []),
            buildMember("member-4", "Other Member"),
          ],
        },
      ]);

      userStore.__setStateForTesting?.({
        me: buildMember(baseServer.owner_id, "Owner"),
        loading: false,
      });

      expect(
        store.canAccessChannel({
          serverId: baseServer.id,
          channelId: privateChannel.id,
        }),
      ).toBe(true);
    });

    it("denies access when no membership or roles match", () => {
      const store = createServerStore();
      const privateChannel: Channel = {
        ...textChannel,
        id: "channel-deny",
        private: true,
        allowed_role_ids: ["role-allow"],
        allowed_user_ids: ["member-allow"],
      };

      store.handleServersUpdate([
        {
          ...baseServer,
          channels: [privateChannel],
          members: [
            buildMember("member-allow", "Allowed"),
            buildMember("member-denied", "Denied"),
          ],
          roles: [
            {
              id: "role-allow",
              name: "Allowed Role",
              color: "#ffffff",
              hoist: false,
              mentionable: false,
              position: 0,
              permissions: {},
              member_ids: ["member-allow"],
            },
          ],
        },
      ]);

      userStore.__setStateForTesting?.({
        me: buildMember("member-denied", "Denied"),
        loading: false,
      });

      expect(
        store.canAccessChannel({
          serverId: baseServer.id,
          channelId: privateChannel.id,
        }),
      ).toBe(false);
    });
  });
});
