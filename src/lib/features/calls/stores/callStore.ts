import { writable, get } from "svelte/store";
import { toasts } from "$lib/stores/ToastStore";
import { getInvoke, getListen, type InvokeFn } from "$lib/services/tauri";

const isBrowser = typeof window !== "undefined";

export type CallType = "voice" | "video";
export type CallStatus =
  | "idle"
  | "initializing"
  | "connecting"
  | "in-call"
  | "ending"
  | "ended"
  | "error";

export interface ActiveCall {
  chatId: string;
  chatName: string;
  type: CallType;
  status: CallStatus;
  startedAt: number;
  connectedAt: number | null;
  endedAt: number | null;
  endReason?: string;
  error?: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  callId: string;
  direction: "incoming" | "outgoing";
  peerId: string;
  peerConnection: RTCPeerConnection | null;
}

interface CallState {
  activeCall: ActiveCall | null;
  deviceAvailability: {
    audioInput: boolean;
    videoInput: boolean;
  };
  permissions: {
    audio: PermissionState | "unknown";
    video: PermissionState | "unknown";
    checking: boolean;
  };
  showCallModal: boolean;
}

type OfferSignal = {
  type: "offer";
  sdp: string;
  callType: CallType;
  chatName?: string | null;
};

type AnswerSignal = {
  type: "answer";
  sdp: string;
};

type IceCandidateSignal = {
  type: "ice-candidate";
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
};

type EndSignal = {
  type: "end";
  reason?: string | null;
};

type ErrorSignal = {
  type: "error";
  message: string;
};

type SignalPayload =
  | OfferSignal
  | AnswerSignal
  | IceCandidateSignal
  | EndSignal
  | ErrorSignal;

interface CallSignalEvent {
  senderId: string;
  callId: string;
  signal: SignalPayload;
}

const INITIAL_STATE: CallState = {
  activeCall: null,
  deviceAvailability: {
    audioInput: false,
    videoInput: false,
  },
  permissions: {
    audio: "unknown",
    video: "unknown",
    checking: false,
  },
  showCallModal: false,
};

const STATUS_CLEAR_DELAY = 6000;
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch (error) {
      console.warn("Failed to stop media track", error);
    }
  });
}

function describeCallStatus(call: ActiveCall | null): string {
  if (!call) return "";
  switch (call.status) {
    case "initializing":
      return "Requesting devices";
    case "connecting":
      return "Connecting";
    case "in-call":
      return "In call";
    case "ending":
      return "Ending call";
    case "ended":
      return call.endReason ?? "Call ended";
    case "error":
      return call.error ?? "Call failed";
    default:
      return "";
  }
}

