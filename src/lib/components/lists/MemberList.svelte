<script lang="ts">
  import type { User } from "$lib/features/auth/models/User";

  type OpenUserCardModal = (...args: [User, number, number, boolean]) => void; // eslint-disable-line no-unused-vars

  let {
    members = [],
    openUserCardModal,
  }: { members?: User[]; openUserCardModal: OpenUserCardModal } = $props();

  function openMemberCard(member: User, event: MouseEvent | KeyboardEvent) {
    let x = 0;
    let y = 0;
    if (event instanceof MouseEvent) {
      x = event.clientX;
      y = event.clientY;
    } else {
      const target = event.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }
    console.log("Attempting to open UserCardModal for:", member.name);
    openUserCardModal(member, x, y, true);
  }
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
            onclick={(e) => openMemberCard(member, e)}
            onkeydown={(e) => {
              if (e.key === "Enter") {
                openMemberCard(member, e);
              }
            }}
          >
            <span class="text-white">{member.name}</span>
            <button
              class="text-red-400 hover:text-destructive/80"
              onclick={(e) => e.stopPropagation()}>Remove</button
            >
          </div>
        {/each}
      </ul>
    {:else}
      <p class="text-muted-foreground">No members in this server yet.</p>
    {/if}
  </div>
</div>
