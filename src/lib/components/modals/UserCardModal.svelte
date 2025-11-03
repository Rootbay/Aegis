<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { toasts } from "$lib/stores/ToastStore";
  import { userStore } from "$lib/stores/userStore";
  import { chatStore } from "$lib/features/chat/stores/chatStore";
  import ImageLightbox from "$lib/components/media/ImageLightbox.svelte";
  import type { User } from "$lib/features/auth/models/User";
  import {
    Card,
    CardHeader,
    CardContent,
    CardFooter,
    CardTitle,
  } from "$lib/components/ui/card/index.js";
  import * as Avatar from "$lib/components/ui/avatar/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Pencil, MapPin } from "@lucide/svelte";
  import PresenceStatusEditor from "$lib/features/presence/components/PresenceStatusEditor.svelte";

  type OpenDetailedProfileHandler = (user: User) => void; // eslint-disable-line no-unused-vars

  let {
    profileUser,
    openDetailedProfileModal,
    isServerMemberContext = false,
    close,
    serverId = null,
  }: {
    profileUser: User;
    openDetailedProfileModal: OpenDetailedProfileHandler;
    isServerMemberContext?: boolean;
    close?: () => void;
    serverId?: string | null;
  } = $props();

  let showLightbox = $state(false);
  let lightboxImageUrl = $state("");

  let isMyProfile = $derived(profileUser.id === $userStore.me?.id);
  let draftMessage = $state("");
  let isSending = $state(false);
  let messageInputElement = $state<HTMLInputElement | null>(null);

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

  async function handleManageRoles() {
    close?.();

    if (!serverId) {
      toasts.addToast("Server information unavailable.", "error");
      return;
    }

    try {
      const encodedServerId = encodeURIComponent(serverId);
      const encodedMemberId = encodeURIComponent(profileUser.id);
      const target = resolve(
        `/channels/${encodedServerId}/settings?tab=members&focus=${encodedMemberId}`,
      );
      await goto(target);
    } catch (error) {
      console.error("Failed to open role management:", error);
      toasts.addToast("Failed to open role management.", "error");
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
</script>

<Card class="w-[340px] border-none shadow-lg">
  <CardHeader class="relative p-0 shrink-0 h-[100px]">
    <Button
      style={`background-image: url(${profileUser.bannerUrl || ""})`}
      aria-label="View banner image"
      onclick={() =>
        profileUser.bannerUrl && openLightbox(profileUser.bannerUrl)}
    />
    <div
      class="absolute bottom-0 left-4 right-4 flex items-end justify-between"
    >
      <div class="relative border-4 border-card rounded-full bg-card">
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
          class="absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-card"
          class:bg-green-500={profileUser.online}
          class:bg-gray-500={!profileUser.online}
          title={profileUser.online ? "Online" : "Offline"}
        ></span>
      </div>
    </div>
  </CardHeader>

  <CardContent class="pt-2 pb-4 px-4 grow overflow-y-auto">
    <CardTitle class="text-xl font-bold">
      <Button
        class="p-0 border-none bg-transparent text-inherit font-inherit cursor-pointer hover:underline"
        onclick={handleOpenDetailedProfile}
      >
        {profileUser.name || "Unknown User"}
      </Button>
    </CardTitle>

    <div class="flex items-center gap-2 text-sm text-muted-foreground mb-4">
      <span>{profileUser.tag || ""}</span>
      <Badge variant="secondary">Aegis Member</Badge>
    </div>

    <p class="text-sm mb-4 whitespace-pre-wrap break-word">
      {profileUser.bio || ""}
    </p>

    {#if profileUser.statusMessage}
      <p class="text-sm text-muted-foreground mb-2">
        {profileUser.statusMessage}
      </p>
    {/if}

    {#if profileUser.location}
      <p class="text-sm text-muted-foreground mb-4 flex items-center gap-2">
        <MapPin class="h-4 w-4" />
        <span>{profileUser.location}</span>
      </p>
    {/if}

    {#if isServerMemberContext}
      <Button
        class="mt-4 w-full"
        variant="secondary"
        onclick={() => void handleManageRoles()}
      >
        Manage roles
      </Button>
    {/if}
  </CardContent>

  <CardFooter class="pt-0 px-4 pb-4 shrink-0">
    {#if isMyProfile}
      <div class="flex w-full flex-col gap-2">
        <Button class="w-full" onclick={editProfile}>
          <Pencil class="mr-2" size={18} />
          Edit Profile
        </Button>
        <PresenceStatusEditor label="Status" variant="secondary" size="sm" />
      </div>
    {:else}
      <div class="flex w-full items-center gap-2">
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
        <Button
          class="shrink-0"
          onclick={() => void sendDirectMessage()}
          disabled={isSending}
        >
          Send
        </Button>
      </div>
    {/if}
  </CardFooter>
</Card>

{#if showLightbox}
  <ImageLightbox
    imageUrl={lightboxImageUrl}
    show={showLightbox}
    onClose={() => (showLightbox = false)}
  />
{/if}
