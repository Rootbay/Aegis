<script lang="ts">
  import {
    Dialog,
    DialogHeader,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from "$lib/components/ui/dialog/index";
  import { Button } from "$lib/components/ui/button/index";
  import { Label } from "$lib/components/ui/label/index";
  import { Check } from "@lucide/svelte";
  import type {
    CategoryNotificationLevel,
  } from "$lib/features/channels/stores/categoryNotificationPreferencesStore";
  import { DEFAULT_CATEGORY_NOTIFICATION_LEVEL } from "$lib/features/channels/stores/categoryNotificationPreferencesStore";

  let {
    open = false,
    categoryName = "",
    pendingLevel = $bindable(DEFAULT_CATEGORY_NOTIFICATION_LEVEL),
    onClose = () => {},
    onSave = () => {},
  } = $props<{
    open?: boolean;
    categoryName?: string;
    pendingLevel?: CategoryNotificationLevel;
    onClose?: () => void;
    onSave?: () => void;
  }>();

  const CATEGORY_NOTIFICATION_OPTIONS: Array<{
    value: CategoryNotificationLevel;
    label: string;
    description: string;
  }> = [
    {
      value: "all_messages",
      label: "All Messages",
      description: "Get notified for every message in this category.",
    },
    {
      value: "mentions_only",
      label: "Mentions Only",
      description: "Only notify when you are mentioned or replied to.",
    },
    {
      value: "nothing",
      label: "Nothing",
      description: "Silence notifications while keeping the category visible.",
    },
  ];

  function handleOpenChange(value: boolean) {
    if (!value) onClose();
  }
</script>

<Dialog open={open} onOpenChange={handleOpenChange}>
  <DialogContent data-testid="category-notifications-modal">
    <DialogHeader>
      <DialogTitle>Category Notifications</DialogTitle>
      <DialogDescription>
        Choose how you'd like to be notified about {categoryName || "this"}.
      </DialogDescription>
    </DialogHeader>
    <div class="space-y-4">
      <div class="space-y-2">
        <Label class="text-xs font-semibold uppercase text-muted-foreground">
          Delivery Preference
        </Label>
        <div class="space-y-2">
          {#each CATEGORY_NOTIFICATION_OPTIONS as option (option.value)}
            <Button
              type="button"
              variant={pendingLevel === option.value ? "secondary" : "outline"}
              class="flex w-full flex-col items-start gap-1 text-left"
              data-testid={`category-notification-option-${option.value}`}
              onclick={() => (pendingLevel = option.value)}
            >
              <span class="text-sm font-medium">{option.label}</span>
              <span class="text-xs text-muted-foreground">
                {option.description}
              </span>
            </Button>
          {/each}
        </div>
      </div>
      <div class="rounded-md border border-border/60 bg-muted/10 p-3 text-xs text-muted-foreground">
        Muting notifications won't hide the category, but it will silence
        pings and sounds from its channels.
      </div>
    </div>
    <DialogFooter>
      <Button variant="ghost" onclick={onClose}>
        Cancel
      </Button>
      <Button onclick={onSave}>
        <Check size={14} class="mr-2" /> Save Preference
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
