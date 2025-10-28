<svelte:options runes={true} />

<script lang="ts">
  import { channelDisplayPreferencesStore } from "$lib/features/channels/stores/channelDisplayPreferencesStore";

  type ChatType = "dm" | "channel" | "group";

  let {
    chatType,
    channelId = null,
    senderName = "",
    onNameClick,
    onNameContextMenu,
    className = "",
  }: {
    chatType: ChatType;
    channelId?: string | null;
    senderName?: string;
    onNameClick?: (event: MouseEvent) => void;
    onNameContextMenu?: (event: MouseEvent) => void;
    className?: string;
  } = $props();

  const hiddenMemberLabel = "Hidden Member";

  const hideNames = $derived(
    chatType === "channel" && channelId
      ? ($channelDisplayPreferencesStore.get(channelId)?.hideMemberNames ??
          false)
      : false,
  );

  const displayName = $derived(
    hideNames ? hiddenMemberLabel : (senderName ?? hiddenMemberLabel),
  );

  function handleClick(event: MouseEvent) {
    onNameClick?.(event);
  }

  function handleContextMenu(event: MouseEvent) {
    onNameContextMenu?.(event);
  }
</script>

<button
  class={className}
  type="button"
  onclick={handleClick}
  oncontextmenu={handleContextMenu}
>
  {displayName}
</button>
