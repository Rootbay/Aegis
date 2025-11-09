import { writable, get } from "svelte/store";
import { toasts } from "$lib/stores/ToastStore";
import { getInvoke, getListen, type InvokeFn } from "$lib/services/tauri";
import { groupChats } from "$lib/features/chat/stores/chatStore";
import { serverStore } from "$lib/features/servers/stores/serverStore";
import { userStore } from "$lib/stores/userStore";
import { settings } from "$lib/features/settings/stores/settings";
import { getIceServersFromConfig } from "$lib/features/calls/utils/iceServers";
import { voicePresenceStore } from "./voicePresenceStore";

const isBrowser = typeof window !== "undefined";

export type CallType = "voice" | "video";
export type CallStatus =
  | "idle"
  | "ringing"
  | "initializing"
  | "connecting"
  | "in-call"
  | "ending"
  | "ended"
  | "error";

export type ParticipantStatus =
  | "invited"
  | "connecting"
  | "connected"
  | "disconnected"
  | "left"
  | "error";

export interface CallParticipant {
  userId: string;
  name?: string;
  status: ParticipantStatus;
  remoteStream: MediaStream | null;
  screenShareStream: MediaStream | null;
  isScreenSharing: boolean;
  peerConnection: RTCPeerConnection | null;
  error?: string;
  joinedAt: number | null;
  direction: "incoming" | "outgoing";
}

export type CallChatType = "dm" | "group" | "channel";

export interface ActiveCall {
  chatId: string;
  chatName: string;
  chatType: CallChatType;
  type: CallType;
  status: CallStatus;
  startedAt: number;
  connectedAt: number | null;
  endedAt: number | null;
  endReason?: string;
  error?: string;
  localStream: MediaStream | null;
  callId: string;
  direction: "incoming" | "outgoing";
  participants: Map<string, CallParticipant>;
  serverId: string | null;
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
  localMedia: {
    audioEnabled: boolean;
    videoEnabled: boolean;
    audioAvailable: boolean;
    videoAvailable: boolean;
    screenSharing: boolean;
    screenShareAvailable: boolean;
  };
  showCallModal: boolean;
}

type OfferSignal = {
  type: "offer";
  sdp: string;
  callType: CallType;
  chatName?: string | null;
  chatId?: string | null;
  chatType?: CallChatType | null;
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
  localMedia: {
    audioEnabled: true,
    videoEnabled: true,
    audioAvailable: false,
    videoAvailable: false,
    screenSharing: false,
    screenShareAvailable: false,
  },
  showCallModal: false,
};

const STATUS_CLEAR_DELAY = 6000;

function resolveServerIdForChannel(channelId: string | null | undefined): string | null {
  if (!channelId) {
    return null;
  }
  const { servers } = get(serverStore);
  for (const server of servers) {
    if ((server.channels ?? []).some((channel) => channel.id === channelId)) {
      return server.id;
    }
  }
  return null;
}

function resolveIceServers(): RTCIceServer[] {
  const currentSettings = get(settings);
  const turnServers = currentSettings.turnServers ?? [];
  return getIceServersFromConfig(turnServers);
}

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
    case "ringing":
      return "Incoming call";
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

type InternalParticipant = CallParticipant & {
  pendingCandidates: RTCIceCandidateInit[];
};

interface InviteeInfo {
  id: string;
  name?: string;
}

