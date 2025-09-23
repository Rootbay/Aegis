<script lang="ts">
  import { userStore } from "$lib/stores/userStore";
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
  import { Pencil } from "@lucide/svelte";

  type OpenDetailedProfileHandler = (user: User) => void; // eslint-disable-line no-unused-vars

  let {
    profileUser,
    openDetailedProfileModal,
    isServerMemberContext = false,
    close,
  }: {
    profileUser: User;
    openDetailedProfileModal: OpenDetailedProfileHandler;
    isServerMemberContext?: boolean;
    close?: () => void;
  } = $props();

  let showLightbox = $state(false);
  let lightboxImageUrl = $state("");

  let isMyProfile = $derived(profileUser.id === $userStore.me?.id);

  function handleOpenDetailedProfile() {
    close?.();
    openDetailedProfileModal(profileUser);
  }

  function editProfile() {
    console.log("Editing my profile.");
  }

  function openLightbox(imageUrl: string) {
    lightboxImageUrl = imageUrl;
    showLightbox = true;
  }
</script>

<Card class="w-[340px] border-none shadow-lg">
  <CardHeader class="relative p-0 flex-shrink-0 h-[100px]">
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

  <CardContent class="pt-2 pb-4 px-4 flex-grow overflow-y-auto">
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

    {#if isServerMemberContext}
      <Button variant="secondary" class="w-full mt-auto">Add Role</Button>
    {/if}
  </CardContent>

  <CardFooter class="pt-0 px-4 pb-4 flex-shrink-0">
    {#if isMyProfile}
      <Button class="w-full" onclick={editProfile}>
        <Pencil class="mr-2" size={18} />
        Edit Profile
      </Button>
    {:else}
      <Input
        class="w-full"
        type="text"
        placeholder={`Message @${profileUser.name}`}
      />
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
