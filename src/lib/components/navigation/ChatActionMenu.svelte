<svelte:options runes={true} />

<script lang="ts">
  import { tick } from "svelte";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "$lib/components/ui/dialog";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
  import { cn } from "$lib/utils";
  import {
    Bell,
    EllipsisVertical,
    LogOut,
    PanelRight,
    Pencil,
    Pin,
    SlidersHorizontal,
    Users,
  } from "@lucide/svelte";
  import { chatStore } from "$lib/features/chat/stores/chatStore";
  import {
    hasMoreByChatId,
    messagesByChatId,
  } from "$lib/features/chat/stores/chatStore";
  import { memberSidebarVisibilityStore } from "$lib/features/chat/stores/memberSidebarVisibilityStore";
  import { channelDisplayPreferencesStore } from "$lib/features/channels/stores/channelDisplayPreferencesStore";
  import { toasts } from "$lib/stores/ToastStore";
  import { settings } from "$lib/features/settings/stores/settings";
  import type { Chat } from "$lib/features/chat/models/Chat";

  type NavigationFn = (..._args: [string | URL]) => void;

  let { chat, applyPinnedFilter } = $props<{
    chat: Chat | null;
    applyPinnedFilter: () => Promise<void> | void;
  }>();

  const gotoUnsafe: NavigationFn = goto as unknown as NavigationFn;

  let leaveGroupPending = $state(false);
  let showRenameGroupModal = $state(false);
  let renameGroupPending = $state(false);
  let renameGroupName = $state("");
  let renameGroupError = $state<string | null>(null);
  let renameGroupInputRef = $state<HTMLInputElement | null>(null);
  let showChatPreferencesModal = $state(false);
  let readReceiptsToggle = $state(false);
  let typingIndicatorsToggle = $state(false);

  const chatPreferenceOverridesStore = chatStore.chatPreferenceOverrides;
  const settingsStore = settings;

  const hasChatOverrides = $derived.by(() => {
    if (!chat?.id) return false;
    const overrides = $chatPreferenceOverridesStore.get(chat.id);
    if (!overrides) {
      return false;
    }
    return (
      typeof overrides.readReceiptsEnabled === "boolean" ||
      typeof overrides.typingIndicatorsEnabled === "boolean"
    );
  });

  $effect(() => {
    if (!chat?.id) {
      if (readReceiptsToggle !== false) {
        readReceiptsToggle = false;
      }
      if (typingIndicatorsToggle !== false) {
        typingIndicatorsToggle = false;
      }
      return;
    }

    // Access stores to keep the effect reactive when global or overrides change.
    $chatPreferenceOverridesStore;
    $settingsStore;

    const resolved = chatStore.getResolvedChatPreferences(chat.id);
    if (readReceiptsToggle !== resolved.readReceiptsEnabled) {
      readReceiptsToggle = resolved.readReceiptsEnabled;
    }
    if (typingIndicatorsToggle !== resolved.typingIndicatorsEnabled) {
      typingIndicatorsToggle = resolved.typingIndicatorsEnabled;
    }
  });

  const hideMemberNamesActive = $derived.by(() => {
    if (!chat?.id) return false;
    return (
      $channelDisplayPreferencesStore.get(chat.id)?.hideMemberNames ?? false
    );
  });

  const memberSidebarVisible = $derived.by(() => {
    if (!chat?.id) return false;
    const state = $memberSidebarVisibilityStore;
    const entry = state.get(chat.id);
    return entry !== false;
  });

  function openNotificationSettings() {
    gotoUnsafe("/settings/notifications");
  }

  function toggleMemberSidebarVisibility() {
    if (!chat?.id) return;
    memberSidebarVisibilityStore.toggleVisibility(chat.id);
  }

  async function toggleHideMemberList() {
    if (!chat?.id) return;
    try {
      await channelDisplayPreferencesStore.toggleHideMemberNames(chat.id);
    } catch (error) {
      console.error("Failed to toggle hide member names:", error);
    }
  }

  async function openPinnedMessages() {
    if (!chat?.id) return;
    const existingMessages = $messagesByChatId.get(chat.id) ?? [];
    const pinnedLoaded = existingMessages.some((message) => message.pinned);
    const hasMore = $hasMoreByChatId.get(chat.id) ?? false;
    if (!pinnedLoaded && hasMore) {
      try {
        await chatStore.loadMoreMessages(chat.id);
      } catch (error) {
        console.error("Failed to load pinned messages", error);
      }
    }
    await applyPinnedFilter();
  }

  async function handleLeaveGroup() {
    if (!chat || chat.type !== "group" || leaveGroupPending) {
      return;
    }

    const groupId = chat.id;
    const displayName = chat.name?.trim?.() ? chat.name : "this group";
    const confirmed = confirm(`Leave the group "${displayName}"?`);
    if (!confirmed) {
      return;
    }

    leaveGroupPending = true;
    try {
      await chatStore.leaveGroupChat(groupId);
      toasts.addToast(`You left ${displayName}.`, "info");
    } catch (error: any) {
      console.error("Failed to leave group:", error);
      const message =
        error?.message ?? "Failed to leave group. Please try again.";
      toasts.addToast(message, "error");
    } finally {
      leaveGroupPending = false;
    }
  }

  async function openRenameGroupModal() {
    if (!chat || chat.type !== "group") {
      return;
    }
    renameGroupError = null;
    renameGroupName = chat.name ?? "";
    showRenameGroupModal = true;
    await tick();
    renameGroupInputRef?.focus?.();
    renameGroupInputRef?.select?.();
  }

  function closeRenameGroupModal() {
    if (renameGroupPending) {
      return;
    }
    showRenameGroupModal = false;
    renameGroupError = null;
  }

  async function handleRenameGroupSubmit(event?: SubmitEvent) {
    event?.preventDefault?.();
    if (!chat || chat.type !== "group" || renameGroupPending) {
      return;
    }

    const trimmed = renameGroupName.trim();
    if (!trimmed) {
      renameGroupError = "Please enter a group name.";
      return;
    }

    renameGroupPending = true;
    try {
      const summary = await chatStore.renameGroupChat(chat.id, trimmed);
      toasts.addToast(`Group renamed to ${summary.name}.`, "success");
      showRenameGroupModal = false;
      renameGroupError = null;
    } catch (error: any) {
      console.error("Failed to rename group:", error);
      const message =
        error?.message ?? "Failed to rename group. Please try again.";
      renameGroupError = message;
      toasts.addToast(message, "error");
    } finally {
      renameGroupPending = false;
    }
  }

  function openChatPreferences() {
    if (!chat?.id) {
      return;
    }
    showChatPreferencesModal = true;
  }

  function closeChatPreferences() {
    showChatPreferencesModal = false;
  }

  function toggleReadReceiptsPreference() {
    if (!chat?.id) {
      return;
    }
    const next = !readReceiptsToggle;
    chatStore.setChatPreferenceOverride(chat.id, {
      readReceiptsEnabled: next,
    });
  }

  function toggleTypingIndicatorsPreference() {
    if (!chat?.id) {
      return;
    }
    const next = !typingIndicatorsToggle;
    chatStore.setChatPreferenceOverride(chat.id, {
      typingIndicatorsEnabled: next,
    });
  }

  function resetChatPreferences() {
    if (!chat?.id) {
      return;
    }
    chatStore.clearChatPreferenceOverride(chat.id);
  }
