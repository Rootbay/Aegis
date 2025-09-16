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

  let i = $state(0);
  let current = $state(messages[0]);
  let t: any;

  onMount(() => {
    let idx = 0;
    t = setInterval(() => {
      idx = (idx + 1) % messages.length;
      current = messages[idx];
    }, 4000);
  });
  onDestroy(() => clearInterval(t));
</script>

<main class="min-h-screen w-screen grid place-items-center bg-transparent text-zinc-100">
  <div class="flex flex-col items-center gap-4">
    <div class="loader" role="status" aria-label="Loading"></div>
    {#if false}
      <p class="text-xs text-zinc-400">Loading…</p>
    {/if}
  </div>
</main>

<style>
  .loader {
    --size: 28px;
    --thickness: 2px;
    --speed: 900ms;
    --color: #d4d4d8;

    width: var(--size);
    height: var(--size);
    color: var(--color);
    border-radius: 9999px;

    background: conic-gradient(from 0deg, currentColor 0 25%, transparent 25%);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - var(--thickness)), #000 calc(100% - var(--thickness) + 1px));
            mask: radial-gradient(farthest-side, transparent calc(100% - var(--thickness)), #000 calc(100% - var(--thickness) + 1px));
    animation: loader-spin var(--speed) linear infinite;
  }

  @keyframes loader-spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .loader { animation-duration: 1600ms; }
  }
</style>
