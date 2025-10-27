<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount } from "svelte";
  import { get } from "svelte/store";
  import {
    settings,
    setAudioInputDeviceId,
    setAudioOutputDeviceId,
    setVideoInputDeviceId,
  } from "$lib/features/settings/stores/settings";
  import { callStore } from "$lib/features/calls/stores/callStore";
  import { Label } from "$lib/components/ui/label/index.js";
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
  } from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { AlertCircle, Video, Mic } from "lucide-svelte";

  type DeviceOption = {
    deviceId: string;
    label: string;
  };

  const DEFAULT_DEVICE_OPTION: DeviceOption = {
    deviceId: "",
    label: "System default",
  };

  let deviceAvailability = $state(get(callStore).deviceAvailability);
  let permissions = $state(get(callStore).permissions);

  let audioInputId = $state(get(settings).audioInputDeviceId ?? "");
  let videoInputId = $state(get(settings).videoInputDeviceId ?? "");
  let audioOutputId = $state(get(settings).audioOutputDeviceId ?? "");

  let audioInputDevices = $state<DeviceOption[]>([]);
  let videoInputDevices = $state<DeviceOption[]>([]);
  let audioOutputDevices = $state<DeviceOption[]>([]);

  let enumerating = $state(false);
  let enumerationError = $state<string | null>(null);

  let previewVideo: HTMLVideoElement | null = null;
  let previewStream: MediaStream | null = null;
  let previewActive = $state(false);
  let previewError = $state<string | null>(null);

  let micStream: MediaStream | null = null;
  let micContext: AudioContext | null = null;
  let micAnalyser: AnalyserNode | null = null;
  let micAnimationFrame: number | null = null;
  let micTestActive = $state(false);
  let micTestError = $state<string | null>(null);
  let micLevel = $state(0);

  const TEST_TONE_SRC =
    "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";

  let testSoundError = $state<string | null>(null);
  let playingTestSound = $state(false);

  const audioInputLabel = $derived(() =>
    resolveDeviceLabel(audioInputId, audioInputDevices),
  );
  const videoInputLabel = $derived(() =>
    resolveDeviceLabel(videoInputId, videoInputDevices),
  );
  const audioOutputLabel = $derived(() =>
    resolveDeviceLabel(audioOutputId, audioOutputDevices),
  );

  function resolveDeviceLabel(id: string, devices: DeviceOption[]) {
    if (!id) return DEFAULT_DEVICE_OPTION.label;
    return devices.find((device) => device.deviceId === id)?.label ??
      `${DEFAULT_DEVICE_OPTION.label} (${id})`;
  }

  function mapDevices(devices: MediaDeviceInfo[], kind: MediaDeviceKind) {
    let unnamedCount = 0;
    return devices
      .filter((device) => device.kind === kind)
      .map((device) => {
        const label = device.label || `${kind} ${++unnamedCount}`;
        return { deviceId: device.deviceId, label } satisfies DeviceOption;
      });
  }

  async function enumerateDevices() {
    if (!browser || !navigator.mediaDevices?.enumerateDevices) return;

    enumerating = true;
    enumerationError = null;

    try {
      await callStore.initialize();
      await callStore.refreshDevices();
      const devices = await navigator.mediaDevices.enumerateDevices();
      audioInputDevices = mapDevices(devices, "audioinput");
      videoInputDevices = mapDevices(devices, "videoinput");
      audioOutputDevices = mapDevices(devices, "audiooutput");

      if (
        audioInputId &&
        !audioInputDevices.some((device) => device.deviceId === audioInputId)
      ) {
        audioInputId = "";
      }

      if (
        videoInputId &&
        !videoInputDevices.some((device) => device.deviceId === videoInputId)
      ) {
        videoInputId = "";
      }

      if (
        audioOutputId &&
        !audioOutputDevices.some((device) => device.deviceId === audioOutputId)
      ) {
        audioOutputId = "";
      }
    } catch (error) {
      console.warn("Failed to enumerate devices", error);
      enumerationError =
        error instanceof Error
          ? error.message
          : "Unable to enumerate media devices.";
    } finally {
      enumerating = false;
    }
  }

  async function startVideoPreview() {
    if (!browser || previewActive) return;

    previewError = null;
    try {
      await callStore.initialize();
      await callStore.refreshDevices();
      const constraints: MediaStreamConstraints = {
        audio: false,
        video:
          videoInputId
            ? { deviceId: { exact: videoInputId } }
            : { facingMode: "user" },
      };
      previewStream = await navigator.mediaDevices.getUserMedia(constraints);
      previewActive = true;
      if (previewVideo) {
        previewVideo.srcObject = previewStream;
        await previewVideo.play();
      }
    } catch (error) {
      previewError =
        error instanceof Error
          ? error.message
          : "Unable to start video preview.";
      stopVideoPreview();
    }
  }

  function stopVideoPreview() {
    previewStream?.getTracks().forEach((track) => track.stop());
    previewStream = null;
    previewActive = false;
    if (previewVideo) {
      previewVideo.pause();
      previewVideo.srcObject = null;
    }
  }

  function updateMicLevel() {
    if (!micAnalyser) return;
    const bufferLength = micAnalyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    micAnalyser.getByteTimeDomainData(dataArray);

    let sumSquares = 0;
    for (const value of dataArray) {
      const normalized = value / 128 - 1;
      sumSquares += normalized * normalized;
    }
    micLevel = Math.min(1, Math.sqrt(sumSquares / bufferLength) * 2);
    micAnimationFrame = requestAnimationFrame(updateMicLevel);
  }

  async function startMicTest() {
    if (!browser || micTestActive) return;

    micTestError = null;
    try {
      await callStore.initialize();
      await callStore.refreshDevices();
      micStream = await navigator.mediaDevices.getUserMedia({
        audio:
          audioInputId
            ? { deviceId: { exact: audioInputId } }
            : { echoCancellation: true },
        video: false,
      });
      micContext = new AudioContext();
      const source = micContext.createMediaStreamSource(micStream);
      micAnalyser = micContext.createAnalyser();
      micAnalyser.fftSize = 256;
      source.connect(micAnalyser);
      micTestActive = true;
      micLevel = 0;
      updateMicLevel();
    } catch (error) {
      micTestError =
        error instanceof Error
          ? error.message
          : "Unable to access the selected microphone.";
      stopMicTest();
    }
  }

  function stopMicTest() {
    if (micAnimationFrame) {
      cancelAnimationFrame(micAnimationFrame);
      micAnimationFrame = null;
    }
    micStream?.getTracks().forEach((track) => track.stop());
    micStream = null;
    micAnalyser = null;
    if (micContext) {
      void micContext.close();
      micContext = null;
    }
    micTestActive = false;
    micLevel = 0;
  }

  async function playTestSound() {
    if (!browser) return;
    if (playingTestSound) return;

    testSoundError = null;
    playingTestSound = true;

    try {
      await callStore.initialize();
      await callStore.refreshDevices();
      const audio = new Audio(`data:audio/wav;base64,${TEST_TONE_SRC}`);
      audio.preload = "auto";
      if (audioOutputId && "setSinkId" in audio) {
        try {
          await (
            audio as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }
          ).setSinkId?.(audioOutputId);
        } catch (error) {
          console.warn("Failed to route audio to selected output", error);
          testSoundError =
            error instanceof Error
              ? error.message
              : "Unable to route audio to the selected output.";
        }
      }
      audio.addEventListener("ended", () => {
        playingTestSound = false;
      });
      await audio.play();
      audio.addEventListener("error", () => {
        testSoundError = "Unable to play the test sound.";
        playingTestSound = false;
      });
    } catch (error) {
      testSoundError =
        error instanceof Error
          ? error.message
          : "Unable to play the test sound.";
      playingTestSound = false;
    }
  }

  function subscribeToSettings() {
    return settings.subscribe((value) => {
      audioInputId = value.audioInputDeviceId ?? "";
      videoInputId = value.videoInputDeviceId ?? "";
      audioOutputId = value.audioOutputDeviceId ?? "";
    });
  }

  function subscribeToCallStore() {
    return callStore.subscribe((value) => {
      deviceAvailability = value.deviceAvailability;
      permissions = value.permissions;
    });
  }

  onMount(() => {
    if (!browser) return () => {};

    const unsubscribeSettings = subscribeToSettings();
    const unsubscribeCallStore = subscribeToCallStore();

    void enumerateDevices();

    const handleDeviceChange = () => void enumerateDevices();
    navigator.mediaDevices?.addEventListener("devicechange", handleDeviceChange);

    return () => {
      unsubscribeSettings();
      unsubscribeCallStore();
      navigator.mediaDevices?.removeEventListener(
        "devicechange",
        handleDeviceChange,
      );
    };
  });

  onDestroy(() => {
    stopVideoPreview();
    stopMicTest();
  });

  $effect(() => {
    const current = get(settings);
    if (current.audioInputDeviceId !== audioInputId) {
      setAudioInputDeviceId(audioInputId);
    }
    if (current.videoInputDeviceId !== videoInputId) {
      setVideoInputDeviceId(videoInputId);
    }
    if (current.audioOutputDeviceId !== audioOutputId) {
      setAudioOutputDeviceId(audioOutputId);
    }
  });
