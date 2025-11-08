<svelte:options runes={true} />

<script lang="ts">
  let { members, openDetailedProfileModal } = $props<{
    members: unknown;
    openDetailedProfileModal?: (value: unknown) => void;
  }>();
  void members;
  void openDetailedProfileModal;
</script>

<div data-testid="member-sidebar-stub"></div>