function createCallStore() {
  const store = writable<CallState>(INITIAL_STATE);
  const { subscribe, update, set } = store;

  let initialized = false;
  let activeStream: MediaStream | null = null;
  let activeRemoteStream: MediaStream | null = null;
  let activePeerConnection: RTCPeerConnection | null = null;
  let pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  let signalUnsubscribe: (() => void) | null = null;
  let invokeFn: InvokeFn | null = null;
  let activeCallId: string | null = null;
  let activePeerId: string | null = null;
  let deviceChangeUnsubscribe: (() => void) | null = null;
  let dismissalTimer: ReturnType<typeof setTimeout> | null = null;

  function clearDismissalTimer() {
    if (dismissalTimer) {
      clearTimeout(dismissalTimer);
      dismissalTimer = null;
    }
  }

  function scheduleDismissal() {
    clearDismissalTimer();
    if (!isBrowser) return;
    dismissalTimer = window.setTimeout(() => {
      update((state) => ({
        ...state,
        showCallModal: false,
        activeCall: null,
      }));
    }, STATUS_CLEAR_DELAY);
  }

  function cleanupPeerConnection() {
    if (activePeerConnection) {
      try {
        activePeerConnection.onicecandidate = null;
        activePeerConnection.ontrack = null;
        activePeerConnection.onconnectionstatechange = null;
        activePeerConnection.close();
      } catch (error) {
        console.warn("Failed to close peer connection", error);
      }
    }
    activePeerConnection = null;
    pendingRemoteCandidates = [];
    activeCallId = null;
    activePeerId = null;
  }

  function cleanupMedia() {
    stopStream(activeStream);
    activeStream = null;
    stopStream(activeRemoteStream);
    activeRemoteStream = null;
    cleanupPeerConnection();
  }

  async function ensureSignalListener() {
    if (!isBrowser) return;
    if (signalUnsubscribe) return;

    const listen = await getListen();
    if (!listen) {
      return;
    }

    try {
      signalUnsubscribe = await listen<{ payload: CallSignalEvent }>(
        "call-signal",
        ({ payload }) => {
          void handleSignal(payload);
        },
      );
    } catch (error) {
      console.error("Failed to listen for call signaling events", error);
    }
  }

  async function ensureInvokeFn(): Promise<InvokeFn | null> {
    if (!isBrowser) {
      return null;
    }
    if (invokeFn) {
      return invokeFn;
    }
    invokeFn = await getInvoke();
    return invokeFn;
  }

  async function sendSignal(
    peerId: string,
    callId: string,
    signal: SignalPayload,
  ): Promise<void> {
    const invoke = await ensureInvokeFn();
    if (!invoke) {
      throw new Error("Signaling service unavailable.");
    }

    await invoke("send_call_signal", {
      recipientId: peerId,
      callId,
      signal,
    });
  }

  async function flushPendingCandidates() {
    if (!activePeerConnection || !activePeerConnection.remoteDescription) {
      return;
    }

    const candidates = [...pendingRemoteCandidates];
    pendingRemoteCandidates = [];

    for (const candidate of candidates) {
      try {
        await activePeerConnection.addIceCandidate(candidate);
      } catch (error) {
        console.warn("Failed to add pending ICE candidate", error);
      }
    }
  }

  function completeCall({
    status,
    reason,
    error,
    notifyRemote,
  }: {
    status: CallStatus;
    reason?: string;
    error?: string;
    notifyRemote: boolean;
  }) {
    const state = get(store);
    const current = state.activeCall;
    if (!current) {
      return;
    }

    const peerId = current.peerId;
    const callId = current.callId;

    if (notifyRemote && peerId && callId) {
      const payload: EndSignal = {
        type: "end",
        reason: reason ?? null,
      };
      void (async () => {
        try {
          await sendSignal(peerId, callId, payload);
        } catch (err) {
          console.warn("Failed to notify remote peer about call termination", err);
        }
      })();
    }

    cleanupMedia();

    update((next) => {
      if (!next.activeCall) {
        return next;
      }
      return {
        ...next,
        showCallModal: false,
        activeCall: {
          ...next.activeCall,
          status,
          endReason: reason ?? next.activeCall.endReason,
          error: error,
          endedAt: Date.now(),
          localStream: null,
          remoteStream: null,
          peerConnection: null,
        },
      };
    });

    if (status === "error" && error) {
      toasts.showErrorToast(error);
    } else if (status === "ended" && reason) {
      toasts.addToast(reason, "info");
    }

    scheduleDismissal();
  }

  function createPeerConnection(peerId: string, callId: string) {
    cleanupPeerConnection();

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    activePeerConnection = pc;
    activePeerId = peerId;
    activeCallId = callId;
    pendingRemoteCandidates = [];

    pc.onicecandidate = (event) => {
      if (!event.candidate || !activePeerId || !activeCallId) {
        return;
      }
      const candidateInit = event.candidate.toJSON
        ? event.candidate.toJSON()
        : {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid ?? null,
            sdpMLineIndex: event.candidate.sdpMLineIndex ?? null,
          };

      if (!candidateInit.candidate) {
        return;
      }

      const payload: IceCandidateSignal = {
        type: "ice-candidate",
        candidate: candidateInit.candidate,
        sdpMid: candidateInit.sdpMid ?? null,
        sdpMLineIndex:
          candidateInit.sdpMLineIndex === undefined
            ? null
            : candidateInit.sdpMLineIndex,
      };

      void (async () => {
        try {
          await sendSignal(activePeerId!, activeCallId!, payload);
        } catch (err) {
          console.warn("Failed to send ICE candidate", err);
        }
      })();
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      const remote = stream ?? new MediaStream([event.track]);
      activeRemoteStream = remote;
      remote.getTracks().forEach((track) => {
        track.onended = () => {
          if (activeRemoteStream === remote) {
            stopStream(activeRemoteStream);
            activeRemoteStream = null;
            update((state) => {
              if (!state.activeCall || state.activeCall.callId !== callId) {
                return state;
              }
              return {
                ...state,
                activeCall: {
                  ...state.activeCall,
                  remoteStream: null,
                },
              };
            });
          }
        };
      });

      update((state) => {
        if (!state.activeCall || state.activeCall.callId !== callId) {
          return state;
        }
        return {
          ...state,
          activeCall: {
            ...state.activeCall,
            remoteStream: remote,
          },
        };
      });
    };

    pc.onconnectionstatechange = () => {
      const connectionState = pc.connectionState;
      if (connectionState === "connected") {
        update((state) => {
          if (!state.activeCall || state.activeCall.callId !== callId) {
            return state;
          }
          if (state.activeCall.status === "in-call") {
            return state;
          }
          return {
            ...state,
            activeCall: {
              ...state.activeCall,
              status: "in-call",
              connectedAt: state.activeCall.connectedAt ?? Date.now(),
            },
          };
        });
      } else if (connectionState === "failed") {
        completeCall({
          status: "error",
          error: "Call connection failed.",
          reason: "Call connection failed.",
          notifyRemote: false,
        });
      } else if (connectionState === "disconnected") {
        completeCall({
          status: "ended",
          reason: "Call disconnected.",
          notifyRemote: false,
        });
      }
    };

    update((state) => {
      if (!state.activeCall || state.activeCall.callId !== callId) {
        return state;
      }
      return {
        ...state,
        activeCall: {
          ...state.activeCall,
          peerConnection: pc,
        },
      };
    });

    return pc;
  }

  async function refreshPermissions() {
    if (!isBrowser) return;
    if (!navigator.permissions?.query) {
      update((state) => ({
        ...state,
        permissions: { ...state.permissions, checking: false },
      }));
      return;
    }

    update((state) => ({
      ...state,
      permissions: { ...state.permissions, checking: true },
    }));

    try {
      const [audio, video] = await Promise.all([
        navigator.permissions
          .query({ name: "microphone" as PermissionName })
          .then((status) => status.state)
          .catch(() => "prompt"),
        navigator.permissions
          .query({ name: "camera" as PermissionName })
          .then((status) => status.state)
          .catch(() => "prompt"),
      ]);
      update((state) => ({
        ...state,
        permissions: {
          audio,
          video,
          checking: false,
        },
      }));
    } catch (error) {
      console.warn("Failed to query media permissions", error);
      update((state) => ({
        ...state,
        permissions: { ...state.permissions, checking: false },
      }));
    }
  }

  async function refreshDevices() {
    if (!isBrowser) return;
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInput = devices.some((device) => device.kind === "audioinput");
      const videoInput = devices.some((device) => device.kind === "videoinput");
      update((state) => ({
        ...state,
        deviceAvailability: {
          audioInput,
          videoInput,
        },
      }));
    } catch (error) {
      console.warn("Failed to enumerate media devices", error);
    }
  }

  async function initialize() {
    if (!isBrowser || initialized) return;
    initialized = true;
    await Promise.all([refreshPermissions(), refreshDevices()]);

    if (navigator.mediaDevices?.addEventListener) {
      const handleDeviceChange = () => {
        refreshDevices();
      };
      navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
      deviceChangeUnsubscribe = () => {
        navigator.mediaDevices.removeEventListener(
          "devicechange",
          handleDeviceChange,
        );
      };
    }

    void ensureSignalListener();
  }

  async function requestUserMedia(type: CallType): Promise<MediaStream> {
    if (!isBrowser || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Media devices are not supported in this environment.");
    }

    const constraints: MediaStreamConstraints =
      type === "video"
        ? {
            audio: { echoCancellation: true },
            video: { facingMode: "user" },
          }
        : {
            audio: { echoCancellation: true },
            video: false,
          };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      update((state) => ({
        ...state,
        permissions: {
          audio: "granted",
          video: type === "video" ? "granted" : state.permissions.video,
          checking: false,
        },
      }));
      return stream;
    } catch (err) {
      const error = err as DOMException | Error;
      update((state) => ({
        ...state,
        permissions: { ...state.permissions, checking: false },
      }));

      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError") {
          update((state) => ({
            ...state,
            permissions: {
              audio: "denied",
              video: type === "video" ? "denied" : state.permissions.video,
              checking: false,
            },
          }));
          throw new Error(
            type === "video"
              ? "Camera and microphone permissions are required to start a video call."
              : "Microphone permission is required to start a voice call.",
          );
        }
        if (error.name === "NotFoundError") {
          update((state) => ({
            ...state,
            deviceAvailability: {
              audioInput: false,
              videoInput:
                type === "video"
                  ? false
                  : state.deviceAvailability.videoInput,
            },
          }));
          throw new Error(
            type === "video"
              ? "No camera or microphone devices were found."
              : "No microphone devices were found.",
          );
        }
      }

      throw error instanceof Error
        ? error
        : new Error("Unable to access media devices.");
    }
  }

  function canStartCall(type: CallType, chatId: string | null | undefined) {
    if (!chatId) return false;
    const state = get(store);
    const { activeCall, deviceAvailability, permissions } = state;

    const isActiveElsewhere =
      activeCall &&
      activeCall.chatId !== chatId &&
      activeCall.status !== "ended" &&
      activeCall.status !== "error";

    if (isActiveElsewhere) {
      return false;
    }

    if (permissions.checking) {
      return false;
    }

    if (!deviceAvailability.audioInput) {
      return false;
    }

    if (permissions.audio === "denied") {
      return false;
    }

    if (type === "video") {
      if (!deviceAvailability.videoInput) {
        return false;
      }
      if (permissions.video === "denied") {
        return false;
      }
    }

    return true;
  }

  async function startCall({
    chatId,
    chatName,
    type,
  }: {
    chatId: string;
    chatName: string;
    type: CallType;
  }) {
    if (!isBrowser) {
      toasts.addToast("Calls are only available in the desktop app.", "warning");
      return false;
    }

    await initialize();
    await ensureSignalListener();

    if (!canStartCall(type, chatId)) {
      const state = get(store);
      if (
        state.permissions.audio === "denied" ||
        (type === "video" && state.permissions.video === "denied")
      ) {
        toasts.showErrorToast(
          type === "video"
            ? "Camera and microphone permissions are required to start a video call."
            : "Microphone permission is required to start a voice call.",
        );
      } else if (!state.deviceAvailability.audioInput) {
        toasts.showErrorToast("No microphone detected.");
      } else if (type === "video" && !state.deviceAvailability.videoInput) {
        toasts.showErrorToast("No camera detected.");
      } else if (
        state.activeCall &&
        state.activeCall.chatId !== chatId &&
        state.activeCall.status !== "ended" &&
        state.activeCall.status !== "error"
      ) {
        toasts.addToast("Finish your current call before starting a new one.", "warning");
      }
      return false;
    }

    if (!(await ensureInvokeFn())) {
      toasts.showErrorToast("Call signaling is unavailable.");
      return false;
    }

    clearDismissalTimer();

    const state = get(store);
    if (
      state.activeCall &&
      state.activeCall.chatId === chatId &&
      state.activeCall.status !== "ended" &&
      state.activeCall.status !== "error"
    ) {
      update((next) => ({ ...next, showCallModal: true }));
      return true;
    }

    const callId =
      typeof window !== "undefined" && window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    update((next) => ({
      ...next,
      showCallModal: true,
      activeCall: {
        chatId,
        chatName,
        type,
        status: "initializing",
        startedAt: Date.now(),
        connectedAt: null,
        endedAt: null,
        endReason: undefined,
        error: undefined,
        localStream: null,
        remoteStream: null,
        callId,
        direction: "outgoing",
        peerId: chatId,
        peerConnection: null,
      },
    }));

    toasts.addToast(
      type === "video" ? "Starting video call..." : "Starting voice call...",
      "info",
    );

    try {
      const stream = await requestUserMedia(type);
      activeStream = stream;

      const pc = createPeerConnection(chatId, callId);

      update((next) => {
        if (!next.activeCall || next.activeCall.callId !== callId) {
          stopStream(stream);
          return next;
        }
        return {
          ...next,
          activeCall: {
            ...next.activeCall,
            status: "connecting",
            localStream: stream,
          },
        };
      });

      stream.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, stream);
        } catch (err) {
          console.warn("Failed to add track to peer connection", err);
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (!offer.sdp) {
        throw new Error("Failed to generate offer SDP.");
      }

      await sendSignal(chatId, callId, {
        type: "offer",
        sdp: offer.sdp,
        callType: type,
        chatName,
      });

      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to start the call.";
      cleanupMedia();

      update((next) => {
        if (!next.activeCall || next.activeCall.callId !== callId) {
          return next;
        }
        return {
          ...next,
          activeCall: {
            ...next.activeCall,
            status: "error",
            error: message,
            endReason: message,
            endedAt: Date.now(),
            localStream: null,
            remoteStream: null,
            peerConnection: null,
          },
        };
      });

      toasts.showErrorToast(message);
      scheduleDismissal();
      return false;
    }
  }

  async function handleSignal({ senderId, callId, signal }: CallSignalEvent) {
    switch (signal.type) {
      case "offer":
        await handleIncomingOffer(senderId, callId, signal);
        break;
      case "answer":
        await handleAnswerSignal(callId, signal);
        break;
      case "ice-candidate":
        await handleCandidateSignal(callId, signal);
        break;
      case "end":
        handleRemoteEnd(callId, signal.reason ?? undefined);
        break;
      case "error":
        handleRemoteError(callId, signal.message);
        break;
      default:
        break;
    }
  }

  async function handleIncomingOffer(
    senderId: string,
    callId: string,
    signal: OfferSignal,
  ) {
    if (!isBrowser) {
      return;
    }

    const type: CallType = signal.callType === "video" ? "video" : "voice";
    const state = get(store);
    const active = state.activeCall;

    if (
      active &&
      active.callId !== callId &&
      active.status !== "ended" &&
      active.status !== "error"
    ) {
      try {
        await sendSignal(senderId, callId, {
          type: "error",
          message: "User is currently busy in another call.",
        });
      } catch (err) {
        console.warn("Failed to send busy response", err);
      }
      toasts.addToast("Incoming call received while busy.", "warning");
      return;
    }

    if (!(await ensureInvokeFn())) {
      toasts.showErrorToast("Unable to answer call: signaling unavailable.");
      return;
    }

    clearDismissalTimer();

    update((next) => ({
      ...next,
      showCallModal: true,
      activeCall: {
        chatId: senderId,
        chatName: signal.chatName ?? senderId,
        type,
        status: "initializing",
        startedAt: Date.now(),
        connectedAt: null,
        endedAt: null,
        endReason: undefined,
        error: undefined,
        localStream: null,
        remoteStream: null,
        callId,
        direction: "incoming",
        peerId: senderId,
        peerConnection: null,
      },
    }));

    toasts.addToast(
      type === "video"
        ? `Incoming video call from ${signal.chatName ?? senderId}`
        : `Incoming voice call from ${signal.chatName ?? senderId}`,
      "info",
    );

    try {
      const stream = await requestUserMedia(type);
      activeStream = stream;

      const pc = createPeerConnection(senderId, callId);

      update((next) => {
        if (!next.activeCall || next.activeCall.callId !== callId) {
          stopStream(stream);
          return next;
        }
        return {
          ...next,
          activeCall: {
            ...next.activeCall,
            status: "connecting",
            localStream: stream,
          },
        };
      });

      stream.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, stream);
        } catch (err) {
          console.warn("Failed to add track to peer connection", err);
        }
      });

      await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (!answer.sdp) {
        throw new Error("Failed to generate answer SDP.");
      }

      await sendSignal(senderId, callId, {
        type: "answer",
        sdp: answer.sdp,
      });

      await flushPendingCandidates();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to answer the call.";
      try {
        await sendSignal(senderId, callId, {
          type: "error",
          message,
        });
      } catch (err) {
        console.warn("Failed to send call error response", err);
      }
      cleanupMedia();
      update((next) => {
        if (!next.activeCall || next.activeCall.callId !== callId) {
          return next;
        }
        return {
          ...next,
          activeCall: {
            ...next.activeCall,
            status: "error",
            error: message,
            endReason: message,
            endedAt: Date.now(),
            localStream: null,
            remoteStream: null,
            peerConnection: null,
          },
        };
      });
      toasts.showErrorToast(message);
      scheduleDismissal();
    }
  }

  async function handleAnswerSignal(callId: string, signal: AnswerSignal) {
    if (!activePeerConnection || activeCallId !== callId) {
      return;
    }

    try {
      await activePeerConnection.setRemoteDescription({
        type: "answer",
        sdp: signal.sdp,
      });
      await flushPendingCandidates();
      update((state) => {
        if (!state.activeCall || state.activeCall.callId !== callId) {
          return state;
        }
        return {
          ...state,
          activeCall: {
            ...state.activeCall,
            status: state.activeCall.status === "initializing"
              ? "connecting"
              : state.activeCall.status,
          },
        };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to process call answer.";
      completeCall({
        status: "error",
        error: message,
        reason: message,
        notifyRemote: false,
      });
    }
  }

  async function handleCandidateSignal(
    callId: string,
    signal: IceCandidateSignal,
  ) {
    if (activeCallId !== callId) {
      return;
    }

    if (!signal.candidate) {
      return;
    }

    const candidate: RTCIceCandidateInit = {
      candidate: signal.candidate,
      sdpMid: signal.sdpMid ?? undefined,
      sdpMLineIndex: signal.sdpMLineIndex ?? undefined,
    };

    if (activePeerConnection && activePeerConnection.remoteDescription) {
      try {
        await activePeerConnection.addIceCandidate(candidate);
      } catch (error) {
        console.warn("Failed to add remote ICE candidate", error);
      }
    } else {
      pendingRemoteCandidates.push(candidate);
    }
  }

  function handleRemoteEnd(callId: string, reason?: string) {
    const state = get(store);
    if (!state.activeCall || state.activeCall.callId !== callId) {
      return;
    }

    completeCall({
      status: "ended",
      reason: reason ?? "Call ended by remote.",
      notifyRemote: false,
    });
  }

  function handleRemoteError(callId: string, message: string) {
    const state = get(store);
    if (!state.activeCall || state.activeCall.callId !== callId) {
      return;
    }

    completeCall({
      status: "error",
      error: message,
      reason: message,
      notifyRemote: false,
    });
  }

  function endCall(reason = "Call ended") {
    const state = get(store);
    if (!state.activeCall) {
      return;
    }

    completeCall({
      status: "ended",
      reason,
      notifyRemote: true,
    });
  }

  function setCallModalOpen(open: boolean) {
    update((state) => ({
      ...state,
      showCallModal: open,
    }));
  }

  function dismissCall() {
    cleanupMedia();
    clearDismissalTimer();
    update((state) => ({
      ...state,
      showCallModal: false,
      activeCall: null,
    }));
  }

  function reset() {
    clearDismissalTimer();
    cleanupMedia();
    deviceChangeUnsubscribe?.();
    signalUnsubscribe?.();
    signalUnsubscribe = null;
    invokeFn = null;
    initialized = false;
    set(INITIAL_STATE);
  }

  return {
    subscribe,
    initialize,
    refreshDevices,
    refreshPermissions,
    canStartCall,
    startCall,
    endCall,
    setCallModalOpen,
    dismissCall,
    describeStatus: (call: ActiveCall | null) => describeCallStatus(call),
    reset,
  };
}

export const callStore = createCallStore();
export { describeCallStatus };
export type { CallState };
