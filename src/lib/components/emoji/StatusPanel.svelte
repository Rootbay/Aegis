<script lang="ts">
  export let message: string;
  export let ariaLabel = "Emoji picker";
</script>

<div
  class="w-64 rounded-lg border border-white/10 bg-zinc-800 p-3 text-sm text-white/80 shadow-lg"
  role="dialog"
  aria-label={ariaLabel}
>
  {message}
</div>
