<script>
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';

  onMount(() => {
    goto(resolve('/settings/account'));
  });
</script>

<p>Redirecting to settings...</p>
