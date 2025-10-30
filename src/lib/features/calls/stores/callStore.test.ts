import { beforeEach, describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";

const listenHandlers = new Map<string, (event: { payload: unknown }) => void>();
const invokeMock = vi.fn(async () => undefined);
const listenMock = vi.fn(
  async (event: string, handler: (event: { payload: unknown }) => void) => {
    listenHandlers.set(event, handler);
    return () => listenHandlers.delete(event);
  },
);
const addToastMock = vi.fn();
const showErrorToastMock = vi.fn();
const groupChatsStore = writable(new Map());
const serverStoreState = writable({
  servers: [],
  loading: false,
  activeServerId: null,
});
const userStoreState = writable({
  me: {
    id: "self-user",
    name: "Self User",
    avatar: "",
    online: true,
  },
});
const getUserMock = vi.fn(async () => null);
const settingsStoreState = writable({
  audioInputDeviceId: "",
  videoInputDeviceId: "",
  audioOutputDeviceId: "",
  turnServers: [],
});

class MockMediaStream {
  private tracks: MediaStreamTrack[];

  constructor(tracks: MediaStreamTrack[] = []) {
    this.tracks = tracks;
  }

  getTracks() {
    return this.tracks;
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }

  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }
}

class MockRTCPeerConnection {
  static lastInstance: MockRTCPeerConnection | null = null;
  static instances: MockRTCPeerConnection[] = [];

  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState: RTCPeerConnectionState = "new";
  addTrack = vi.fn();
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "offer-sdp" }));
  createAnswer = vi.fn(async () => ({ type: "answer", sdp: "answer-sdp" }));
  setLocalDescription = vi.fn(async (desc: RTCSessionDescriptionInit) => {
    this.localDescription = desc;
  });
  setRemoteDescription = vi.fn(async (desc: RTCSessionDescriptionInit) => {
    this.remoteDescription = desc;
  });
  addIceCandidate = vi.fn(async () => undefined);
  close = vi.fn(() => {
    this.connectionState = "closed";
  });

  constructor() {
    MockRTCPeerConnection.lastInstance = this;
    MockRTCPeerConnection.instances.push(this);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var MediaStream: typeof MockMediaStream;
  // eslint-disable-next-line no-var
  var RTCPeerConnection: typeof MockRTCPeerConnection;
}

vi.mock("$lib/services/tauri", () => ({
  getInvoke: async () => invokeMock,
  getListen: async () => listenMock,
}));

vi.mock("$lib/stores/ToastStore", () => ({
  toasts: {
    addToast: (...args: Parameters<typeof addToastMock>) =>
      addToastMock(...args),
    showErrorToast: (...args: Parameters<typeof showErrorToastMock>) =>
      showErrorToastMock(...args),
  },
}));

vi.mock("$lib/features/chat/stores/chatStore", () => ({
  groupChats: {
    subscribe: groupChatsStore.subscribe,
  },
}));

vi.mock("$lib/features/servers/stores/serverStore", () => ({
  serverStore: {
    subscribe: serverStoreState.subscribe,
  },
}));

vi.mock("$lib/stores/userStore", () => ({
  userStore: {
    subscribe: userStoreState.subscribe,
    getUser: (...args: Parameters<typeof getUserMock>) => getUserMock(...args),
  },
}));

vi.mock("$lib/features/settings/stores/settings", () => ({
  settings: {
    subscribe: settingsStoreState.subscribe,
  },
}));

