<script lang="ts">
  import { Html5Qrcode } from "html5-qrcode";
  import { X } from "@lucide/svelte";

  type ScanSuccessHandler = (value: string) => void; // eslint-disable-line no-unused-vars

  type Props = {
    onscanSuccess?: ScanSuccessHandler;
    onclose?: () => void;
  };

  let { onscanSuccess, onclose }: Props = $props();

  let scanner = $state<Html5Qrcode | null>(null);
  let errorMessage = $state<string | null>(null);

  $effect(() => {
    const handleScanSuccess = (decodedText: string) => {
      onscanSuccess?.(decodedText);
      stopScanner();
    };

    const onScanFailure = (error: any) => {
      if (typeof error !== "string" || !error.includes("No QR code found")) {
        console.warn(`QR error = ${error}`);
      }
    };

    const instance = new Html5Qrcode("qr-reader");
    scanner = instance;

    instance
      .start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        handleScanSuccess,
        onScanFailure,
      )
      .catch((err) => {
        errorMessage = `Failed to start QR scanner: ${err.message}. Please ensure you have a camera connected and have granted permission.`;
        console.error("Failed to start scanner", err);
      });

    return () => {
      stopScanner();
    };
  });

  function stopScanner() {
    if (scanner && scanner.isScanning) {
      scanner
        .stop()
        .catch((err) => console.error("Failed to stop scanner", err));
    }
  }

  function closeModal() {
    onclose?.();
  }
</script>

<div
  class="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60]"
>
  <div class="bg-card p-6 rounded-lg shadow-lg w-full max-w-md relative">
    <button
      class="absolute top-3 right-3 text-muted-foreground hover:text-white"
      onclick={closeModal}
    >
      <X size={15} />
    </button>
    <h2 class="text-xl font-bold mb-4 text-white">Scan QR Code</h2>
    {#if errorMessage}
      <div
        class="bg-red-500/20 border border-red-500 text-red-300 p-4 rounded-lg mb-4"
      >
        <p>{errorMessage}</p>
      </div>
    {/if}
    <div
      id="qr-reader"
      class="w-full rounded-lg overflow-hidden border-2 border-zinc-700"
    ></div>
    <p class="text-muted-foreground text-center mt-4">
      Point your camera at a friend's QR code to add them.
    </p>
  </div>
</div>
