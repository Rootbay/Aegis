<svelte:options runes={true} />

<script lang="ts">
  import { presenceStore } from "$lib/features/presence/presenceStore";
  import { userStore } from "$lib/stores/userStore";
  import { Button } from "$lib/components/ui/button";
  import {
    Popover,
    PopoverTrigger,
    PopoverContent,
  } from "$lib/components/ui/popover";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Input } from "$lib/components/ui/input";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { MessageSquareText, MapPin } from "@lucide/svelte";

  type Props = {
    label?: string;
    variant?:
      | "default"
      | "destructive"
      | "ghost"
      | "link"
      | "outline"
      | "secondary";
    size?: "default" | "sm" | "lg" | "icon";
    buttonClass?: string;
  };

  let { label, variant = "ghost", size, buttonClass = "" }: Props = $props();

  const resolvedSize = $derived(size ?? (label ? "default" : "icon"));

  let presenceEditorOpen = $state(false);
  let statusDraft = $state("");
  let locationDraft = $state("");
  let locationConsentDraft = $state(false);
  let presenceSaving = $state(false);
  let presenceError = $state<string | null>(null);

  function resetDrafts() {
    statusDraft = $presenceStore.statusMessage;
    locationDraft = $presenceStore.locationInput;
    locationConsentDraft = $presenceStore.locationConsent;
    presenceError = null;
  }

  async function handlePresenceSave() {
    presenceSaving = true;
    presenceError = null;
    try {
      const result = await presenceStore.broadcastPresence({
        statusMessage: statusDraft,
        locationInput: locationDraft,
        locationConsent: locationConsentDraft,
      });
      userStore.applyPresence({
        statusMessage: result.statusMessage,
        location: result.location,
      });
      presenceEditorOpen = false;
    } catch (error) {
      presenceError =
        error instanceof Error
          ? error.message
          : String(error ?? "Failed to update status.");
    } finally {
      presenceSaving = false;
    }
  }
</script>

<Popover
  open={presenceEditorOpen}
  onOpenChange={(open) => {
    presenceEditorOpen = open;
    if (open) {
      resetDrafts();
      presenceStore.clearError();
    } else {
      presenceStore.clearError();
      presenceError = null;
    }
  }}
>
  <PopoverTrigger>
    <Button
      type="button"
      {variant}
      size={resolvedSize}
      class={`cursor-pointer ${label ? "flex items-center gap-2" : ""} ${buttonClass}`}
      aria-label={label
        ? `Update ${label.toLowerCase()}`
        : "Update presence status"}
    >
      <MessageSquareText class="w-4 h-4" />
      {#if label}
        <span class="text-sm font-medium">{label}</span>
      {/if}
    </Button>
  </PopoverTrigger>
  <PopoverContent class="w-80 space-y-4 p-4">
    <div class="space-y-3">
      <div class="space-y-2">
        <Label for="presence-status-message">Status message</Label>
        <Textarea
          id="presence-status-message"
          rows={3}
          bind:value={statusDraft}
          placeholder="Share what you're up to"
        />
      </div>
      <div class="flex items-center justify-between gap-4">
        <div class="space-y-1">
          <Label for="presence-location-toggle">Share location</Label>
          <p class="text-xs text-muted-foreground">
            Broadcast an approximate location to friends and servers.
          </p>
        </div>
        <Switch
          id="presence-location-toggle"
          aria-label="Toggle location sharing"
          bind:checked={locationConsentDraft}
        />
      </div>
      <div class="space-y-2">
        <Label for="presence-location">Location</Label>
        <Input
          id="presence-location"
          bind:value={locationDraft}
          placeholder="City, Region"
          disabled={!locationConsentDraft}
        />
        <p class="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin class="h-3 w-3" />
          <span>Only shared when location sharing is enabled.</span>
        </p>
      </div>
      {#if presenceError}
        <p class="text-sm text-destructive">{presenceError}</p>
      {:else if $presenceStore.lastError}
        <p class="text-sm text-destructive">{$presenceStore.lastError}</p>
      {/if}
      <div class="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onclick={() => {
            presenceEditorOpen = false;
            presenceStore.clearError();
            presenceError = null;
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onclick={handlePresenceSave}
          disabled={presenceSaving}
          class="cursor-pointer"
        >
          {#if presenceSaving}
            Saving...
          {:else}
            Save status
          {/if}
        </Button>
      </div>
    </div>
  </PopoverContent>
</Popover>
