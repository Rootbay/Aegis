<script lang="ts">
  import { lastVisitedServerId } from "$lib/stores/navigationStore";
  import { page } from "$app/stores";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { goto } from "$app/navigation";
  import type { Snippet } from "svelte";

  type Props = {
    children?: Snippet;
  };

  type NavigationFn = (value: string | URL) => void; // eslint-disable-line no-unused-vars

  const gotoUnsafe: NavigationFn = goto as unknown as NavigationFn;

  let { children }: Props = $props();

  let serverId = $state<string | null>(null);
  let currentPathname = $state<string>("");

  $effect(() => {
    const unsubscribe = page.subscribe((p) => {
      serverId = p.params.serverId ?? null;
      currentPathname = p.url.pathname;

      if (serverId && currentPathname.includes("/settings")) {
        lastVisitedServerId.set(serverId);
      }
    });
    return unsubscribe;
  });

  $effect(() => {
    if (serverId && !currentPathname.includes("/settings")) {
      const server = $serverStore.servers.find((s) => s.id === serverId);
      if (!server || !server.channels || !server.members) {
        serverStore.fetchServerDetails(serverId);
      }
      serverStore.setActiveServer(serverId);
    }
  });

  $effect(() => {
    if (
      serverId &&
      $serverStore.servers.length > 0 &&
      !currentPathname.includes("/settings")
    ) {
      const server = $serverStore.servers.find((s) => s.id === serverId);
      if (server && server.channels) {
        const textChannel = server.channels.find(
          (c) => c.channel_type === "text",
        );
        if (textChannel) {
          const targetPath = `/channels/${serverId}/${textChannel.id}`;
          if (currentPathname !== targetPath) {
            // eslint-disable-next-line svelte/no-navigation-without-resolve
            gotoUnsafe(targetPath);
          }
        }
      }
    }
  });
</script>

{#if children}
  {@render children()}
{:else}
  <div class="grow min-w-0 flex items-center justify-center bg-card">
    <div
      class="flex flex-col items-center justify-center text-muted-foreground"
    >
      <p class="text-lg mt-4">
        Either you do not have permission to any text channels or there are none
        in this server.
      </p>
    </div>
  </div>
{/if}
