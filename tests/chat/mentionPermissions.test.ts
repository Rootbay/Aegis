import { describe, expect, it } from "vitest";
import {
  buildSpecialMentionCandidates,
  canMemberMentionEveryone,
  extractSpecialMentionKeys,
} from "$lib/features/chat/utils/mentionPermissions";
import type { Chat } from "$lib/features/chat/models/Chat";
import type { Server } from "$lib/features/servers/models/Server";
import type { User } from "$lib/features/auth/models/User";

function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    name: "Test User",
    avatar: "",
    online: true,
    ...overrides,
  };
}

function createTestServer(overrides: Partial<Server> = {}): Server {
  return {
    id: "server-1",
    name: "Test Server",
    owner_id: "owner-1",
    channels: [],
    categories: [],
    members: [],
    roles: [],
    ...overrides,
  };
}

function createTestChannelChat(members: User[] = []): Chat {
  return {
    type: "channel",
    id: "channel-1",
    name: "general",
    serverId: "server-1",
    members,
    messages: [],
  };
}

describe("buildSpecialMentionCandidates", () => {
  it("returns no candidates when permission is denied", () => {
    expect(buildSpecialMentionCandidates(false)).toEqual([]);
  });

  it("includes @everyone and @here when permission is granted", () => {
    const candidates = buildSpecialMentionCandidates(true);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      id: "@everyone",
      specialKey: "everyone",
    });
    expect(candidates[1]).toMatchObject({
      id: "@here",
      specialKey: "here",
    });
  });
});

describe("canMemberMentionEveryone", () => {
  it("allows the server owner to mention everyone", () => {
    const owner = createTestUser({ id: "owner-1" });
    const server = createTestServer({ owner_id: "owner-1" });
    const chat = createTestChannelChat([]);

    expect(
      canMemberMentionEveryone({ chat, server, me: owner }),
    ).toBe(true);
  });

  it("requires an explicit permission grant for members", () => {
    const member = createTestUser({ id: "member-1", roles: ["role-mention"] });
    const server = createTestServer({
      members: [member],
      roles: [
        {
          id: "role-mention",
          name: "Mention Everyone",
          color: "#ffffff",
          hoist: false,
          mentionable: true,
          position: 0,
          permissions: { mention_everyone: true },
          member_ids: ["member-1"],
        },
      ],
    });
    const chat = createTestChannelChat([member]);

    expect(
      canMemberMentionEveryone({ chat, server, me: member }),
    ).toBe(true);
  });

  it("returns false when the member lacks the permission", () => {
    const member = createTestUser({ id: "member-2" });
    const server = createTestServer({ members: [member], roles: [] });
    const chat = createTestChannelChat([member]);

    expect(
      canMemberMentionEveryone({ chat, server, me: member }),
    ).toBe(false);
  });
});

describe("extractSpecialMentionKeys", () => {
  it("detects standalone @everyone and @here tokens", () => {
    const detected = extractSpecialMentionKeys(
      "ping @everyone and also @here please",
    );

    expect(Array.from(detected)).toEqual(["everyone", "here"]);
  });

  it("ignores email addresses and handles punctuation", () => {
    const detected = extractSpecialMentionKeys(
      "contact us at hello@here.com, but not @everyone!",
    );

    expect(Array.from(detected)).toEqual(["everyone"]);
  });
});

describe("role hierarchy permission resolution", () => {
  it("honors the highest ranked role when permissions conflict", () => {
    const member = createTestUser({ id: "member-1", roles: ["role-low", "role-high"] });
    const server = createTestServer({
      members: [member],
      roles: [
        {
          id: "role-low",
          name: "Allow Mention",
          color: "#ffffff",
          hoist: false,
          mentionable: true,
          position: 2,
          permissions: { mention_everyone: true },
          member_ids: ["member-1"],
        },
        {
          id: "role-high",
          name: "Deny Mention",
          color: "#ff0000",
          hoist: true,
          mentionable: false,
          position: 0,
          permissions: { mention_everyone: false },
          member_ids: ["member-1"],
        },
      ],
    });
    const chat = createTestChannelChat([member]);

    expect(
      canMemberMentionEveryone({ chat, server, me: member }),
    ).toBe(false);
  });
});
