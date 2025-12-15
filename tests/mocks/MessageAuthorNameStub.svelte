<svelte:options runes={true} />

<script lang="ts">
  let {
    senderName = "",
    className = "",
    chatType = "",
    channelId = null,
    onNameClick,
    onNameContextMenu,
  } = $props<{
    senderName?: string;
    className?: string;
    chatType?: string;
    channelId?: string | null;
    onNameClick?: (event: MouseEvent) => void;
    onNameContextMenu?: (event: MouseEvent) => void;
  }>();
  void chatType;
  void channelId;
</script>

<button
  type="button"
  class={className}
  onclick={onNameClick}
  oncontextmenu={(event) => {
    event.preventDefault();
    onNameContextMenu?.(event);
  }}
>
  {senderName}
</button>
