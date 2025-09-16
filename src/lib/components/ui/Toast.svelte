<svelte:options runes={true} />

<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  type Props = {
    message: string;
    type: 'success' | 'error' | 'info' | 'warning' | 'default';
    duration?: number;
    onDismiss?: () => void;
  };

  let { message, type, duration = 3000, onDismiss }: Props = $props();

  let show = $state(false);
  let hovered = $state(false);

  let timeout: ReturnType<typeof setTimeout> | null = null;
  let startTime = 0;
  let remaining = duration;

  function scheduleDismiss(ms: number) {
    clearCurrentTimeout();
    startTime = Date.now();
    timeout = setTimeout(() => {
      show = false;
      if (onDismiss) setTimeout(onDismiss, 300);
      timeout = null;
    }, ms);
  }

  function clearCurrentTimeout() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  }

  onMount(() => {
    show = true;
    remaining = duration;
    scheduleDismiss(remaining);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearCurrentTimeout();
        show = false;
        if (onDismiss) setTimeout(onDismiss, 300);
      }
    };

    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as any);
  });

  onDestroy(() => {
    clearCurrentTimeout();
  });

  let bgColor = $state('');
  let textColor = $state('text-white');
  let borderLeftColor = $state('');

  $effect(() => {
    switch (type) {
      case 'success':
        bgColor = 'bg-success';
        borderLeftColor = 'border-l-green-700';
        textColor = 'text-white';
        break;
      case 'error':
        bgColor = 'bg-destructive';
        borderLeftColor = 'border-l-red-700';
        textColor = 'text-white';
        break;
      case 'info':
        bgColor = 'bg-status-info';
        borderLeftColor = 'border-l-blue-700';
        textColor = 'text-white';
        break;
      case 'warning':
        bgColor = 'bg-status-warning';
        borderLeftColor = 'border-l-yellow-700';
        textColor = 'text-gray-900';
        break;
      default:
        bgColor = 'bg-muted';
        borderLeftColor = 'border-l-gray-900';
        textColor = 'text-white';
    }
  });
</script>

<div
  class="group p-4 mb-3 rounded-lg shadow-lg flex items-center transition-all duration-300 ease-in-out transform {bgColor} {textColor} {show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full'} border border-solid border-t-0 border-r-0 border-b-0 border-l-4 {borderLeftColor}"
  role="alert"
  onmouseenter={() => {
    hovered = true;
    if (timeout) {
      clearCurrentTimeout();
      remaining = Math.max(0, remaining - (Date.now() - startTime));
    }
  }}
  onmouseleave={() => {
    hovered = false;
    if (remaining > 0) scheduleDismiss(remaining);
  }}
>
  <div class="flex-1">
    {message}
  </div>
  <button
    class="ml-4 text-white opacity-75 hover:opacity-100 focus:outline-none"
    aria-label="Close notification"
    onclick={() => {
      show = false;
      if (onDismiss) {
        setTimeout(onDismiss, 300);
      }
    }}
  >
    <svg
      class="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M6 18L18 6M6 6l12 12"
      ></path>
    </svg>
  </button>

  <div class="absolute left-0 right-0 bottom-0 h-1 bg-black/20 overflow-hidden rounded-b-lg">
    <div
      class="h-full bg-white/70"
      style="animation: toastProgress linear forwards; animation-duration: {duration}ms; animation-play-state: {hovered ? 'paused' : 'running'};"
    ></div>
  </div>
</div>

<style>
  @keyframes toastProgress {
    from { width: 100%; }
    to { width: 0%; }
  }
</style>


