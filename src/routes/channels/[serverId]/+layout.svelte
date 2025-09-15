
<script lang="ts">
  import { page } from '$app/stores';
  import { serverStore } from '$lib/data/stores/serverStore';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';

  

  import { onDestroy } from 'svelte';

  let serverId: string | null = null;
  let currentPathname: string;

  import { lastVisitedServerId } from '$lib/data/stores/navigationStore';

  const unsubscribePage = page.subscribe(p => {
    serverId = p.params.serverId;
    currentPathname = p.url.pathname;

    if (serverId && currentPathname.includes('/settings')) {
      lastVisitedServerId.set(serverId);
    }
  });

  $: if (serverId && !currentPathname.includes('/settings')) {
    const server = $serverStore.servers.find(s => s.id === serverId);
    if (!server || !server.channels || !server.members) {
      serverStore.fetchServerDetails(serverId);
    }
    serverStore.setActiveServer(serverId);
  }

  $: if (serverId && $serverStore.servers.length > 0 && !currentPathname.includes('/settings')) {
    const server = $serverStore.servers.find(s => s.id === serverId);
    if (server && server.channels) {
      const textChannel = server.channels.find(c => c.channel_type === 'text');
      if (textChannel) {
        const targetPath = `/channels/${serverId}/${textChannel.id}`;
        if (currentPathname !== targetPath) {
          goto(resolve(targetPath));
        }
      }
    }
  }

  onDestroy(() => {
    unsubscribePage();
  });
</script>

{#if $$slots.default}
  <slot />
{:else}
  <div class="flex-grow min-w-0 flex items-center justify-center bg-card">
    <div class="flex flex-col items-center justify-center text-muted-foreground">
      <p class="text-lg mt-4">
        Either you do not have permission to any text channels or there are none in this server.
      </p>
    </div>
  </div>
{/if}
