<script lang="ts">
  import type { User } from "$lib/features/auth/models/User";
  import { serverStore } from "$lib/features/servers/stores/serverStore";
  import { toasts } from "$lib/stores/ToastStore";

  type OpenUserCardModal = (...args: [User, number, number, boolean]) => void; // eslint-disable-line no-unused-vars
  const noopOpenUserCard: OpenUserCardModal = () => {};
  type MemberRemovedHandler = (member: User) => void | Promise<void>; // eslint-disable-line no-unused-vars
  const noopMemberRemoved: MemberRemovedHandler = () => {};

  let {
    members = [],
    openUserCardModal = noopOpenUserCard,
    serverId = undefined,
    onMemberRemoved = noopMemberRemoved,
  }: {
    members?: User[];
    openUserCardModal?: OpenUserCardModal;
    serverId?: string;
    onMemberRemoved?: MemberRemovedHandler;
  } = $props();

  let removalStates = $state<Record<string, boolean>>({});
  let resolvedServerId = $derived(
    serverId ?? $serverStore.activeServerId ?? null,
  );

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

  function setRemovalState(memberId: string, value: boolean) {
    removalStates = { ...removalStates, [memberId]: value };
  }

  async function handleRemoveMember(member: User, event: MouseEvent) {
    event.stopPropagation();

    if (!resolvedServerId) {
      toasts.addToast("No server selected.", "error");
      return;
    }

    setRemovalState(member.id, true);

    try {
      const result = await serverStore.removeMember(
        resolvedServerId,
        member.id,
      );

      if (!result.success) {
        if (result.error) {
          toasts.addToast(result.error, "error");
        } else {
          toasts.addToast("Failed to remove member.", "error");
        }
        return;
      }

      const displayName = member.name?.trim().length ? member.name : "Member";
      toasts.addToast(`${displayName} removed from server.`, "success");

      await onMemberRemoved(member);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to remove member.";
      toasts.addToast(message, "error");
    } finally {
      setRemovalState(member.id, false);
    }
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
              class="text-red-400 hover:text-destructive/80 disabled:opacity-60 disabled:cursor-not-allowed"
              onclick={(e) => handleRemoveMember(member, e)}
              disabled={!!removalStates[member.id]}
            >
              {#if removalStates[member.id]}
                Removing…
              {:else}
                Remove
              {/if}
            </button>
          </div>
        {/each}
      </ul>
    {:else}
      <p class="text-muted-foreground">No members in this server yet.</p>
    {/if}
  </div>
</div>
