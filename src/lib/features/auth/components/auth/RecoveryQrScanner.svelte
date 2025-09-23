<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { Html5Qrcode } from "html5-qrcode";

  const dispatch = createEventDispatcher<{ result: string; error: string }>();
  const elementId = `qr-reader-${Math.random().toString(36).slice(2)}`;
  let scanner: Html5Qrcode | null = null;
  let emitted = false;

  async function stopScanner() {
    if (!scanner) return;
    try {
      if ((scanner as any).isScanning) {
        await scanner.stop();
      }
      await scanner.clear();
    } catch (error) {
      console.error("Failed to stop QR scanner:", error);
    }
  }

  onMount(async () => {
    try {
      scanner = new Html5Qrcode(elementId);
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) {
        dispatch("error", "No camera available.");
        return;
      }
      const preferred =
        cameras.find((cam) => cam.label.toLowerCase().includes("back")) ??
        cameras[0];
      await scanner.start(
        { deviceId: { exact: preferred.id } },
        { fps: 10, qrbox: 240 },
        (decodedText) => {
          if (!emitted) {
            emitted = true;
            dispatch("result", decodedText);
            stopScanner();
          }
        },
        () => {},
      );
    } catch (error) {
      dispatch(
        "error",
        error instanceof Error ? error.message : "Unable to start QR scanner.",
      );
    }
  });

  onDestroy(() => {
    stopScanner();
  });
</script>

<div
  id={elementId}
  class="w-full rounded-lg border border-zinc-800 bg-black/80 min-h-[240px] grid place-items-center text-sm text-zinc-500"
>
  <p>Initializing camera…</p>
</div>
