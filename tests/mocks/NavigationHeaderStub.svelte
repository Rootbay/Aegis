<svelte:options runes={true} />

<script lang="ts">
  let { chat, onOpenDetailedProfile } = $props<{
    chat: unknown;
    onOpenDetailedProfile?: (value: unknown) => void;
  }>();
  void chat;
  void onOpenDetailedProfile;
</script>

<div data-testid="navigation-header-stub"></div>
