<script lang="ts">
  import { userStore } from '$lib/stores/userStore';
  import ImageLightbox from '$lib/components/media/ImageLightbox.svelte';
  import type { User } from '$lib/models/User';
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Card, CardHeader, CardContent, CardFooter, CardTitle } from "$lib/components/ui/card/index.js";
  import * as Avatar from "$lib/components/ui/avatar/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Pencil, X } from '@lucide/svelte';

  let {
    profileUser,
    close = () => {},
    openDetailedProfileModal,
    x = 0,
    y = 0,
    isServerMemberContext = false
  }: {
    profileUser: User;
    close?: () => void;
    openDetailedProfileModal: Function;
    x?: number;
    y?: number;
    isServerMemberContext?: boolean;
  } = $props();

  let showLightbox = $state(false);
  let lightboxImageUrl = $state('');
  let dialogOpen = $state(true);

  let isMyProfile = $derived(profileUser.id === $userStore.me?.id);

  function handleOpenDetailedProfile() {
    dialogOpen = false;
    close();
    openDetailedProfileModal(profileUser);
  }

  function editProfile() {
    console.log('Editing my profile.');
  }

  function openLightbox(imageUrl: string) {
    lightboxImageUrl = imageUrl;
    showLightbox = true;
  }

  $effect(() => {
    if (!dialogOpen) {
      close();
    }
  });
</script>

<Dialog.Root bind:open={dialogOpen}>
  <Dialog.Portal>
    <Dialog.Overlay class="user-card__overlay" />

    <Dialog.Content
      class="user-card__content"
      style={`left:${x}px; top:${y}px`}
      aria-labelledby="profile-username"
      showCloseButton={false}
    >
      <Card class="user-card__card">
        <CardHeader class="user-card__header">
          <button
            class="user-card__banner"
            style={`background-image: url(${profileUser.bannerUrl || ''})`}
            class:interactive={!!profileUser.bannerUrl}
            aria-label="View banner image"
            onclick={() => profileUser.bannerUrl && openLightbox(profileUser.bannerUrl)}
          ></button>
          <div class="user-card__avatar-row">
            <div class="user-card__avatar-wrapper">
              <button
                class="user-card__avatar-trigger"
                onclick={handleOpenDetailedProfile}
                aria-label="View profile picture"
              >
                <Avatar.Root class="user-card__avatar">
                  <Avatar.Image class="user-card__avatar-image" src={profileUser.pfpUrl} alt={`${profileUser.name}'s profile picture`} />
                  <Avatar.Fallback class="user-card__avatar-fallback">
                    {profileUser?.name?.slice(0, 2)?.toUpperCase() ?? '??'}
                  </Avatar.Fallback>
                </Avatar.Root>
              </button>
              <span
                class="user-card__presence"
                class:online={profileUser.online}
                title={profileUser.online ? 'Online' : 'Offline'}
              ></span>
            </div>
          </div>
        </CardHeader>

        <CardContent class="user-card__body">
          <CardTitle id="profile-username" class="user-card__name">
            <button class="user-card__name-button" onclick={handleOpenDetailedProfile}>
              {profileUser.name || 'Unknown User'}
            </button>
          </CardTitle>

          <div class="user-card__meta">
            <span>{profileUser.tag || ''}</span>
            <span aria-hidden="true">&bull;</span>
            <Badge variant="secondary" class="user-card__badge">Aegis Member</Badge>
          </div>

          <p class="user-card__bio">
            {profileUser.bio || ''}
          </p>

          {#if isServerMemberContext}
            <Button variant="secondary" class="user-card__cta-secondary">
              Add Role
            </Button>
          {/if}
        </CardContent>

        <CardFooter class="user-card__footer">
          {#if isMyProfile}
            <Button class="user-card__cta-primary" onclick={editProfile}>
              <Pencil class="user-card__cta-icon" size={18} />
              Edit Profile
            </Button>
          {:else}
            <Input
              class="user-card__input"
              type="text"
              placeholder={`Message @${profileUser.name}`}
            />
          {/if}
        </CardFooter>
      </Card>

      <Dialog.Close>
        <Button variant="ghost" size="icon" class="user-card__close">
          <span class="sr-only">Close</span>
          <X size={16} />
        </Button>
      </Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

{#if showLightbox}
  <ImageLightbox imageUrl={lightboxImageUrl} show={showLightbox} onClose={() => (showLightbox = false)} />
{/if}
