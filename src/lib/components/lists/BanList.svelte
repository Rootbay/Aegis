<script lang="ts">
  import type { User } from '$lib/features/auth/models/User';

  type Props = {
    bannedUsers?: User[];
  };

  let { bannedUsers = [] }: Props = $props();
</script>

<div class="space-y-4">
  <h3 class="text-xl font-semibold text-white">Ban List</h3>
  <p class="text-muted-foreground">View and manage banned users in your server.</p>
  <div class="bg-card/50 p-4 rounded-lg">
    {#if bannedUsers.length > 0}
      <ul class="space-y-2">
        {#each bannedUsers as user (user.id)}
          <li class="flex items-center justify-between p-2 rounded-md bg-zinc-700">
            <span class="text-white">{user.name}</span>
            <button class="text-green-400 hover:text-green-300">Unban</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-muted-foreground">No users are banned from this server.</p>
    {/if}
  </div>
</div>