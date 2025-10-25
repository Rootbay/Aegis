import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

const {
  invokeMock,
  listenMock,
  listenHandlers,
  addToastMock,
  showErrorToastMock,
} = vi.hoisted(() => {
  const handlers = new Map<string, (event: { payload: unknown }) => void>();
  const invoke = vi.fn(async () => undefined);
  const listen = vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
    handlers.set(event, handler);
    return () => handlers.delete(event);
  });
  const addToast = vi.fn();
  const showErrorToast = vi.fn();
  return {
    invokeMock: invoke,
    listenMock: listen,
    listenHandlers: handlers,
    addToastMock: addToast,
    showErrorToastMock: showErrorToast,
  };
});

class MockMediaStream {
  private tracks: MediaStreamTrack[];

  constructor(tracks: MediaStreamTrack[] = []) {
    this.tracks = tracks;
  }

  getTracks() {
    return this.tracks;
  }
}

class MockRTCPeerConnection {
  static lastInstance: MockRTCPeerConnection | null = null;

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
    addToast: (...args: Parameters<typeof addToastMock>) => addToastMock(...args),
    showErrorToast: (...args: Parameters<typeof showErrorToastMock>) =>
      showErrorToastMock(...args),
  },
}));

describe("callStore signaling", () => {
  const audioTrack = { stop: vi.fn(), kind: "audio" } as unknown as MediaStreamTrack;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    invokeMock.mockReset();
    listenMock.mockReset();
    listenHandlers.clear();
    addToastMock.mockReset();
    showErrorToastMock.mockReset();

    globalThis.MediaStream = MockMediaStream;
    globalThis.RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection;

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

  it("creates an offer and sends it via the signaling channel", async () => {
    const { callStore } = await import("$lib/features/calls/stores/callStore");

    const started = await callStore.startCall({
      chatId: "peer-1",
      chatName: "Peer One",
      type: "voice",
    });

    expect(started).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith(
      "send_call_signal",
      expect.objectContaining({
        recipientId: "peer-1",
        callId: "test-call-id",
        signal: expect.objectContaining({
          type: "offer",
          sdp: "offer-sdp",
          callType: "voice",
          chatName: "Peer One",
        }),
      }),
    );
    expect(MockRTCPeerConnection.lastInstance?.createOffer).toHaveBeenCalled();

    callStore.reset();
  });

  it("applies remote answers and pending ICE candidates", async () => {
    const { callStore } = await import("$lib/features/calls/stores/callStore");

    await callStore.startCall({
      chatId: "peer-2",
      chatName: "Peer Two",
      type: "voice",
    });

    const payload = invokeMock.mock.calls[0]?.[1] as {
      callId: string;
    };
    expect(payload).toBeTruthy();
    const callId = payload.callId;

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
    expect(MockRTCPeerConnection.lastInstance?.addIceCandidate).not.toHaveBeenCalled();

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

    expect(MockRTCPeerConnection.lastInstance?.setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "answer-sdp",
    });
    expect(MockRTCPeerConnection.lastInstance?.addIceCandidate).toHaveBeenCalledWith({
      candidate: "candidate-1",
      sdpMid: "0",
      sdpMLineIndex: 0,
    });

    callStore.reset();
  });

  it("marks the call ended when the remote peer hangs up", async () => {
    const { callStore } = await import("$lib/features/calls/stores/callStore");

    await callStore.startCall({
      chatId: "peer-3",
      chatName: "Peer Three",
      type: "voice",
    });

    const payload = invokeMock.mock.calls[0]?.[1] as {
      callId: string;
    };
    const callId = payload.callId;
    const handler = listenHandlers.get("call-signal");

    handler?.({
      payload: {
        senderId: "peer-3",
        callId,
        signal: {
          type: "end",
          reason: "Remote ended",
        },
      },
    });

    await Promise.resolve();

    const state = get(callStore);
    expect(state.activeCall?.status).toBe("ended");
    expect(state.activeCall?.endReason).toBe("Remote ended");

    callStore.reset();
  });
});
