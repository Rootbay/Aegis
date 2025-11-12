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
  import { Switch } from "$lib/components/ui/switch/index";
  import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
  } from "$lib/components/ui/tooltip/index";
  import { Button } from "$lib/components/ui/button/index";
  import { Check, Hash, Info, Mic, Plus } from "@lucide/svelte";

  let {
    open = false,
    editingChannelId = null,
    newChannelType = $bindable<"text" | "voice">("text"),
    newChannelName = $bindable(""),
    newChannelPrivate = $bindable(false),
    submitChannelForm = () => undefined,
    closeChannelModal = () => undefined,
    openPrivateChannelAccessDialog = () => undefined,
    onOpenChange,
  } = $props<{
    open?: boolean;
    editingChannelId?: string | null;
    newChannelType?: "text" | "voice";
    newChannelName?: string;
    newChannelPrivate?: boolean;
    submitChannelForm?: () => void;
    closeChannelModal?: () => void;
    openPrivateChannelAccessDialog?: () => void;
    onOpenChange?: (value: boolean) => void;
  }>();
</script>

<Dialog
  open={open}
  onOpenChange={(value: boolean) => {
    onOpenChange?.(value);
  }}
>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>
        {editingChannelId ? "Edit Channel" : "Create Channel"}
      </DialogTitle>
      <DialogDescription>
        {editingChannelId
          ? "Update channel settings, permissions, and slowmode."
          : "Create a text or voice channel with a name, optional topic, and privacy."}
      </DialogDescription>
    </DialogHeader>

    <div class="space-y-6">
      <div>
        <Label class="text-xs font-semibold uppercase text-muted-foreground mb-2">
          Channel Type
        </Label>
        <div class="flex flex-col gap-3 w-full">
          <Button
            type="button"
            variant={newChannelType === "text" ? "secondary" : "outline"}
            class="w-full flex items-center gap-3 justify-start text-left py-4! h-auto!"
            onclick={() => (newChannelType = "text")}
          >
            <Hash size={16} />
            <div>
              <div class="text-sm font-medium">Text</div>
              <div class="text-xs text-muted-foreground">
                Chat with messages, images, links
              </div>
            </div>
          </Button>
          <Button
            type="button"
            variant={newChannelType === "voice" ? "secondary" : "outline"}
            class="w-full flex items-center gap-3 justify-start text-left py-4! h-auto!"
            onclick={() => (newChannelType = "voice")}
          >
            <Mic size={16} />
            <div>
              <div class="text-sm font-medium">Voice</div>
              <div class="text-xs text-muted-foreground">
                Talk, video, and share screen
              </div>
            </div>
          </Button>
        </div>
      </div>

      <div>
        <Label
          for="channel-name"
          class="text-xs font-semibold uppercase text-muted-foreground mb-2"
        >
          Channel Name
        </Label>
        <div class="flex items-center bg-muted border border-border rounded-md px-3 focus-within:ring-2 focus-within:ring-ring">
          {#if newChannelType === "text"}
            <span class="text-muted-foreground mr-2">#</span>
          {:else if newChannelType === "voice"}
            <Mic size={12} class="text-muted-foreground mr-2" />
          {/if}
          <Input
            id="channel-name"
            placeholder={
              newChannelType === "text" ? "new-channel" : "New Voice Channel"
            }
            class="flex-1 border-0 bg-transparent px-0 py-2 text-sm focus-visible:ring-0"
            bind:value={newChannelName}
            autofocus
            onkeydown={(e) => {
              if (e.key === "Enter") submitChannelForm();
            }}
          />
        </div>
      </div>

      <div class="flex items-center justify-between gap-4">
        <div class="flex flex-col">
          <span class="text-sm font-medium flex items-center gap-1">
            Private Channel
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="text-muted-foreground hover:text-foreground"
                    aria-label="More info about private channels"
                  >
                    <Info size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  align="start"
                  class="max-w-xs text-xs leading-snug"
                >
                  When enabled, only selected members and roles will be able to see and join this channel.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </span>
          <span class="text-xs text-muted-foreground">
            Restrict access to specific members or roles
          </span>
        </div>
        <Switch bind:checked={newChannelPrivate} id="priv" aria-label="Private Channel" />
      </div>
    </div>

    <DialogFooter>
      <Button variant="ghost" onclick={closeChannelModal}>Cancel</Button>
      {#if editingChannelId}
        <Button onclick={submitChannelForm} disabled={!newChannelName.trim()}>
          <Check size={14} class="mr-2" /> Save Changes
        </Button>
      {:else if newChannelPrivate}
        <Button
          onclick={openPrivateChannelAccessDialog}
          disabled={!newChannelName.trim()}
        >
          Next
        </Button>
      {:else}
        <Button onclick={submitChannelForm} disabled={!newChannelName.trim()}>
          <Plus size={14} class="mr-2" /> Create Channel
        </Button>
      {/if}
    </DialogFooter>
  </DialogContent>
</Dialog>
