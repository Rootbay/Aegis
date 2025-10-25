import { writable, get } from "svelte/store";
import { toasts } from "$lib/stores/ToastStore";

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
      stopStream(activeStream);
      activeStream = null;
    }, STATUS_CLEAR_DELAY);
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
        localStream: null,
      },
    }));

    toasts.addToast(
      type === "video" ? "Starting video call..." : "Starting voice call...",
      "info",
    );

    try {
      const stream = await requestUserMedia(type);
      activeStream = stream;

      update((next) => {
        if (!next.activeCall || next.activeCall.chatId !== chatId) {
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

      if (!isBrowser) {
        return true;
      }

      window.setTimeout(() => {
        update((next) => {
          if (!next.activeCall || next.activeCall.chatId !== chatId) {
            return next;
          }
          if (next.activeCall.status === "connecting") {
            return {
              ...next,
              activeCall: {
                ...next.activeCall,
                status: "in-call",
                connectedAt: Date.now(),
              },
            };
          }
          return next;
        });
      }, 600);

      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to start the call.";
      toasts.showErrorToast(message);

      update((next) => {
        if (!next.activeCall || next.activeCall.chatId !== chatId) {
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
          },
        };
      });

      stopStream(activeStream);
      activeStream = null;
      scheduleDismissal();
      return false;
    }
  }

  function endCall(reason = "Call ended") {
    const state = get(store);
    if (!state.activeCall) {
      return;
    }

    stopStream(activeStream);
    activeStream = null;

    update((next) => {
      if (!next.activeCall) return next;
      return {
        ...next,
        showCallModal: false,
        activeCall: {
          ...next.activeCall,
          status: "ended",
          endReason: reason,
          endedAt: Date.now(),
          localStream: null,
        },
      };
    });

    toasts.addToast(reason, "info");
    scheduleDismissal();
  }

  function setCallModalOpen(open: boolean) {
    update((state) => ({
      ...state,
      showCallModal: open,
    }));
  }

  function dismissCall() {
    stopStream(activeStream);
    activeStream = null;
    clearDismissalTimer();
    update((state) => ({
      ...state,
      showCallModal: false,
      activeCall: null,
    }));
  }

  function reset() {
    clearDismissalTimer();
    stopStream(activeStream);
    activeStream = null;
    deviceChangeUnsubscribe?.();
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
