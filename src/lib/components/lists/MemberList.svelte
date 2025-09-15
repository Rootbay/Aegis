<script lang="ts">
  import type { User } from '$lib/models/User';

  export let members: User[] = [];
  export let openUserCardModal: Function;
</script>

<div class="space-y-4">
  <h3 class="text-xl font-semibold text-white">Member List</h3>
  <p class="text-muted-foreground">View and manage members in your server.</p>
  <div class="bg-card/50 p-4 rounded-lg">
    {#if members.length > 0}
      <ul class="space-y-2">
        {#each members as member (member.id)}
          <div 
            role="button"
            tabindex="0"
            class="w-full flex items-center justify-between p-2 rounded-md bg-zinc-700 hover:bg-zinc-600/50 transition-colors" 
            onclick={(e) => { console.log('Attempting to open UserCardModal for:', member.name); openUserCardModal(member, e.clientX, e.clientY, true); }}
            onkeydown={(e) => { if (e.key === 'Enter') { console.log('Attempting to open UserCardModal for:', member.name); openUserCardModal(member, e.clientX, e.clientY, true); } }}
          >
            <span class="text-white">{member.name}</span>
            <button class="text-red-400 hover:text-destructive/80" onclick={(e) => e.stopPropagation()}>Remove</button>
          </div>
        {/each}
      </ul>
    {:else}
      <p class="text-muted-foreground">No members in this server yet.</p>
    {/if}
  </div>
</div>