function createCallStore() {
  const store = writable<CallState>(INITIAL_STATE);
  const { subscribe, update, set } = store;

  let initialized = false;
  let activeStream: MediaStream | null = null;
  let screenShareStream: MediaStream | null = null;
  let screenShareSenders = new Map<string, RTCRtpSender[]>();
  let signalUnsubscribe: (() => void) | null = null;
  let invokeFn: InvokeFn | null = null;
  let activeCallId: string | null = null;
  let deviceChangeUnsubscribe: (() => void) | null = null;
  let dismissalTimer: number | null = null;
  let participantStates = new Map<string, InternalParticipant>();
  let pendingIncomingOffer: {
    senderId: string;
    callId: string;
    signal: OfferSignal;
  } | null = null;

  function syncLocalMediaState(stream: MediaStream | null) {
    const audioTracks = stream?.getAudioTracks() ?? [];
    const videoTracks = stream?.getVideoTracks() ?? [];

    const audioEnabled = audioTracks.some((track) => track.enabled !== false);
    const videoEnabled = videoTracks.some((track) => track.enabled !== false);

    update((state) => ({
      ...state,
      localMedia: {
        ...state.localMedia,
        audioEnabled,
        videoEnabled,
        audioAvailable: audioTracks.length > 0,
        videoAvailable: videoTracks.length > 0,
      },
    }));
  }

  function syncScreenShareState(active: boolean) {
    update((state) => ({
      ...state,
      localMedia: {
        ...state.localMedia,
        screenSharing: active,
      },
    }));
  }

  function updateScreenShareAvailability() {
    const available =
      isBrowser &&
      typeof navigator.mediaDevices?.getDisplayMedia === "function";
    update((state) => ({
      ...state,
      localMedia: {
        ...state.localMedia,
        screenShareAvailable: available,
      },
    }));
  }

  function clearDismissalTimer() {
    if (dismissalTimer !== null) {
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

  function publishParticipants() {
    update((state) => {
      if (!state.activeCall) {
        return state;
      }
      const participants = new Map<string, CallParticipant>();
      participantStates.forEach((participant, id) => {
        const { pendingCandidates: _pending, ...rest } = participant;
        participants.set(id, { ...rest });
      });
      return {
        ...state,
        activeCall: {
          ...state.activeCall,
          participants,
        },
      };
    });
    syncCallStatus();
  }

  function mutateParticipant(
    peerId: string,
    mutator: (
      participant: InternalParticipant | null,
    ) => InternalParticipant | null,
  ) {
    const current = participantStates.get(peerId) ?? null;
    const clone = current
      ? { ...current, pendingCandidates: [...current.pendingCandidates] }
      : null;
    const next = mutator(clone);
    if (next) {
      participantStates.set(peerId, next);
    } else {
      participantStates.delete(peerId);
    }
    publishParticipants();
  }

  function cleanupParticipant(peerId: string) {
    const existing = participantStates.get(peerId);
    const active = get(store).activeCall;
    if (
      active &&
      active.chatType === "channel" &&
      active.type === "voice"
    ) {
      voicePresenceStore.markParticipantLeft({
        channelId: active.chatId,
        participantId: peerId,
      });
    }
    if (!existing) {
      return;
    }
    try {
      if (existing.peerConnection) {
        existing.peerConnection.onicecandidate = null;
        existing.peerConnection.ontrack = null;
        existing.peerConnection.onconnectionstatechange = null;
        existing.peerConnection.close();
      }
    } catch (error) {
      console.warn("Failed to close peer connection", error);
    }
    stopStream(existing.remoteStream);
    stopStream(existing.screenShareStream);
    const senders = screenShareSenders.get(peerId) ?? [];
    if (existing.peerConnection && senders.length) {
      senders.forEach((sender) => {
        try {
          existing.peerConnection?.removeTrack(sender);
        } catch (error) {
          console.warn("Failed to remove screen share sender", error);
        }
      });
    }
    screenShareSenders.delete(peerId);
    mutateParticipant(peerId, (participant) => {
      if (!participant) {
        return participant;
      }
      participant.peerConnection = null;
      participant.remoteStream = null;
      participant.screenShareStream = null;
      participant.isScreenSharing = false;
      participant.pendingCandidates = [];
      return participant;
    });
  }

  function cleanupAllParticipants() {
    participantStates.forEach((participant, peerId) => {
      try {
        if (participant.peerConnection) {
          participant.peerConnection.onicecandidate = null;
          participant.peerConnection.ontrack = null;
          participant.peerConnection.onconnectionstatechange = null;
          participant.peerConnection.close();
        }
      } catch (error) {
        console.warn("Failed to close peer connection", error);
      }
      stopStream(participant.remoteStream);
      stopStream(participant.screenShareStream);
      participantStates.set(peerId, {
        ...participant,
        peerConnection: null,
        remoteStream: null,
        screenShareStream: null,
        isScreenSharing: false,
        pendingCandidates: [],
      });
    });
    participantStates.clear();
    screenShareSenders.clear();
    activeCallId = null;
    pendingIncomingOffer = null;
    update((state) => {
      if (!state.activeCall) {
        return state;
      }
      return {
        ...state,
        activeCall: {
          ...state.activeCall,
          participants: new Map(),
        },
      };
    });
  }

  function hasActiveParticipants() {
    for (const participant of participantStates.values()) {
      if (
        participant.status === "invited" ||
        participant.status === "connecting" ||
        participant.status === "connected"
      ) {
        return true;
      }
    }
    return false;
  }

  function syncCallStatus() {
    update((state) => {
      const call = state.activeCall;
      if (!call) {
        return state;
      }
      if (
        call.status === "ringing" ||
        call.status === "ended" ||
        call.status === "ending" ||
        call.status === "error"
      ) {
        return state;
      }
      const participants = Array.from(participantStates.values());
      const hasConnected = participants.some((p) => p.status === "connected");
      const hasConnecting = participants.some(
        (p) => p.status === "connecting" || p.status === "invited",
      );
      let nextStatus: CallStatus = call.status;
      let nextConnectedAt = call.connectedAt;
      if (hasConnected) {
        nextStatus = "in-call";
        if (!nextConnectedAt) {
          const joinedAt = participants
            .map((p) => p.joinedAt)
            .filter((value): value is number => typeof value === "number")
            .sort((a, b) => a - b)[0];
          nextConnectedAt = joinedAt ?? Date.now();
        }
      } else if (hasConnecting) {
        nextStatus = "connecting";
      }
      if (nextStatus !== call.status || nextConnectedAt !== call.connectedAt) {
        return {
          ...state,
          activeCall: {
            ...call,
            status: nextStatus,
            connectedAt: nextConnectedAt ?? call.connectedAt,
          },
        };
      }
      return state;
    });
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

  async function flushPendingCandidates(peerId: string) {
    const participant = participantStates.get(peerId);
    if (
      !participant?.peerConnection ||
      !participant.peerConnection.remoteDescription
    ) {
      return;
    }
    const candidates = [...participant.pendingCandidates];
    if (!candidates.length) {
      return;
    }
    mutateParticipant(peerId, (next) => {
      if (!next) {
        return next;
      }
      next.pendingCandidates = [];
      return next;
    });

    for (const candidate of candidates) {
      try {
        await participant.peerConnection.addIceCandidate(candidate);
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

    if (notifyRemote) {
      const callId = current.callId;
      participantStates.forEach((_participant, peerId) => {
        const payload: EndSignal = {
          type: "end",
          reason: reason ?? null,
        };
        void (async () => {
          try {
            await sendSignal(peerId, callId, payload);
          } catch (err) {
            console.warn(
              "Failed to notify remote participant about call termination",
              err,
            );
          }
        })();
      });
    }

    if (current.chatType === "channel" && current.type === "voice") {
      const meId = get(userStore).me?.id;
      if (meId) {
        voicePresenceStore.markParticipantLeft({
          channelId: current.chatId,
          participantId: meId,
        });
      }
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
          participants: new Map(),
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

  function createPeerConnectionForParticipant(peerId: string, callId: string) {
    const participant = participantStates.get(peerId);
    if (!participant) {
      throw new Error("Unknown participant for call.");
    }

    const pc = new RTCPeerConnection({ iceServers: resolveIceServers() });
    mutateParticipant(peerId, (current) => {
      if (!current) {
        return current;
      }
      current.peerConnection = pc;
      current.pendingCandidates = [];
      return current;
    });

    const activeScreenShare = screenShareStream;
    if (activeScreenShare) {
      const senders: RTCRtpSender[] = [];
      activeScreenShare.getTracks().forEach((track) => {
        try {
          const sender = pc.addTrack(track, activeScreenShare);
          if (sender) {
            senders.push(sender);
          }
        } catch (error) {
          console.warn("Failed to publish screen share track", error);
        }
      });
      if (senders.length) {
        screenShareSenders.set(peerId, senders);
      }
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }
      const candidateInit = event.candidate.toJSON
        ? event.candidate.toJSON()
        : {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid ?? null,
            sdpMLineIndex:
              event.candidate.sdpMLineIndex === undefined
                ? null
                : event.candidate.sdpMLineIndex,
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
          await sendSignal(peerId, callId, payload);
        } catch (err) {
          console.warn("Failed to send ICE candidate", err);
        }
      })();
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      const remote = stream ?? new MediaStream([event.track]);

      const handleTrackEnded = () => {
        mutateParticipant(peerId, (current) => {
          if (!current) {
            return current;
          }
          if (
            current.screenShareStream &&
            current.screenShareStream.id === remote.id
          ) {
            stopStream(current.screenShareStream);
            current.screenShareStream = null;
            current.isScreenSharing = false;
          } else if (
            current.remoteStream &&
            current.remoteStream.id === remote.id
          ) {
            stopStream(current.remoteStream);
            current.remoteStream = null;
          }
          return current;
        });
      };

      if (typeof event.track.addEventListener === "function") {
        event.track.addEventListener("ended", handleTrackEnded);
        event.track.addEventListener("inactive", handleTrackEnded);
      } else {
        event.track.onended = handleTrackEnded;
      }

      mutateParticipant(peerId, (current) => {
        if (!current) {
          return current;
        }

        const existingRemote = current.remoteStream;
        const existingShare = current.screenShareStream;

        const shouldTreatAsScreenShare =
          event.track.kind === "video" &&
          existingRemote &&
          existingRemote.id !== remote.id;

        if (shouldTreatAsScreenShare) {
          if (existingShare && existingShare.id !== remote.id) {
            stopStream(existingShare);
          }
          current.screenShareStream = remote;
          current.isScreenSharing = true;
        } else if (!existingRemote || existingRemote.id === remote.id) {
          current.remoteStream = remote;
        } else {
          current.screenShareStream = remote;
          current.isScreenSharing = event.track.kind === "video";
        }

        return current;
      });
    };

    pc.onconnectionstatechange = () => {
      const connectionState = pc.connectionState;
      if (connectionState === "connected") {
        mutateParticipant(peerId, (current) => {
          if (!current) {
            return current;
          }
          current.status = "connected";
          current.joinedAt = current.joinedAt ?? Date.now();
          current.error = undefined;
          return current;
        });
        const active = get(store).activeCall;
        if (
          active &&
          active.type === "voice" &&
          active.chatType === "channel"
        ) {
          voicePresenceStore.markParticipantJoined({
            channelId: active.chatId,
            serverId: active.serverId,
            participantId: peerId,
            joinedAt: Date.now(),
          });
        }
      } else if (connectionState === "failed") {
        mutateParticipant(peerId, (current) => {
          if (!current) {
            return current;
          }
          current.status = "error";
          current.error = "Call connection failed.";
          return current;
        });
        cleanupParticipant(peerId);
        if (!hasActiveParticipants()) {
          completeCall({
            status: "error",
            error: "Call connection failed.",
            reason: "Call connection failed.",
            notifyRemote: false,
          });
        }
      } else if (connectionState === "disconnected") {
        mutateParticipant(peerId, (current) => {
          if (!current) {
            return current;
          }
          current.status = "disconnected";
          return current;
        });
        const active = get(store).activeCall;
        if (
          active &&
          active.type === "voice" &&
          active.chatType === "channel"
        ) {
          voicePresenceStore.markParticipantLeft({
            channelId: active.chatId,
            participantId: peerId,
          });
        }
        if (!hasActiveParticipants()) {
          completeCall({
            status: "ended",
            reason: "Call disconnected.",
            notifyRemote: false,
          });
        }
      } else if (connectionState === "closed") {
        mutateParticipant(peerId, (current) => {
          if (!current) {
            return current;
          }
          current.status = "left";
          return current;
        });
        cleanupParticipant(peerId);
        if (!hasActiveParticipants()) {
          completeCall({
            status: "ended",
            reason: "Call ended.",
            notifyRemote: false,
          });
        }
      }
    };

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
      const [audio, video]: PermissionState[] = await Promise.all([
        navigator.permissions
          .query({ name: "microphone" as PermissionName })
          .then((status) => status.state as PermissionState)
          .catch((): PermissionState => "prompt"),
        navigator.permissions
          .query({ name: "camera" as PermissionName })
          .then((status) => status.state as PermissionState)
          .catch((): PermissionState => "prompt"),
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
    updateScreenShareAvailability();

    if (navigator.mediaDevices?.addEventListener) {
      const handleDeviceChange = () => {
        refreshDevices();
      };
      navigator.mediaDevices.addEventListener(
        "devicechange",
        handleDeviceChange,
      );
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
                type === "video" ? false : state.deviceAvailability.videoInput,
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

  function canStartCall(
    type: CallType,
    chatId: string | null | undefined,
    chatType: CallChatType,
  ) {
    if (!chatId) return false;
    const state = get(store);
    const { activeCall, deviceAvailability, permissions } = state;

    const isActiveElsewhere =
      activeCall &&
      (activeCall.chatId !== chatId || activeCall.chatType !== chatType) &&
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

  function resolveInvitees({
    chatId,
    chatName,
    chatType,
    serverId,
    members,
  }: {
    chatId: string;
    chatName: string;
    chatType: CallChatType;
    serverId?: string;
    members?: { id: string; name?: string | null }[];
  }): InviteeInfo[] {
    const invitees = new Map<string, InviteeInfo>();
    const addInvitee = (
      id: string | null | undefined,
      name?: string | null,
    ) => {
      if (!id) return;
      const existing = invitees.get(id);
      if (existing) {
        if (!existing.name && name) {
          invitees.set(id, { id, name: name ?? undefined });
        }
        return;
      }
      invitees.set(id, { id, name: name ?? undefined });
    };

    members?.forEach((member) => addInvitee(member.id, member.name));

    if (chatType === "dm") {
      addInvitee(chatId, chatName);
    }

    if (chatType === "group") {
      const summary = get(groupChats).get(chatId);
      summary?.memberIds.forEach((id) => addInvitee(id));
    }

    if (chatType === "channel" && serverId) {
      const { servers } = get(serverStore);
      const server = servers.find((sv) => sv.id === serverId);
      server?.members.forEach((member) => addInvitee(member.id, member.name));
    }

    const me = get(userStore).me;
    if (me) {
      invitees.delete(me.id);
    }

    return Array.from(invitees.values());
  }

  async function joinVoiceChannel({
    chatId,
    chatName,
    serverId,
  }: {
    chatId: string;
    chatName: string;
    serverId?: string | null;
  }) {
    if (!isBrowser) {
      toasts.addToast(
        "Calls are only available in the desktop app.",
        "warning",
      );
      return false;
    }

    await initialize();
    await ensureSignalListener();

    if (!(await ensureInvokeFn())) {
      toasts.showErrorToast("Call signaling is unavailable.");
      return false;
    }

    clearDismissalTimer();

    const state = get(store);

    const resolvedServerId =
      serverId ?? resolveServerIdForChannel(chatId) ?? null;

    if (
      state.activeCall &&
      state.activeCall.chatId === chatId &&
      state.activeCall.chatType === "channel" &&
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

    participantStates = new Map();

    update((next) => ({
      ...next,
      showCallModal: true,
      activeCall: {
        chatId,
        chatName,
        chatType: "channel",
        type: "voice",
        status: "initializing",
        startedAt: Date.now(),
        connectedAt: null,
        endedAt: null,
        endReason: undefined,
        error: undefined,
        localStream: null,
        callId,
        direction: "outgoing",
        participants: new Map(),
        serverId: resolvedServerId,
      },
    }));

    activeCallId = callId;

    try {
      const stream = await requestUserMedia("voice");
      activeStream = stream;
      syncLocalMediaState(activeStream);

      const connectedAt = Date.now();

      update((next) => {
        if (!next.activeCall || next.activeCall.callId !== callId) {
          stopStream(stream);
          return next;
        }
        return {
          ...next,
          activeCall: {
            ...next.activeCall,
            status: "in-call",
            connectedAt,
            localStream: stream,
          },
        };
      });

      const me = get(userStore).me;
      if (me) {
        voicePresenceStore.markParticipantJoined({
          channelId: chatId,
          serverId: resolvedServerId,
          participantId: me.id,
          joinedAt: connectedAt,
          updatedAt: connectedAt,
        });
      }

      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to join the voice channel.";
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
            participants: new Map(),
          },
        };
      });

      toasts.showErrorToast(message);
      scheduleDismissal();
      return false;
    }
  }

  async function startCall({
    chatId,
    chatName,
    type,
    chatType = "dm",
    serverId,
    members,
  }: {
    chatId: string;
    chatName: string;
    type: CallType;
    chatType?: CallChatType;
    serverId?: string;
    members?: { id: string; name?: string | null }[];
  }) {
    if (!isBrowser) {
      toasts.addToast(
        "Calls are only available in the desktop app.",
        "warning",
      );
      return false;
    }

    await initialize();
    await ensureSignalListener();

    if (!canStartCall(type, chatId, chatType)) {
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
        (state.activeCall.chatId !== chatId ||
          state.activeCall.chatType !== chatType) &&
        state.activeCall.status !== "ended" &&
        state.activeCall.status !== "error"
      ) {
        toasts.addToast(
          "Finish your current call before starting a new one.",
          "warning",
        );
      }
      return false;
    }

    if (!(await ensureInvokeFn())) {
      toasts.showErrorToast("Call signaling is unavailable.");
      return false;
    }

    const invitees = resolveInvitees({
      chatId,
      chatName,
      chatType,
      serverId,
      members,
    });
    if (!invitees.length) {
      toasts.showErrorToast("No participants available to call.");
      return false;
    }

    clearDismissalTimer();

    const state = get(store);
    if (
      state.activeCall &&
      state.activeCall.chatId === chatId &&
      state.activeCall.chatType === chatType &&
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

    participantStates = new Map();

    update((next) => ({
      ...next,
      showCallModal: true,
      activeCall: {
        chatId,
        chatName,
        chatType,
        type,
        status: "initializing",
        startedAt: Date.now(),
        connectedAt: null,
        endedAt: null,
        endReason: undefined,
        error: undefined,
        localStream: null,
        callId,
        direction: "outgoing",
        participants: new Map(),
        serverId:
          chatType === "channel"
            ? serverId ?? resolveServerIdForChannel(chatId) ?? null
            : null,
      },
    }));

    activeCallId = callId;

    invitees.forEach((invitee) => {
      mutateParticipant(invitee.id, () => ({
        userId: invitee.id,
        name: invitee.name ?? invitee.id,
        status: "invited",
        remoteStream: null,
        screenShareStream: null,
        isScreenSharing: false,
        peerConnection: null,
        error: undefined,
        joinedAt: null,
        direction: "outgoing",
        pendingCandidates: [],
      }));
    });

    toasts.addToast(
      type === "video" ? "Starting video call..." : "Starting voice call...",
      "info",
    );

    try {
      const stream = await requestUserMedia(type);
      activeStream = stream;
      syncLocalMediaState(activeStream);

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

      const connectionResults = await Promise.allSettled(
        invitees.map(async (invitee) => {
          mutateParticipant(invitee.id, (participant) => {
            if (!participant) {
              return participant;
            }
            participant.status = "connecting";
            participant.direction = "outgoing";
            participant.name = invitee.name ?? participant.name;
            return participant;
          });

          const pc = createPeerConnectionForParticipant(invitee.id, callId);

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

          await sendSignal(invitee.id, callId, {
            type: "offer",
            sdp: offer.sdp,
            callType: type,
            chatName,
            chatId,
            chatType,
          });
        }),
      );

      let successfulConnections = 0;
      connectionResults.forEach((result, index) => {
        const peerId = invitees[index]?.id;
        if (result.status === "fulfilled") {
          successfulConnections += 1;
        } else if (peerId) {
          const message =
            result.reason instanceof Error
              ? result.reason.message
              : "Unable to reach participant.";
          mutateParticipant(peerId, (participant) => {
            if (!participant) {
              return participant;
            }
            participant.status = "error";
            participant.error = message;
            return participant;
          });
        }
      });

      if (successfulConnections === 0) {
        throw new Error("Failed to reach any participants.");
      }

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
            participants: new Map(),
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
        await handleAnswerSignal(senderId, callId, signal);
        break;
      case "ice-candidate":
        await handleCandidateSignal(senderId, callId, signal);
        break;
      case "end":
        handleRemoteEnd(senderId, callId, signal.reason ?? undefined);
        break;
      case "error":
        handleRemoteError(senderId, callId, signal.message);
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
    const chatType: CallChatType = signal.chatType ?? "dm";
    const chatId = signal.chatId ?? (chatType === "dm" ? senderId : senderId);
    const state = get(store);
    const active = state.activeCall;
    const derivedServerId =
      chatType === "channel" ? resolveServerIdForChannel(chatId) : null;

    const isActiveChannelMatch =
      Boolean(active) &&
      active?.chatType === "channel" &&
      chatType === "channel" &&
      active.chatId === chatId;

    if (
      active &&
      active.callId !== callId &&
      active.status !== "ended" &&
      active.status !== "error" &&
      !isActiveChannelMatch
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

    if (isActiveChannelMatch && active?.callId !== callId) {
      activeCallId = callId;
      update((next) => {
        if (!next.activeCall) {
          return next;
        }
        if (
          next.activeCall.chatType === "channel" &&
          next.activeCall.chatId === chatId
        ) {
          return {
            ...next,
            activeCall: {
              ...next.activeCall,
              callId,
            },
          };
        }
        return next;
      });
    }

    if (!(await ensureInvokeFn())) {
      toasts.showErrorToast("Unable to answer call: signaling unavailable.");
      return;
    }

    clearDismissalTimer();

    const isNewCall = !active || active.callId !== callId;

    if (isNewCall) {
      participantStates = new Map();
      update((next) => ({
        ...next,
        showCallModal: true,
        activeCall: {
          chatId,
          chatName: signal.chatName ?? chatId,
          chatType,
          type,
          status: "ringing",
          startedAt: Date.now(),
          connectedAt: null,
          endedAt: null,
          endReason: undefined,
          error: undefined,
          localStream: null,
          callId,
          direction: "incoming",
          participants: new Map(),
          serverId: derivedServerId,
        },
      }));
      activeCallId = callId;
      toasts.addToast(
        type === "video"
          ? `Incoming video call from ${signal.chatName ?? senderId}`
          : `Incoming voice call from ${signal.chatName ?? senderId}`,
        "info",
      );
    } else {
      update((next) => {
        if (!next.activeCall) {
          return next;
        }
        return {
          ...next,
          showCallModal: true,
          activeCall: {
            ...next.activeCall,
            chatId,
            chatName: signal.chatName ?? next.activeCall.chatName,
            chatType,
            status: "ringing",
            localStream: null,
          },
        };
      });
    }

    pendingIncomingOffer = { senderId, callId, signal };

    mutateParticipant(senderId, (participant) => {
      if (participant) {
        participant.status = "invited";
        participant.direction = "incoming";
        participant.name = signal.chatName ?? participant.name ?? senderId;
        return participant;
      }
      return {
        userId: senderId,
        name: signal.chatName ?? senderId,
        status: "invited",
        remoteStream: null,
        screenShareStream: null,
        isScreenSharing: false,
        peerConnection: null,
        error: undefined,
        joinedAt: null,
        direction: "incoming",
        pendingCandidates: [],
      };
    });
  }

  async function acceptCall() {
    if (!isBrowser) {
      return;
    }

    const pending = pendingIncomingOffer;
    const state = get(store);
    const currentCall = state.activeCall;

    if (!pending || !currentCall || currentCall.callId !== pending.callId) {
      return;
    }

    pendingIncomingOffer = null;

    const { senderId, callId, signal } = pending;

    try {
      if (!activeStream) {
        activeStream = await requestUserMedia(currentCall.type);
        syncLocalMediaState(activeStream);
      }
      syncLocalMediaState(activeStream);

      mutateParticipant(senderId, (participant) => {
        if (!participant) {
          return {
            userId: senderId,
            name: signal.chatName ?? senderId,
            status: "connecting",
            remoteStream: null,
            screenShareStream: null,
            isScreenSharing: false,
            peerConnection: null,
            error: undefined,
            joinedAt: null,
            direction: "incoming",
            pendingCandidates: [],
          };
        }
        participant.status = "connecting";
        participant.direction = "incoming";
        return participant;
      });

      update((next) => {
        if (!next.activeCall || next.activeCall.callId !== callId) {
          return next;
        }
        return {
          ...next,
          activeCall: {
            ...next.activeCall,
            status: "connecting",
            localStream: activeStream,
          },
        };
      });

      const pc = createPeerConnectionForParticipant(senderId, callId);
      activeStream?.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, activeStream!);
        } catch (err) {
          console.warn("Failed to add track to peer connection", err);
        }
      });

      await pc.setRemoteDescription({
        type: "offer",
        sdp: signal.sdp,
      });

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (!answer.sdp) {
        throw new Error("Failed to generate answer SDP.");
      }

      await sendSignal(senderId, callId, {
        type: "answer",
        sdp: answer.sdp,
      });

      await flushPendingCandidates(senderId);
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
      cleanupParticipant(senderId);
      mutateParticipant(senderId, (participant) => {
        if (!participant) {
          return participant;
        }
        participant.status = "error";
        participant.error = message;
        return participant;
      });
      if (!hasActiveParticipants()) {
        completeCall({
          status: "error",
          error: message,
          reason: message,
          notifyRemote: false,
        });
      }
    }
  }

  async function rejectCall(reason = "Call declined") {
    const pending = pendingIncomingOffer;
    pendingIncomingOffer = null;

    if (!pending) {
      dismissCall();
      return;
    }

    try {
      await sendSignal(pending.senderId, pending.callId, {
        type: "error",
        message: reason,
      });
    } catch (error) {
      console.warn("Failed to send call rejection signal", error);
    }

    toasts.addToast(reason, "info");
    dismissCall();
  }

  async function handleAnswerSignal(
    senderId: string,
    callId: string,
    signal: AnswerSignal,
  ) {
    if (activeCallId !== callId) {
      return;
    }

    const participant = participantStates.get(senderId);
    if (!participant?.peerConnection) {
      return;
    }

    try {
      await participant.peerConnection.setRemoteDescription({
        type: "answer",
        sdp: signal.sdp,
      });
      mutateParticipant(senderId, (current) => {
        if (!current) {
          return current;
        }
        current.status =
          current.status === "invited" ? "connecting" : current.status;
        return current;
      });
      await flushPendingCandidates(senderId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to process call answer.";
      mutateParticipant(senderId, (current) => {
        if (!current) {
          return current;
        }
        current.status = "error";
        current.error = message;
        return current;
      });
      cleanupParticipant(senderId);
      if (!hasActiveParticipants()) {
        completeCall({
          status: "error",
          error: message,
          reason: message,
          notifyRemote: false,
        });
      }
    }
  }

  async function handleCandidateSignal(
    senderId: string,
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

    const participant = participantStates.get(senderId);
    if (!participant) {
      return;
    }

    if (participant.peerConnection?.remoteDescription) {
      try {
        await participant.peerConnection.addIceCandidate(candidate);
      } catch (error) {
        console.warn("Failed to add remote ICE candidate", error);
      }
    } else {
      mutateParticipant(senderId, (current) => {
        if (!current) {
          return current;
        }
        current.pendingCandidates = [...current.pendingCandidates, candidate];
        return current;
      });
    }
  }

  function handleRemoteEnd(senderId: string, callId: string, reason?: string) {
    if (activeCallId !== callId) {
      return;
    }

    const participant = participantStates.get(senderId);
    if (!participant) {
      return;
    }

    cleanupParticipant(senderId);
    mutateParticipant(senderId, (current) => {
      if (!current) {
        return current;
      }
      current.status = "left";
      current.error = reason ?? undefined;
      return current;
    });

    if (!hasActiveParticipants()) {
      completeCall({
        status: "ended",
        reason: reason ?? "Call ended by remote participant.",
        notifyRemote: false,
      });
    }
  }

  function handleRemoteError(
    senderId: string,
    callId: string,
    message: string,
  ) {
    if (activeCallId !== callId) {
      return;
    }

    const participant = participantStates.get(senderId);
    if (!participant) {
      return;
    }

    cleanupParticipant(senderId);
    mutateParticipant(senderId, (current) => {
      if (!current) {
        return current;
      }
      current.status = "error";
      current.error = message;
      return current;
    });
    toasts.showErrorToast(message);

    if (!hasActiveParticipants()) {
      completeCall({
        status: "error",
        error: message,
        reason: message,
        notifyRemote: false,
      });
    }
  }

  async function startScreenShare(): Promise<boolean> {
    if (!isBrowser) {
      return false;
    }

    const state = get(store);
    const call = state.activeCall;
    if (
      !call ||
      call.status === "ended" ||
      call.status === "ending" ||
      call.status === "error"
    ) {
      toasts.showErrorToast(
        "Screen sharing is only available during an active call.",
      );
      return false;
    }

    if (screenShareStream) {
      return true;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      toasts.showErrorToast("Screen sharing is not supported in this browser.");
      updateScreenShareAvailability();
      return false;
    }

    let stream: MediaStream | null = null;

    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: call.type === "video",
      });

      const shareStream = stream;
      if (!shareStream) {
        toasts.showErrorToast("No screen capture stream was provided.");
        return false;
      }

      if (!shareStream.getTracks().length) {
        stopStream(shareStream);
        toasts.showErrorToast("No screen capture tracks were provided.");
        return false;
      }

      screenShareStream = shareStream;
      screenShareSenders = new Map();

      const handleShareEnded = () => {
        stopScreenShare({ reason: "revoked" });
      };

      shareStream.getTracks().forEach((track) => {
        if (typeof track.addEventListener === "function") {
          track.addEventListener("ended", handleShareEnded);
          track.addEventListener("inactive", handleShareEnded);
        } else {
          track.onended = handleShareEnded;
        }
      });

      participantStates.forEach((participant, peerId) => {
        if (!participant.peerConnection) {
          screenShareSenders.delete(peerId);
          return;
        }
        const senders: RTCRtpSender[] = [];
        shareStream.getTracks().forEach((track) => {
          try {
            const sender = participant.peerConnection?.addTrack(
              track,
              shareStream,
            );
            if (sender) {
              senders.push(sender);
            }
          } catch (error) {
            console.warn("Failed to publish screen share track", error);
          }
        });
        if (senders.length) {
          screenShareSenders.set(peerId, senders);
        }
      });

      syncScreenShareState(true);
      toasts.addToast("Started sharing your screen.", "info");
      return true;
    } catch (error) {
      if (stream) {
        stopStream(stream);
      }
      const message =
        error instanceof DOMException
          ? error.name === "NotAllowedError"
            ? "Screen sharing permission was denied."
            : error.message
          : error instanceof Error
            ? error.message
            : "Unable to start screen sharing.";
      toasts.showErrorToast(message);
      screenShareStream = null;
      screenShareSenders.clear();
      syncScreenShareState(false);
      return false;
    }
  }

  function stopScreenShare({
    reason = "manual",
  }: { reason?: "manual" | "revoked" | "cleanup" } = {}) {
    const wasSharing = Boolean(screenShareStream);
    if (!screenShareStream) {
      syncScreenShareState(false);
      return;
    }

    participantStates.forEach((participant, peerId) => {
      const senders = screenShareSenders.get(peerId) ?? [];
      if (!senders.length || !participant.peerConnection) {
        return;
      }
      senders.forEach((sender) => {
        try {
          participant.peerConnection?.removeTrack(sender);
        } catch (error) {
          console.warn("Failed to remove screen share sender", error);
        }
      });
    });

    screenShareSenders.clear();
    stopStream(screenShareStream);
    screenShareStream = null;
    syncScreenShareState(false);

    if (!wasSharing) {
      return;
    }

    if (reason === "manual") {
      toasts.addToast("Stopped sharing your screen.", "info");
    } else if (reason === "revoked") {
      toasts.addToast("Screen sharing ended.", "warning");
    }
  }

  async function toggleScreenShare(): Promise<boolean> {
    if (screenShareStream) {
      stopScreenShare({ reason: "manual" });
      return false;
    }
    return startScreenShare();
  }

  function cleanupMedia() {
    stopScreenShare({ reason: "cleanup" });
    stopStream(activeStream);
    activeStream = null;
    syncLocalMediaState(null);
    cleanupAllParticipants();
  }

  function setLocalAudioEnabled(enabled: boolean) {
    if (!activeStream) {
      return;
    }

    const tracks = activeStream.getAudioTracks();
    if (!tracks.length) {
      return;
    }

    tracks.forEach((track) => {
      track.enabled = enabled;
    });

    syncLocalMediaState(activeStream);
  }

  function toggleMute() {
    const state = get(store);
    if (!state.localMedia.audioAvailable) {
      return;
    }
    setLocalAudioEnabled(!state.localMedia.audioEnabled);
  }

  function mute() {
    setLocalAudioEnabled(false);
  }

  function unmute() {
    setLocalAudioEnabled(true);
  }

  function setLocalVideoEnabled(enabled: boolean) {
    if (!activeStream) {
      return;
    }

    const tracks = activeStream.getVideoTracks();
    if (!tracks.length) {
      return;
    }

    tracks.forEach((track) => {
      track.enabled = enabled;
    });

    syncLocalMediaState(activeStream);
  }

  function toggleCamera() {
    const state = get(store);
    if (!state.localMedia.videoAvailable) {
      return;
    }
    setLocalVideoEnabled(!state.localMedia.videoEnabled);
  }

  function disableCamera() {
    setLocalVideoEnabled(false);
  }

  function enableCamera() {
    setLocalVideoEnabled(true);
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
    const currentCall = get(store).activeCall;
    if (currentCall?.chatType === "channel" && currentCall.type === "voice") {
      const meId = get(userStore).me?.id;
      if (meId) {
        voicePresenceStore.markParticipantLeft({
          channelId: currentCall.chatId,
          participantId: meId,
        });
      }
    }
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
    participantStates = new Map();
    screenShareStream = null;
    screenShareSenders = new Map();
    voicePresenceStore.reset();
    set(INITIAL_STATE);
    updateScreenShareAvailability();
  }

  return {
    subscribe,
    initialize,
    refreshDevices,
    refreshPermissions,
    canStartCall,
    joinVoiceChannel,
    startCall,
    endCall,
    acceptCall,
    rejectCall,
    setCallModalOpen,
    dismissCall,
    mute,
    unmute,
    toggleMute,
    disableCamera,
    enableCamera,
    toggleCamera,
    toggleScreenShare,
    stopScreenShare,
    describeStatus: (call: ActiveCall | null) => describeCallStatus(call),
    reset,
  };
}

export const callStore = createCallStore();
export { describeCallStatus };
export type { CallState };
