<script lang="ts">
  import type { Friend } from '$lib/models/Friend';

  let { friend } = $props<{ friend: Friend }>();
</script>

<div class="flex items-center py-2 border-b border-zinc-700 last:border-b-0 w-full">
  <img src={friend.pfp} alt={friend.name} class="w-8 h-8 rounded-full mr-3" />
  <div class="flex-grow">
    <p class="font-semibold">{friend.name}</p>
    {#if friend.status !== 'Blocked'}
      <p class="text-xs" class:text-green-400={friend.status === 'Online'} class:text-muted-foreground={friend.status === 'Offline'}>
        {friend.status}
      </p>
    {/if}
  </div>
  <!-- Add actions like message, remove, unblock here -->
</div>