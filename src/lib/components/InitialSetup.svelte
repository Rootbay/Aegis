<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  const messages = [
    'Generating your cryptographic identity…',
    'Hardening local key storage…',
    'Warming up mesh networking…',
    'Optimizing battery‑aware radio duty cycles…',
    'Bootstrapping resilient offline mode…',
    'Preparing walkie‑talkie voice memos…',
    'Tuning encryption parameters…',
    'Loading command palette and shortcuts…',
  ];

  let i = 0;
  let current = messages[i];
  let t: any;

  onMount(() => {
    t = setInterval(() => {
      i = (i + 1) % messages.length;
      current = messages[i];
    }, 4000);
  });
  onDestroy(() => clearInterval(t));
</script>

<main class="min-h-screen w-screen grid place-items-center bg-base-100 text-foreground">
  <div class="flex flex-col items-center gap-5">
    <div class="relative w-16 h-16" aria-busy="true" aria-live="polite">
      <div
        class="absolute inset-0 rounded-full bg-gradient-to-tr from-highlight-100 via-blue-500 to-fuchsia-500 spin-slow"
        style="mask: radial-gradient(farthest-side, transparent 60%, black 61%); -webkit-mask: radial-gradient(farthest-side, transparent 60%, black 61%);"
      ></div>
      <div class="absolute inset-1 rounded-full bg-base-100"></div>
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="w-2.5 h-2.5 rounded-full bg-primary animate-ping"></div>
      </div>
      <div class="absolute inset-0 rounded-full border-2 border-base-200/50 spin-reverse"></div>
    </div>
    <h1 class="text-lg font-semibold text-foreground">Setting up your secure identity…</h1>
    <p class="text-sm text-muted-foreground max-w-md text-center">{current}</p>
  </div>
</main>

<style>
  @keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
  @keyframes spinReverse { from { transform: rotate(360deg);} to { transform: rotate(0deg);} }
  .spin-slow { animation: spin 1.4s linear infinite; }
  .spin-reverse { animation: spinReverse 1.8s linear infinite; }
</style>

