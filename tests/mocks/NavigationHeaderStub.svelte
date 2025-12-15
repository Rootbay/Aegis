<svelte:options runes={true} />

<script lang="ts">
  let {
    chat,
    onOpenDetailedProfile,
    showMemberPanelToggle = false,
    mobileMemberPanelOpen = false,
    onToggleMemberPanel = () => {},
  } = $props<{
    chat: unknown;
    onOpenDetailedProfile?: (prof: unknown) => void;
    showMemberPanelToggle?: boolean;
    mobileMemberPanelOpen?: boolean;
    onToggleMemberPanel?: () => void;
  }>();
  void chat;
  void onOpenDetailedProfile;
</script>

<div data-testid="navigation-header-stub">
  {#if showMemberPanelToggle}
    <button
      type="button"
      data-testid="mobile-members-toggle"
      aria-pressed={mobileMemberPanelOpen}
      onclick={() => onToggleMemberPanel?.()}
    >
      Toggle members
    </button>
  {/if}
</div>