</script>

<h1 class="text-2xl font-semibold text-zinc-50">Voice &amp; Video</h1>
<p class="text-sm text-muted-foreground">
  Configure your microphones, cameras, and speakers for Aegis calls.
</p>

<section
  class="mt-6 grid gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-muted-foreground"
>
  <div class="flex items-center gap-2 text-zinc-200">
    <Mic class="h-4 w-4" aria-hidden="true" />
    <span>
      Microphones: {deviceAvailability.audioInput ? "Detected" : "Unavailable"}
    </span>
  </div>
  <div class="flex items-center gap-2 text-zinc-200">
    <Video class="h-4 w-4" aria-hidden="true" />
    <span>Cameras: {deviceAvailability.videoInput ? "Detected" : "Unavailable"}</span>
  </div>
  <div class="flex flex-wrap gap-2">
    <span>Microphone permission: {permissions.audio}</span>
    <span>Camera permission: {permissions.video}</span>
  </div>
  {#if enumerationError}
    <p class="flex items-center gap-2 text-red-400">
      <AlertCircle class="h-4 w-4" aria-hidden="true" />
      {enumerationError}
    </p>
  {/if}
</section>

<div class="mt-8 grid gap-6">
  <section
    class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
    aria-labelledby="microphone-settings"
  >
    <div class="flex items-start justify-between gap-4">
      <div>
        <Label id="microphone-settings" class="text-sm font-medium text-zinc-200">
          Input device
        </Label>
        <p class="text-xs text-muted-foreground">
          Choose which microphone Aegis should use during calls.
        </p>
      </div>
      <Button variant="secondary" size="sm" onclick={() => void enumerateDevices()} disabled={enumerating}>
        Refresh
      </Button>
    </div>

    <div class="mt-4 max-w-md space-y-3">
      <Select
        type="single"
        value={audioInputId}
        onValueChange={(value: string) => (audioInputId = value)}
        disabled={enumerating || audioInputDevices.length === 0}
      >
        <SelectTrigger class="w-full" aria-label="Select microphone">
          <span data-slot="select-value" class="flex-1 text-left">
            {audioInputLabel}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_DEVICE_OPTION.deviceId}>
            {DEFAULT_DEVICE_OPTION.label}
          </SelectItem>
          {#if audioInputDevices.length === 0}
            <div class="px-3 py-2 text-sm text-muted-foreground">
              No microphones detected.
            </div>
          {:else}
            {#each audioInputDevices as device}
              <SelectItem value={device.deviceId}>{device.label}</SelectItem>
            {/each}
          {/if}
        </SelectContent>
      </Select>

      <div class="flex flex-wrap items-center gap-3">
        <Button variant="default" size="sm" onclick={() => (micTestActive ? stopMicTest() : startMicTest())} disabled={enumerating || (!audioInputDevices.length && !audioInputId)}>
          {micTestActive ? "Stop microphone test" : "Test microphone"}
        </Button>
        {#if micTestActive}
          <div class="min-w-[160px] flex-1">
            <div class="h-2 rounded-full bg-zinc-800">
              <div
                class="h-full rounded-full bg-emerald-500 transition-all"
                style:width={`${Math.round(micLevel * 100)}%`}
              ></div>
            </div>
            <p class="mt-1 text-xs text-muted-foreground">
              Speak into your microphone to confirm signal activity.
            </p>
          </div>
        {/if}
      </div>
      {#if micTestError}
        <p class="flex items-center gap-2 text-xs text-red-400">
          <AlertCircle class="h-3 w-3" aria-hidden="true" />
          {micTestError}
        </p>
      {/if}
    </div>
  </section>

  <section
    class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
    aria-labelledby="speaker-settings"
  >
    <div class="flex items-start justify-between gap-4">
      <div>
        <Label id="speaker-settings" class="text-sm font-medium text-zinc-200">
          Output device
        </Label>
        <p class="text-xs text-muted-foreground">
          Select the speaker or headset used for audio playback.
        </p>
      </div>
    </div>

    <div class="mt-4 max-w-md space-y-3">
      <Select
        type="single"
        value={audioOutputId}
        onValueChange={(value: string) => (audioOutputId = value)}
        disabled={enumerating || (!navigator.mediaDevices?.selectAudioOutput && audioOutputDevices.length === 0)}
      >
        <SelectTrigger class="w-full" aria-label="Select speaker">
          <span data-slot="select-value" class="flex-1 text-left">
            {audioOutputLabel}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_DEVICE_OPTION.deviceId}>
            {DEFAULT_DEVICE_OPTION.label}
          </SelectItem>
          {#if audioOutputDevices.length === 0}
            <div class="px-3 py-2 text-sm text-muted-foreground">
              {navigator.mediaDevices?.selectAudioOutput
                ? "No speakers detected."
                : "This browser cannot enumerate audio outputs."}
            </div>
          {:else}
            {#each audioOutputDevices as device}
              <SelectItem value={device.deviceId}>{device.label}</SelectItem>
            {/each}
          {/if}
        </SelectContent>
      </Select>

      <div class="flex flex-wrap items-center gap-3">
        <Button
          variant="default"
          size="sm"
          disabled={playingTestSound || (audioOutputDevices.length === 0 && !audioOutputId)}
          onclick={() => void playTestSound()}
        >
          {playingTestSound ? "Playing test sound..." : "Play test sound"}
        </Button>
        {#if testSoundError}
          <p class="flex items-center gap-2 text-xs text-red-400">
            <AlertCircle class="h-3 w-3" aria-hidden="true" />
            {testSoundError}
          </p>
        {/if}
      </div>
    </div>
  </section>

  <section
    class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
    aria-labelledby="camera-settings"
  >
    <div class="flex items-start justify-between gap-4">
      <div>
        <Label id="camera-settings" class="text-sm font-medium text-zinc-200">
          Camera
        </Label>
        <p class="text-xs text-muted-foreground">
          Set the preferred camera and preview it instantly.
        </p>
      </div>
    </div>

    <div class="mt-4 space-y-3">
      <div class="max-w-md">
        <Select
          type="single"
          value={videoInputId}
          onValueChange={(value: string) => (videoInputId = value)}
          disabled={enumerating || videoInputDevices.length === 0}
        >
          <SelectTrigger class="w-full" aria-label="Select camera">
            <span data-slot="select-value" class="flex-1 text-left">
              {videoInputLabel}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_DEVICE_OPTION.deviceId}>
              {DEFAULT_DEVICE_OPTION.label}
            </SelectItem>
            {#if videoInputDevices.length === 0}
              <div class="px-3 py-2 text-sm text-muted-foreground">
                No cameras detected.
              </div>
            {:else}
              {#each videoInputDevices as device}
                <SelectItem value={device.deviceId}>{device.label}</SelectItem>
              {/each}
            {/if}
          </SelectContent>
        </Select>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <Button
          variant={previewActive ? "secondary" : "default"}
          size="sm"
          disabled={enumerating || (videoInputDevices.length === 0 && !videoInputId)}
          onclick={() => (previewActive ? stopVideoPreview() : startVideoPreview())}
        >
          {previewActive ? "Stop preview" : "Preview video"}
        </Button>
        {#if previewError}
          <p class="flex items-center gap-2 text-xs text-red-400">
            <AlertCircle class="h-3 w-3" aria-hidden="true" />
            {previewError}
          </p>
        {/if}
      </div>

      {#if previewActive}
        <div class="overflow-hidden rounded-lg border border-zinc-800 bg-black">
          <video
            bind:this={previewVideo}
            autoplay
            playsinline
            muted
            class="h-48 w-full object-cover"
          ></video>
        </div>
      {/if}
    </div>
  </section>
</div>