</script>

<div class="flex items-center gap-2">
  {#if chat?.type !== "dm"}
    <Button
      variant="ghost"
      class="cursor-pointer"
      size="icon"
      aria-label="Notification Settings"
      onclick={openNotificationSettings}
    >
      <Bell class="w-4 h-4" />
    </Button>
    <Button
      variant="ghost"
      class="cursor-pointer"
      size="icon"
      aria-label="Pinned Messages"
      onclick={openPinnedMessages}
    >
      <Pin class="w-4 h-4" />
    </Button>
    <Button
      variant="ghost"
      class={cn("cursor-pointer", memberSidebarVisible ? "text-cyan-400" : "")}
      size="icon"
      aria-label={memberSidebarVisible
        ? "Hide Member Sidebar"
        : "Show Member Sidebar"}
      onclick={toggleMemberSidebarVisibility}
      aria-pressed={memberSidebarVisible ? "true" : "false"}
    >
      <PanelRight class="w-4 h-4" />
    </Button>
    <Button
      variant="ghost"
      class={cn("cursor-pointer", hideMemberNamesActive ? "text-cyan-400" : "")}
      size="icon"
      aria-label="Hide Member List"
      aria-pressed={hideMemberNamesActive ? "true" : "false"}
      onclick={toggleHideMemberList}
    >
      <Users class="w-4 h-4" />
    </Button>
    {#if chat?.type === "group"}
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button
            variant="ghost"
            class="cursor-pointer"
            size="icon"
            aria-label="Group options"
            disabled={leaveGroupPending || renameGroupPending}
          >
            <EllipsisVertical class="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent class="w-44 text-sm">
          <DropdownMenuItem
            class="cursor-pointer"
            disabled={renameGroupPending}
            onselect={() => {
              if (!renameGroupPending) {
                void openRenameGroupModal();
              }
            }}
          >
            <Pencil class="mr-2 h-3.5 w-3.5" /> Rename group
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            class="cursor-pointer text-destructive"
            onselect={() => {
              if (!leaveGroupPending) {
                void handleLeaveGroup();
              }
            }}
          >
            <LogOut class="mr-2 h-3.5 w-3.5" /> Leave group
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={showRenameGroupModal}
        onOpenChange={(value) => {
          if (!value) {
            closeRenameGroupModal();
          }
        }}
      >
        <DialogContent class="sm:max-w-sm">
          <form class="space-y-4" onsubmit={handleRenameGroupSubmit}>
            <DialogHeader class="space-y-1">
              <DialogTitle>Rename group</DialogTitle>
              <DialogDescription>
                Enter a new name for this group chat.
              </DialogDescription>
            </DialogHeader>
            <div class="space-y-2">
              <Label for="rename-group-input">Group name</Label>
              <Input
                id="rename-group-input"
                bind:ref={renameGroupInputRef}
                bind:value={renameGroupName}
                placeholder="Enter group name"
                disabled={renameGroupPending}
                required
                aria-invalid={renameGroupError ? "true" : "false"}
              />
              {#if renameGroupError}
                <p class="text-sm text-destructive">{renameGroupError}</p>
              {/if}
            </div>
            <DialogFooter class="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onclick={closeRenameGroupModal}
                disabled={renameGroupPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={renameGroupPending ||
                  renameGroupName.trim().length === 0}
              >
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    {/if}
  {/if}

  <Button
    variant="ghost"
    class="cursor-pointer"
    size="icon"
    type="button"
    aria-label="Chat preferences"
    disabled={!chat}
    onclick={openChatPreferences}
  >
    <SlidersHorizontal class="w-4 h-4" />
  </Button>

  <Dialog
    open={showChatPreferencesModal}
    onOpenChange={(value) => {
      if (!value) {
        closeChatPreferences();
      } else {
        showChatPreferencesModal = value;
      }
    }}
  >
    <DialogContent class="sm:max-w-sm">
      <div class="space-y-5">
        <DialogHeader class="space-y-1">
          <DialogTitle>Chat preferences</DialogTitle>
          <DialogDescription>
            Override read receipts and typing indicators for this chat.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div class="flex items-start justify-between gap-4 rounded-md border border-border p-4">
            <div class="space-y-1">
              <Label
                for="chat-preferences-read-receipts"
                class="font-medium"
              >
                Enable read receipts
              </Label>
              <p
                id="chat-preferences-read-receipts-description"
                class="text-sm text-muted-foreground"
              >
                Share read status for messages in this chat.
              </p>
            </div>
            <Switch
              id="chat-preferences-read-receipts"
              aria-describedby="chat-preferences-read-receipts-description"
              bind:checked={readReceiptsToggle}
              onclick={toggleReadReceiptsPreference}
            />
          </div>

          <div class="flex items-start justify-between gap-4 rounded-md border border-border p-4">
            <div class="space-y-1">
              <Label
                for="chat-preferences-typing-indicators"
                class="font-medium"
              >
                Send typing indicators
              </Label>
              <p
                id="chat-preferences-typing-indicators-description"
                class="text-sm text-muted-foreground"
              >
                Let others know when you are typing in this chat.
              </p>
            </div>
            <Switch
              id="chat-preferences-typing-indicators"
              aria-describedby="chat-preferences-typing-indicators-description"
              bind:checked={typingIndicatorsToggle}
              onclick={toggleTypingIndicatorsPreference}
            />
          </div>
        </div>

        <DialogFooter class="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onclick={resetChatPreferences}
            disabled={!hasChatOverrides}
          >
            Reset to defaults
          </Button>
          <Button type="button" variant="ghost" onclick={closeChatPreferences}>
            Close
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  </Dialog>
</div>