describe("callStore signaling", () => {
  const audioTrack = {
    stop: vi.fn(),
    kind: "audio",
  } as unknown as MediaStreamTrack;

  beforeEach(() => {
    vi.resetModules();
    invokeMock.mockReset();
    listenMock.mockReset();
    listenHandlers.clear();
    addToastMock.mockReset();
    showErrorToastMock.mockReset();
    getUserMock.mockReset();

    groupChatsStore.set(new Map());
    serverStoreState.set({ servers: [], loading: false, activeServerId: null });
    userStoreState.set({
      me: {
        id: "self-user",
        name: "Self User",
        avatar: "",
        online: true,
      },
    });

    MockRTCPeerConnection.instances = [];
    globalThis.MediaStream = MockMediaStream;
    globalThis.RTCPeerConnection =
      MockRTCPeerConnection as unknown as typeof RTCPeerConnection;

    Object.defineProperty(window, "RTCPeerConnection", {
      value: MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
      configurable: true,
    });

    Object.defineProperty(window, "MediaStream", {
      value: MockMediaStream,
      configurable: true,
    });

    if (typeof crypto?.randomUUID === "function") {
      vi.spyOn(crypto, "randomUUID").mockReturnValue("test-call-id");
    } else {
      // @ts-expect-error assigning mock crypto for tests
      globalThis.crypto = { randomUUID: vi.fn(() => "test-call-id") };
    }

    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn(async () => new MockMediaStream([audioTrack])),
        enumerateDevices: vi.fn(async () => [
          { kind: "audioinput" },
          { kind: "videoinput" },
        ]),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as MediaDevices,
      configurable: true,
    });

    Object.defineProperty(navigator, "permissions", {
      value: {
        query: vi.fn(async () => ({ state: "granted" })),
      } as unknown as Permissions,
      configurable: true,
    });
  });

  it("creates offers for every invitee in a group call", async () => {
    const { callStore } = await import("$lib/features/calls/stores/callStore");

    groupChatsStore.set(
      new Map([
        [
          "group-1",
          {
            id: "group-1",
            name: "Study Group",
            ownerId: "owner-1",
            createdAt: new Date().toISOString(),
            memberIds: ["peer-a", "peer-b", "self-user"],
          },
        ],
      ]),
    );

    const started = await callStore.startCall({
      chatId: "group-1",
      chatName: "Study Group",
      chatType: "group",
      type: "voice",
      members: [
        { id: "peer-a", name: "Peer A" },
        { id: "peer-b", name: "Peer B" },
      ],
    });

    expect(started).toBe(true);

    const signalCalls = invokeMock.mock.calls.filter(
      ([command]) => command === "send_call_signal",
    );
    expect(signalCalls).toHaveLength(2);
    expect(signalCalls.map(([, payload]) => payload.recipientId)).toEqual(
      expect.arrayContaining(["peer-a", "peer-b"]),
    );
    expect(MockRTCPeerConnection.instances).toHaveLength(2);

    callStore.reset();
  });

  it("applies remote answers and pending ICE candidates per participant", async () => {
    const { callStore } = await import("$lib/features/calls/stores/callStore");

    await callStore.startCall({
      chatId: "peer-2",
      chatName: "Peer Two",
      chatType: "dm",
      type: "voice",
      members: [{ id: "peer-2", name: "Peer Two" }],
    });

    const signalCalls = invokeMock.mock.calls.filter(
      ([command]) => command === "send_call_signal",
    );
    const callId = signalCalls[0]?.[1]?.callId as string;
    expect(callId).toBeDefined();

    const handler = listenHandlers.get("call-signal");
    expect(handler).toBeTypeOf("function");

    handler?.({
      payload: {
        senderId: "peer-2",
        callId,
        signal: {
          type: "ice-candidate",
          candidate: "candidate-1",
          sdpMid: "0",
          sdpMLineIndex: 0,
        },
      },
    });

    await Promise.resolve();

    const peer = MockRTCPeerConnection.instances[0];
    expect(peer.addIceCandidate).not.toHaveBeenCalled();

    handler?.({
      payload: {
        senderId: "peer-2",
        callId,
        signal: {
          type: "answer",
          sdp: "answer-sdp",
        },
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(peer.setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "answer-sdp",
    });
    expect(peer.addIceCandidate).toHaveBeenCalledWith({
      candidate: "candidate-1",
      sdpMid: "0",
      sdpMLineIndex: 0,
    });

    callStore.reset();
  });

  it("marks participants as left and ends when the last peer departs", async () => {
    const { callStore } = await import("$lib/features/calls/stores/callStore");

    groupChatsStore.set(
      new Map([
        [
          "group-2",
          {
            id: "group-2",
            name: "Raid Team",
            ownerId: "owner-2",
            createdAt: new Date().toISOString(),
            memberIds: ["peer-a", "peer-b", "self-user"],
          },
        ],
      ]),
    );

    await callStore.startCall({
      chatId: "group-2",
      chatName: "Raid Team",
      chatType: "group",
      type: "voice",
      members: [
        { id: "peer-a", name: "Peer A" },
        { id: "peer-b", name: "Peer B" },
      ],
    });

    const signalCalls = invokeMock.mock.calls.filter(
      ([command]) => command === "send_call_signal",
    );
    const callId = signalCalls[0]?.[1]?.callId as string;
    const handler = listenHandlers.get("call-signal");
    expect(handler).toBeTypeOf("function");

    handler?.({
      payload: {
        senderId: "peer-a",
        callId,
        signal: {
          type: "end",
          reason: "Left the call",
        },
      },
    });

    await Promise.resolve();
    let state = get(callStore);
    expect(state.activeCall?.participants.get("peer-a")?.status).toBe("left");
    expect(state.activeCall?.status).not.toBe("ended");

    handler?.({
      payload: {
        senderId: "peer-b",
        callId,
        signal: {
          type: "end",
          reason: "Left the call",
        },
      },
    });

    await Promise.resolve();
    state = get(callStore);
    expect(state.activeCall?.status).toBe("ended");

    callStore.reset();
  });

  it("handles remote errors by ending the call", async () => {
    const { callStore } = await import("$lib/features/calls/stores/callStore");

    await callStore.startCall({
      chatId: "peer-error",
      chatName: "Peer Error",
      chatType: "dm",
      type: "voice",
      members: [{ id: "peer-error", name: "Peer Error" }],
    });

    const signalCalls = invokeMock.mock.calls.filter(
      ([command]) => command === "send_call_signal",
    );
    const callId = signalCalls[0]?.[1]?.callId as string;
    const handler = listenHandlers.get("call-signal");
    expect(handler).toBeTypeOf("function");

    handler?.({
      payload: {
        senderId: "peer-error",
        callId,
        signal: {
          type: "error",
          message: "Remote failure",
        },
      },
    });

    await Promise.resolve();
    const state = get(callStore);
    expect(state.activeCall?.status).toBe("error");
    expect(showErrorToastMock).toHaveBeenCalledWith("Remote failure");

    callStore.reset();
  });

  it("rejects calls with no available participants", async () => {
    const { callStore } = await import("$lib/features/calls/stores/callStore");

    groupChatsStore.set(
      new Map([
        [
          "group-empty",
          {
            id: "group-empty",
            name: "Solo Group",
            ownerId: "owner-3",
            createdAt: new Date().toISOString(),
            memberIds: ["self-user"],
          },
        ],
      ]),
    );

    const started = await callStore.startCall({
      chatId: "group-empty",
      chatName: "Solo Group",
      chatType: "group",
      type: "voice",
    });

    expect(started).toBe(false);
    expect(showErrorToastMock).toHaveBeenCalledWith(
      "No participants available to call.",
    );

    callStore.reset();
  });
});
