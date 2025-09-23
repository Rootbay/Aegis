<script lang="ts">
  import { browser } from "$app/environment";
  import { toasts } from "$lib/stores/ToastStore";
  import Toast from "$lib/components/ui/Toast.svelte";
</script>

{#if browser}
  <div
    class="toast-container fixed bottom-4 right-4 z-50 w-72"
    aria-live="polite"
    aria-atomic="false"
  >
    {#each $toasts as toast (toast.id)}
      <Toast
        message={toast.message}
        type={toast.type}
        duration={toast.duration}
        onDismiss={() => toasts.removeToast(toast.id)}
      />
    {/each}
  </div>
{/if}
