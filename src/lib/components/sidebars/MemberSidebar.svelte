<script lang="ts">
  import { Users } from '@lucide/svelte';
  import type { User } from '$lib/models/User';

  export let members: User[] = [];
  export let isSettingsPage: boolean = false;
  export let openUserCardModal: Function;
</script>

<aside class="hidden lg:flex w-[260px] bg-muted/50 flex-col border-l border-border/50">
  {#if isSettingsPage}
    <header class="p-4 border-b border-border/50 h-[55px]">
      <h2 class="text-xl font-bold">Settings</h2>
    </header>
    <div class="flex-grow p-4 text-muted-foreground">
      <p>Settings content goes here.</p>
    </div>
  {:else}
    <header class="p-4 border-b border-border/50 h-[55px]">
      <h2 class="text-xl font-bold">Members</h2>
    </header>
    <div class="flex-grow p-2 overflow-y-auto">
      {#if members.length === 0}
        <div class="text-center p-6 text-muted-foreground">
          <Users size={15} />
          <p class="text-sm mt-2">No members in this chat.</p>
        </div>
      {:else}
        {#each members as member (member.id)}
          <button
            class="w-full text-left px-2 py-1 rounded-md flex items-center transition-colors hover:bg-base-400/50 text-muted-foreground"
            onclick={(e) => openUserCardModal(member, e.clientX, e.currentTarget.getBoundingClientRect().top, true)}
          >
            <div class="relative mr-2">
              <img src={member.avatar} alt={member.name} class="w-8 h-8 rounded-full" />
              {#if member.online}
                <span
                  class="absolute bottom-0 right-0 block h-2 w-2 rounded-full bg-success border-2 border-border"
                ></span>
              {/if}
            </div>
            {member.name}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</aside>
