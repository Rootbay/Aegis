<script lang="ts">
  import {
    Dialog,
    DialogHeader,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from "$lib/components/ui/dialog/index";
  import { Label } from "$lib/components/ui/label/index";
  import { Input } from "$lib/components/ui/input/index";
  import { Button } from "$lib/components/ui/button/index";
  import { Check } from "@lucide/svelte";

  let {
    open = false,
    renameValue = $bindable(""),
    categoryName = "",
    onClose = () => {},
    onSubmit = () => {},
  } = $props<{
    open?: boolean;
    renameValue?: string;
    categoryName?: string;
    onClose?: () => void;
    onSubmit?: () => void;
  }>();

  function handleOpenChange(value: boolean) {
    if (!value) onClose();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }
  }
</script>

<Dialog open={open} onOpenChange={handleOpenChange}>
  <DialogContent data-testid="rename-category-modal">
    <DialogHeader>
      <DialogTitle>Rename Category</DialogTitle>
      <DialogDescription>
        Update the name for {categoryName || "this category"}.
      </DialogDescription>
    </DialogHeader>
    <div class="space-y-4">
      <div class="space-y-2">
        <Label
          for="rename-category-name"
          class="text-xs font-semibold uppercase text-muted-foreground"
        >
          Category Name
        </Label>
        <Input
          id="rename-category-name"
          placeholder="Operations"
          bind:value={renameValue}
          onkeydown={handleKeydown}
        />
      </div>
    </div>
    <DialogFooter>
      <Button variant="ghost" onclick={onClose}>
        Cancel
      </Button>
      <Button onclick={onSubmit} disabled={!renameValue.trim()}>
        <Check size={14} class="mr-2" /> Save Changes
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
