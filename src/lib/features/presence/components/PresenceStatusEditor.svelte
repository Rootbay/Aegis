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
  import { MessageSquareText } from "@lucide/svelte";
  import {
    PRESENCE_STATUS_OPTIONS,
    type PresenceStatusKey,
  } from "$lib/features/presence/statusPresets";
  import { cn } from "$lib/utils";

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
  let statusDraft = $state<PresenceStatusKey>(PRESENCE_STATUS_OPTIONS[0].key);
  let presenceSaving = $state(false);
  let presenceError = $state<string | null>(null);

  function resetDrafts() {
    statusDraft = $presenceStore.statusKey;
    presenceError = null;
  }

  async function handlePresenceSave() {
    presenceSaving = true;
    presenceError = null;
    try {
      const result = await presenceStore.broadcastPresence({
        statusKey: statusDraft,
      });
      userStore.applyPresence({
        statusMessage: result.statusKey,
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
        <Label for="presence-status-message">Status</Label>
        <div class="grid gap-2" id="presence-status-message">
          {#each PRESENCE_STATUS_OPTIONS as option}
            <Button
              type="button"
              variant={statusDraft === option.key ? "default" : "outline"}
              class={cn(
                "justify-start w-full cursor-pointer",
                statusDraft === option.key ? "ring-2 ring-ring" : "",
              )}
              aria-pressed={statusDraft === option.key}
              onclick={() => {
                statusDraft = option.key;
              }}
            >
              {option.label}
            </Button>
          {/each}
        </div>
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
