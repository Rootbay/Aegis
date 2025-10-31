import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { writable } from "svelte/store";

const toggleScreenShareMock = vi.fn();
const stopScreenShareMock = vi.fn();
const toggleMuteMock = vi.fn();
const toggleCameraMock = vi.fn();
const setCallModalOpenMock = vi.fn();
const endCallMock = vi.fn();
const rejectCallMock = vi.fn();
const acceptCallMock = vi.fn();
const dismissCallMock = vi.fn();

const baseCallState = {
  showCallModal: true,
  activeCall: {
    chatId: "chat-1",
    chatName: "Team Sync",
    chatType: "group" as const,
    type: "video" as const,
    status: "in-call" as const,
    startedAt: Date.now(),
    connectedAt: Date.now(),
    endedAt: null,
    endReason: undefined,
    error: undefined,
    localStream: null,
    callId: "call-1",
    direction: "outgoing" as const,
    participants: new Map(),
  },
  deviceAvailability: { audioInput: true, videoInput: true },
  permissions: {
    audio: "granted" as PermissionState,
    video: "granted" as PermissionState,
    checking: false,
  },
  localMedia: {
    audioEnabled: true,
    videoEnabled: true,
    audioAvailable: true,
    videoAvailable: true,
    screenSharing: false,
    screenShareAvailable: true,
  },
};

const callState = writable({ ...baseCallState });
let CallModal: typeof import("$lib/features/calls/components/CallModal.svelte").default;

vi.mock("$lib/features/calls/stores/callStore", () => ({
  callStore: {
    subscribe: callState.subscribe,
    setCallModalOpen: setCallModalOpenMock,
    toggleMute: toggleMuteMock,
    toggleCamera: toggleCameraMock,
    toggleScreenShare: toggleScreenShareMock,
    stopScreenShare: stopScreenShareMock,
    endCall: endCallMock,
    rejectCall: rejectCallMock,
    acceptCall: acceptCallMock,
    dismissCall: dismissCallMock,
  },
  describeCallStatus: () => "In call",
}));

describe("CallModal screen sharing controls", () => {
  beforeAll(async () => {
    const module = await import(
      "$lib/features/calls/components/CallModal.svelte"
    );
    CallModal = module.default;
  }, 30000);

  beforeEach(() => {
    vi.clearAllMocks();
    callState.set({
      ...baseCallState,
      activeCall: { ...baseCallState.activeCall, participants: new Map() },
    });
  });

  it("invokes the toggle action when starting screen sharing", async () => {
    const { getByLabelText } = render(CallModal);

    const button = getByLabelText("Start screen sharing");
    await fireEvent.click(button);

    expect(toggleScreenShareMock).toHaveBeenCalled();
  }, 15000);

  it("invokes the stop action when stopping screen sharing", async () => {
    callState.update((state) => ({
      ...state,
      localMedia: { ...state.localMedia, screenSharing: true },
    }));

    const { getByText, getByLabelText } = render(CallModal);

    const toggleButton = getByLabelText("Stop screen sharing");
    await fireEvent.click(toggleButton);
    expect(toggleScreenShareMock).toHaveBeenCalled();

    const stopButton = getByText("Stop Sharing");
    await fireEvent.click(stopButton);
    expect(stopScreenShareMock).toHaveBeenCalled();
  }, 15000);
});
