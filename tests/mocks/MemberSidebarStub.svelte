<svelte:options runes={true} />

<script lang="ts">
  let {
    members = [],
    openDetailedProfileModal,
    variant = "desktop",
    mobileOpen = false,
    onMobileOpenChange = () => {},
  } = $props<{
    members?: unknown[];
    openDetailedProfileModal?: (value: unknown) => void;
    variant?: "desktop" | "mobile";
    mobileOpen?: boolean;
    onMobileOpenChange?: (open: boolean) => void;
  }>();
  void members;
  void openDetailedProfileModal;
</script>

{#if variant === "desktop"}
  <div data-testid="desktop-member-sidebar-stub"></div>
{:else}
  {#if mobileOpen}
    <div data-testid="mobile-member-panel-stub">
      <button
        type="button"
        data-testid="close-mobile-members"
        onclick={() => onMobileOpenChange?.(false)}
      >
        Close members
      </button>
    </div>
  {:else}
    <div data-testid="mobile-member-panel-stub" data-open="false"></div>
  {/if}
{/if}
