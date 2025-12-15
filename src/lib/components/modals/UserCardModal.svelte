<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { toasts } from "$lib/stores/ToastStore";
  import { userStore } from "$lib/stores/userStore";
  import { chatStore } from "$lib/features/chat/stores/chatStore";
  import EmojiPicker from "$lib/components/emoji/EmojiPicker.svelte";
  import ImageLightbox from "$lib/components/media/ImageLightbox.svelte";
  import type { User } from "$lib/features/auth/models/User";
  import type { Role } from "$lib/features/servers/models/Role";
  import {
    Card,
    CardHeader,
    CardContent,
    CardTitle,
  } from "$lib/components/ui/card/index";
  import * as Avatar from "$lib/components/ui/avatar/index";
  import * as Popover from "$lib/components/ui/popover/index";
  import { Button } from "$lib/components/ui/button/index";
  import { Input } from "$lib/components/ui/input/index";
  import { Badge } from "$lib/components/ui/badge/index";
  import { Separator } from "$lib/components/ui/separator/index";
  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
  } from "$lib/components/ui/dialog";
  import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
  } from "$lib/components/ui/select";
  import {
    Pencil,
    ChevronRight,
    CircleUserRound,
    Clipboard,
    Smile,
    Plus,
    CornerUpRight,
    Trash2,
  } from "@lucide/svelte";
  import { resolvePresenceStatusLabel } from "$lib/features/presence/statusPresets";
  import { tick } from "svelte";

  type OpenDetailedProfileHandler = (user: User) => void; // eslint-disable-line no-unused-vars

  let {
    profileUser,
    openDetailedProfileModal,
    isServerMemberContext = false,
    close,
    memberRoles = [],
    onAddRoles,
  }: {
    profileUser: User;
    openDetailedProfileModal: OpenDetailedProfileHandler;
    isServerMemberContext?: boolean;
    close?: () => void;
    memberRoles?: Role[];
    onAddRoles?: () => void;
  } = $props();

  let showLightbox = $state(false);
  let lightboxImageUrl = $state("");
  let draftMessage = $state("");
  let isSending = $state(false);
  let messageInputElement = $state<HTMLInputElement | null>(null);
  let showEmojiPicker = $state(false);
  let statusLabelHovered = $state(false);
  const BIO_PREVIEW_MAX_HEIGHT = 112;
  let bioExpanded = $state(true);
  let bioOverflow = $state(false);
  let bioContainer = $state<HTMLDivElement | null>(null);
  const onlineStatusOptions = ["Online", "Idle", "Do Not Disturb", "Invisible"] as const;
  type OnlineStatusOption = (typeof onlineStatusOptions)[number];
  const clearAfterOptions = [
    { value: "dontClear", label: "Don't Clear" },
    { value: "4h", label: "4 hours" },
    { value: "24h", label: "24 hours" },
  ] as const;
  type ClearAfterOption = (typeof clearAfterOptions)[number]["value"];
  const STATUS_COLOR_MAP: Record<OnlineStatusOption, string> = {
    Online: "bg-green-500",
    Idle: "bg-yellow-500",
    "Do Not Disturb": "bg-red-500",
    Invisible: "bg-gray-500",
  };
  let isMyProfile = $derived(profileUser.id === $userStore.me?.id);
  let statusPopoverOpen = $state(false);
  let accountsPopoverOpen = $state(false);
  let showStatusEditDialog = $state(false);
  let statusEditorEmojiPickerOpen = $state(false);
  let statusDraftInput = $state("");
  let clearAfterSelection = $state<ClearAfterOption>("dontClear");
  let statusOverride = $state<string | null>(null);

  let pronounsLabel = $derived(
    (profileUser as { pronouns?: string }).pronouns ??
      (profileUser.tag?.includes("#") ? profileUser.tag.split("#")[0] : null)
  );

  let badgeLabels = $derived(profileUser.roles ?? []);

  let displayAccounts = $derived(
    $userStore.me
      ? [
          {
            id: $userStore.me.id,
            label: $userStore.me.name,
            tag: $userStore.me.tag ?? "",
            avatar: $userStore.me.pfpUrl ?? $userStore.me.avatar,
          },
        ]
      : []
  );

  let selectedPresenceOption = $state<OnlineStatusOption>(
    profileUser.online ? "Online" : "Invisible"
  );

  let statusLabel = $state<string | null>(
    resolvePresenceStatusLabel(profileUser.statusMessage)
  );

  let statusIndicatorColorClass = $derived(() =>
    STATUS_COLOR_MAP[selectedPresenceOption]
  );

  let statusDisplayLabel = $derived(() =>
    selectedPresenceOption !== "Invisible"
      ? selectedPresenceOption
      : statusLabel ?? "Invisible"
  );

  $effect(() => {
    const resolvedLabel = resolvePresenceStatusLabel(profileUser.statusMessage);
    const effectiveLabel =
      statusOverride === "" ? null : statusOverride ?? resolvedLabel;
    statusLabel = effectiveLabel;
  });

  $effect(() => {
    profileUser.bio;
    const container = bioContainer;
    if (!container) {
      bioOverflow = false;
      bioExpanded = true;
      return;
    }

    void (async () => {
      await tick();
      const overflow = container.scrollHeight > BIO_PREVIEW_MAX_HEIGHT;
      bioOverflow = overflow;
      bioExpanded = !overflow;
    })();
  });

  $effect(() => {
    if (!showStatusEditDialog) {
      statusEditorEmojiPickerOpen = false;
    }
  });

  function handleOpenDetailedProfile() {
    close?.();
    openDetailedProfileModal(profileUser);
  }

  async function editProfile() {
    close?.();
    try {
      await goto(resolve("/settings/account"));
    } catch (error) {
      console.error("Failed to navigate to profile settings:", error);
      toasts.addToast("Failed to open profile settings.", "error");
    }
  }

  function openLightbox(imageUrl: string) {
    lightboxImageUrl = imageUrl;
    showLightbox = true;
  }

  async function sendDirectMessage() {
    if (isSending) return;
    const trimmed = draftMessage.trim();
    if (!trimmed || !profileUser?.id) {
      return;
    }

    isSending = true;

    try {
      await chatStore.setActiveChat(profileUser.id, "dm");
      await chatStore.sendMessage(trimmed);
      draftMessage = "";
      messageInputElement?.blur();
      close?.();
    } catch (error) {
      console.error("Failed to send direct message:", error);
      const message =
        error instanceof Error ? error.message : "Failed to send message.";
      toasts.addToast(message, "error");
    } finally {
      isSending = false;
    }
  }

  function toggleEmojiPicker() {
    showEmojiPicker = !showEmojiPicker;
  }

  function closeEmojiPicker() {
    showEmojiPicker = false;
  }

  function handleEmojiSelect(emoji: string) {
    draftMessage += emoji;
    showEmojiPicker = false;
    messageInputElement?.focus();
  }

  function handleSelectStatus(status: OnlineStatusOption) {
    statusPopoverOpen = false;
    toasts.addToast(`Set status to ${status}.`, "success");
    selectedPresenceOption = status;
  }

  function handleSendEmojiQuickAction() {
    showEmojiPicker = true;
    messageInputElement?.focus();
  }

  function handleReplyQuickAction() {
    messageInputElement?.focus();
  }

  function openStatusEditorDialog() {
    statusDraftInput = statusLabel ?? "";
    clearAfterSelection = "dontClear";
    showStatusEditDialog = true;
  }

  function toggleStatusEditorEmojiPicker() {
    statusEditorEmojiPickerOpen = !statusEditorEmojiPickerOpen;
  }

  function handleStatusEditorEmojiSelect(emoji: string) {
    statusDraftInput += emoji;
    statusEditorEmojiPickerOpen = false;
  }

  function handleClearStatus() {
    statusOverride = "";
    statusDraftInput = "";
    toasts.addToast("Status cleared.", "success");
  }

  function saveStatusDraft() {
    const trimmed = statusDraftInput.trim();
    statusOverride = trimmed === "" ? "" : trimmed;
    showStatusEditDialog = false;
    if (clearAfterSelection !== "dontClear") {
      const option = clearAfterOptions.find(
        (item) => item.value === clearAfterSelection,
      );
      const label = option?.label ?? "the selected time";
      toasts.addToast(`Status will clear after ${label}.`, "info");
    }
  }

  async function handleCopyUserId() {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toasts.addToast("Clipboard is unavailable.", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(profileUser.id);
      toasts.addToast("User ID copied to clipboard.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to copy user ID.";
      toasts.addToast(message, "error");
    }
  }

  async function handleManageAccounts() {
    close?.();
    try {
      await goto(resolve("/settings/connected_accounts"));
    } catch (error) {
      console.error("Failed to open connected accounts:", error);
      toasts.addToast("Failed to open account manager.", "error");
    }
    accountsPopoverOpen = false;
  }

  function handleStatusHover(open: boolean) {
    statusPopoverOpen = open;
  }

  function handleAccountsHover(open: boolean) {
    accountsPopoverOpen = open;
  }

  function handleSwitchAccount(label: string) {
    accountsPopoverOpen = false;
    toasts.addToast(`Switched to ${label}.`, "success");
  }
</script>

<Card class="w-[300px] border-none shadow-lg py-0 gap-2">
  <CardHeader class="relative h-[140px] p-0 overflow-hidden shrink-0">
    <Button
      class="h-[105px] w-full bg-cover bg-center rounded-t-xl rounded-b-none"
      style={`background-image: url(${profileUser.bannerUrl || ""})`}
      aria-label="View banner image"
      onclick={() =>
        profileUser.bannerUrl && openLightbox(profileUser.bannerUrl)}
    />
    <div
      class="absolute bottom-5 left-4 right-6 flex items-end justify-between"
    >
      <div class="relative border-none border-card rounded-full bg-card">
        <Button
          class="p-0 border-none bg-none rounded-full cursor-pointer"
          onclick={handleOpenDetailedProfile}
          aria-label="View profile picture"
        >
          <Avatar.Root class="w-20 h-20">
            <Avatar.Image
              src={profileUser.pfpUrl}
              alt={`${profileUser.name}'s profile picture`}
            />
            <Avatar.Fallback>
              {profileUser?.name?.slice(0, 2)?.toUpperCase() ?? "??"}
            </Avatar.Fallback>
          </Avatar.Root>
        </Button>
        <span
          class={`absolute top-8 right-0 w-5 h-5 rounded-full border-2 border-card ${statusIndicatorColorClass}`}
          title={profileUser.online ? "Online" : "Offline"}
        ></span>
      </div>
    </div>
    {#if statusLabel}
      <div
        role="list"
        class="absolute bottom-2 left-4 flex items-start"
        onmouseenter={() => (statusLabelHovered = true)}
        onmouseleave={() => (statusLabelHovered = false)}
      >
        <div class="relative">
          <p class="text-xs font-medium text-muted-foreground bg-muted/70 rounded-xl px-3 py-1">
            {statusLabel}
          </p>
          <div
            class={`absolute -top-9 right-0 flex items-center gap-1 rounded-full transition-opacity duration-150 ${statusLabelHovered ? "opacity-100" : "opacity-0"}`}
          >
            {#if !isMyProfile}
              <Button
                class="p-0 text-muted-foreground"
                variant="ghost"
                size="icon"
                title="Send emoji"
                aria-label="Send emoji"
                onclick={handleSendEmojiQuickAction}
              >
                <Smile size={14} />
              </Button>
              <Button
                class="p-0 text-muted-foreground"
                variant="ghost"
                size="icon"
                title="Reply"
                aria-label="Reply"
                onclick={handleReplyQuickAction}
              >
                <CornerUpRight size={14} />
              </Button>
            {:else}
              <Button
                class="p-0 text-muted-foreground"
                variant="ghost"
                size="icon"
                title="Edit status"
                aria-label="Edit status"
                onclick={openStatusEditorDialog}
              >
                <Pencil size={14} />
              </Button>
              <Button
                class="p-0 text-muted-foreground"
                variant="ghost"
                size="icon"
                title="Clear status"
                aria-label="Clear status"
                onclick={handleClearStatus}
              >
                <Trash2 size={14} />
              </Button>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </CardHeader>

  <CardContent class="max-h-[60vh] px-4 pb-4 flex flex-col gap-1 overflow-auto">
    <div class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <CardTitle class="text-lg font-semibold p-0">
          <button
            class="text-inherit font-inherit cursor-pointer hover:underline"
            onclick={handleOpenDetailedProfile}
          >
            {profileUser.name || "Unknown User"}
          </button>
        </CardTitle>
      </div>
      <div class="flex flex-wrap gap-2 text-sm text-muted-foreground">
        {#if pronounsLabel}
          <Badge variant="outline">{pronounsLabel}</Badge>
        {/if}
        {#if profileUser.tag}
          <Badge>{profileUser.tag}</Badge>
        {/if}
        {#each badgeLabels as badge}
          <Badge variant="secondary">{badge}</Badge>
        {/each}
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <div
        bind:this={bioContainer}
        class="text-sm text-muted-foreground whitespace-pre-wrap overflow-hidden transition-[max-height] duration-150 ease-out"
        style={`max-height:${bioExpanded || !bioOverflow ? "none" : `${BIO_PREVIEW_MAX_HEIGHT}px`};`}
      >
        <p class="m-0">{profileUser.bio}</p>
      </div>
      {#if bioOverflow}
        <Button
          variant="link"
          size="sm"
          class="self-start px-0 text-sm"
          aria-expanded={bioExpanded}
          onclick={() => (bioExpanded = !bioExpanded)}
        >
          {bioExpanded ? "View Less" : "View More"}
        </Button>
      {/if}
    </div>

    {#if isServerMemberContext}
      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          {#if memberRoles.length > 0}
            {#each memberRoles as role}
              <span
                class="flex items-center gap-2 rounded-full border border-muted/50 bg-muted/60 px-3 py-1 text-xs font-semibold text-foreground"
              >
                <span
                  class="h-2.5 w-2.5 rounded-full border border-border"
                  style={`background-color: ${role.color ?? "var(--border)"}`}
                ></span>
                <span>{role.name}</span>
              </span>
            {/each}
            <Button
              variant="outline"
              size="icon"
              class="h-6 w-6"
              aria-label="Add roles"
              onclick={onAddRoles}
              disabled={!onAddRoles}
            >
              <Plus size={12} />
            </Button>
          {:else}
            <Button
              variant="outline"
              class="flex items-center gap-1 h-6 text-[11px] font-normal"
              onclick={onAddRoles}
              disabled={!onAddRoles}
            >
              <Plus size={12} />
              Add Roles
            </Button>
          {/if}
        </div>
        {#if !isMyProfile}
          <div class="flex w-full gap-2">
            <Input
              class="w-full"
              type="text"
              placeholder={`Message @${profileUser.name}`}
              bind:value={draftMessage}
              bind:ref={messageInputElement}
              onkeydown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendDirectMessage();
                }
              }}
              disabled={isSending}
            />
            <div class="relative shrink-0">
              <Button
                type="button"
                variant="ghost"
                class="h-10 w-10 p-0"
                aria-label="Insert emoji"
                aria-haspopup="dialog"
                aria-expanded={showEmojiPicker}
                aria-controls="user-card-emoji-picker"
                onclick={toggleEmojiPicker}
              >
                <Smile size={20} />
              </Button>
              {#if showEmojiPicker}
                <div
                  class="absolute bottom-full right-0 z-40 mb-2"
                  id="user-card-emoji-picker"
                >
                  <EmojiPicker
                    on:select={(event) => handleEmojiSelect(event.detail.emoji)}
                    on:close={closeEmojiPicker}
                  />
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <Button
            variant="secondary"
            onclick={editProfile}
          >
            <Pencil/>
            Edit Profile
          </Button>
        {/if}
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        <div class="rounded-md bg-background/20 p-2">
          <div class="flex flex-col gap-2">
            <Button
              variant="ghost"
              class="w-full justify-start items-center gap-2 h-8"
              onclick={editProfile}
            >
              <Pencil size={16} />
              <span class="flex-1 text-left">Edit Profile</span>
            </Button>
            <Separator />
            <Popover.Root
              open={statusPopoverOpen}
              onOpenChange={(open) => (statusPopoverOpen = open)}
            >
                <div
                  role="list"
                  class="flex flex-col gap-0"
                  onmouseenter={() => handleStatusHover(true)}
                  onmouseleave={() => handleStatusHover(false)}
                >
                <Popover.Trigger>
                  <Button
                    variant="ghost"
                    class="w-full justify-start items-center gap-2 h-8"
                    aria-label="Online status selector"
                  >
                    <span
                      class={`w-3 h-3 rounded-full inline-block ${statusIndicatorColorClass}`}
                    ></span>
                    <span class="flex-1 text-left">
                      {statusDisplayLabel}
                    </span>
                    <span class="ml-auto text-muted-foreground">
                      <ChevronRight size={16} />
                    </span>
                  </Button>
                </Popover.Trigger>
                <Popover.Content
                  side="left"
                  align="center"
                  class="w-48 p-2 space-y-1"
                  sideOffset={6}
                  onmouseenter={() => handleStatusHover(true)}
                  onmouseleave={() => handleStatusHover(false)}
                >
                {#each onlineStatusOptions as option}
                  <Button
                    class="w-full justify-start items-center gap-2 h-8"
                    variant="ghost"
                    onclick={() => handleSelectStatus(option)}
                  >
                    <span
                      class={`w-3 h-3 rounded-full inline-block ${STATUS_COLOR_MAP[option]}`}
                    ></span>
                    {option}
                  </Button>
                {/each}
                </Popover.Content>
              </div>
            </Popover.Root>
          </div>
        </div>
        <div class="rounded-md bg-background/20 p-2">
          <div class="flex flex-col gap-2">
            <Popover.Root
              open={accountsPopoverOpen}
              onOpenChange={(open) => (accountsPopoverOpen = open)}
            >
              <div
                role="list"
                class="flex flex-col gap-0"
                onmouseenter={() => handleAccountsHover(true)}
                onmouseleave={() => handleAccountsHover(false)}
              >
                <Popover.Trigger>
                  <Button
                    variant="ghost"
                    class="w-full justify-start items-center gap-2 mb-2 h-8"
                    aria-label="Open account switcher"
                  >
                    <CircleUserRound size={16} />
                    <span class="flex-1 text-left">Switch Accounts</span>
                    <span class="ml-auto text-muted-foreground">
                      <ChevronRight size={16} />
                    </span>
                  </Button>
                </Popover.Trigger>
                <Separator />
                <Popover.Content
                  side="left"
                  align="start"
                  class="w-56 space-y-2 p-3"
                  sideOffset={6}
                  onmouseenter={() => handleAccountsHover(true)}
                  onmouseleave={() => handleAccountsHover(false)}
                >
                  <div class="flex flex-col gap-2">
                    {#if displayAccounts.length === 0}
                      <p class="text-xs text-muted-foreground">No linked accounts yet.</p>
                    {/if}
                  {#each displayAccounts as account}
                    <Button
                      variant="ghost"
                      class="w-full justify-start items-center gap-2 h-8"
                      onclick={() => handleSwitchAccount(account.label)}
                    >
                      <Avatar.Root class="h-5 w-5">
                        <Avatar.Image
                          src={account.avatar}
                          alt={`${account.label}'s avatar`}
                        />
                        <Avatar.Fallback>
                          {account.label?.slice(0, 2)?.toUpperCase() ?? "??"}
                        </Avatar.Fallback>
                      </Avatar.Root>
                      <span class="flex-1 text-left">{account.label}</span>
                      {#if account.tag}
                        <span class="text-xs text-muted-foreground">{account.tag}</span>
                      {/if}
                    </Button>
                  {/each}
                    <Separator />
                    <Button
                      class="w-full justify-start items-center gap-2 h-8"
                      variant="ghost"
                      size="sm"
                      onclick={handleManageAccounts}
                    >
                      Manage Accounts
                    </Button>
                  </div>
                </Popover.Content>
              </div>
            </Popover.Root>
            <Button
              class="w-full justify-start items-center gap-2 h-8"
              variant="ghost"
              onclick={handleCopyUserId}
            >
              <Clipboard size={16} />
              <span class="flex-1 text-left">Copy User ID</span>
            </Button>
          </div>
        </div>
        {#if !isMyProfile}
          <div class="flex w-full gap-2">
            <Input
              class="w-full"
              type="text"
              placeholder={`Message @${profileUser.name}`}
              bind:value={draftMessage}
              bind:ref={messageInputElement}
              onkeydown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendDirectMessage();
                }
              }}
              disabled={isSending}
            />
            <div class="relative shrink-0">
              <Button
                type="button"
                variant="ghost"
                class="h-10 w-10 p-0"
                aria-label="Insert emoji"
                aria-haspopup="dialog"
                aria-expanded={showEmojiPicker}
                aria-controls="user-card-emoji-picker"
                onclick={toggleEmojiPicker}
              >
                <Smile size={20} />
              </Button>
              {#if showEmojiPicker}
                <div
                  class="absolute bottom-full right-0 z-40 mb-2"
                  id="user-card-emoji-picker"
                >
                  <EmojiPicker
                    on:select={(event) => handleEmojiSelect(event.detail.emoji)}
                    on:close={closeEmojiPicker}
                  />
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </CardContent>
</Card>

<Dialog bind:open={showStatusEditDialog}>
  <DialogContent class="sm:max-w-lg">
    <DialogHeader class="text-left">
      <DialogTitle>Set your status</DialogTitle>
      <DialogDescription>
        Choose the message that appears on your profile card and let folks know what you’re doing.
      </DialogDescription>
    </DialogHeader>

    <div class="space-y-4">
      <div class="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div class="flex items-center gap-3">
          <Avatar.Root class="h-10 w-10">
            <Avatar.Image
              src={profileUser.pfpUrl}
              alt={`${profileUser.name}'s avatar`}
            />
            <Avatar.Fallback>
              {profileUser?.name?.slice(0, 2)?.toUpperCase() ?? "??"}
            </Avatar.Fallback>
          </Avatar.Root>
          <div class="flex flex-col">
            <span class="text-sm font-semibold text-foreground">
              {profileUser.name || "Unknown User"}
            </span>
            <span class="text-xs text-muted-foreground">
              {profileUser.tag ?? profileUser.id?.slice(0, 8)}
            </span>
          </div>
        </div>
        <div class="mt-3 rounded-full bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
          {statusDraftInput.trim() || statusLabel || "No status set"}
        </div>
      </div>

      <div class="space-y-2">
        <p class="text-sm font-semibold text-foreground">Status</p>
        <div class="flex items-center gap-2">
          <Input
            class="flex-1"
            type="text"
            placeholder="Share what you’re doing..."
            bind:value={statusDraftInput}
          />
          <div class="relative shrink-0">
            <Button
              type="button"
              variant="ghost"
              class="h-10 w-10 p-0"
              aria-haspopup="dialog"
              aria-expanded={statusEditorEmojiPickerOpen}
              aria-label="Insert emoji"
              onclick={toggleStatusEditorEmojiPicker}
            >
              <Smile size={18} />
            </Button>
            {#if statusEditorEmojiPickerOpen}
              <div class="absolute bottom-full right-0 z-40 mb-2">
                <EmojiPicker
                  on:select={(event) =>
                    handleStatusEditorEmojiSelect(event.detail.emoji)
                  }
                  on:close={() => (statusEditorEmojiPickerOpen = false)}
                />
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>

    <DialogFooter class="flex flex-col gap-3">
      <div class="flex justify-end items-center gap-3">
        <span class="text-sm font-medium text-muted-foreground">Clear After</span>
        <Select type="single" bind:value={clearAfterSelection}>
          <SelectTrigger class="w-[150px]">
            {#if clearAfterOptions.find((option) => option.value === clearAfterSelection)}
              {clearAfterOptions.find((option) => option.value === clearAfterSelection)?.label}
            {:else}
              Don't Clear
            {/if}
          </SelectTrigger>
          <SelectContent>
            {#each clearAfterOptions as option (option.value)}
              <SelectItem value={option.value}>{option.label}</SelectItem>
            {/each}
          </SelectContent>
        </Select>
      </div>
      <div class="flex justify-end gap-2">
        <DialogClose>
          <Button type="button" variant="outline">Cancel</Button>
        </DialogClose>
        <Button type="button" onclick={saveStatusDraft}>
          Save status
        </Button>
      </div>
    </DialogFooter>
  </DialogContent>
</Dialog>

{#if showLightbox}
  <ImageLightbox
    imageUrl={lightboxImageUrl}
    show={showLightbox}
    onClose={() => (showLightbox = false)}
  />
{/if}
