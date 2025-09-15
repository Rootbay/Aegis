<script lang="ts">
  import { userStore } from '$lib/data/stores/userStore';
  import ImageLightbox from '$lib/components/media/ImageLightbox.svelte';

  import type { User } from '$lib/models/User';
  export let profileUser: User;
  export let close = () => {};
  export let openDetailedProfileModal: Function;
  export let x = 0;
  export let y = 0;
  export let isServerMemberContext = false;

  let showLightbox = false;
  let lightboxImageUrl = '';

  $: isMyProfile = profileUser.id === $userStore.me?.id;

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
    }
  }

  function handleOpenDetailedProfile() {
    close();
    openDetailedProfileModal(profileUser);
  }

  function handleInnerClick(e: MouseEvent) {
    e.stopPropagation();
  }

  function handleInnerKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation();
    }
  }

  function editProfile() {
    console.log('Editing my profile.');
  }

  function openLightbox(imageUrl: string) {
    lightboxImageUrl = imageUrl;
    showLightbox = true;
  }
</script>

  <div class="user-card-container absolute inset-0 z-[1000]" onclick={close} onkeydown={handleKeyDown} role="presentation">
  <div class="user-card-content" style="left: {x}px; top: {y}px;" onclick={handleInnerClick} onkeydown={handleInnerKeydown} role="dialog" aria-modal="true" aria-labelledby="profile-username" tabindex="-1">
    
    <div class="profile-header">
      <button class="banner" style="background-image: url({profileUser.bannerUrl || ''})" class:cursor-pointer={profileUser.bannerUrl} onclick={() => profileUser.bannerUrl && openLightbox(profileUser.bannerUrl)} aria-label="View banner image"></button>
      <div class="pfp-container">
        <button class="pfp-container-button" onclick={handleOpenDetailedProfile} aria-label="View profile picture">
          <img class="pfp" src={profileUser.pfpUrl} alt="{profileUser.name}'s profile picture" />
        </button>
        <div class="online-status" class:online={profileUser.online} title={profileUser.online ? 'Online' : 'Offline'}></div>
      </div>
    </div>
    
    <div class="profile-info">
      <h2 id="profile-username" class="username"><button onclick={handleOpenDetailedProfile} class="hover:underline cursor-pointer">{profileUser.name || 'Unknown User'}</button></h2>
      <div class="flex items-center text-sm text-gray-500 mb-4">
        <span>{profileUser.tag || ''}</span>
        <span class="mx-2">·</span>
        <span class="font-bold">Aegis Member</span>
      </div>
      <p class="bio">{profileUser.bio || ''}</p>

      {#if isServerMemberContext}
        <button class="w-full bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-lg mt-4 hover:bg-gray-300 transition-colors">
          Add Role
        </button>
      {/if}
    </div>

    <div class="action-buttons">
      {#if isMyProfile}
        <button class="primary-action" onclick={editProfile}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
          <span>Edit Profile</span>
        </button>
      {:else}
        <div class="w-full">
          <input type="text" placeholder="Message @{profileUser.name}" class="w-full bg-gray-200 border border-gray-300 rounded-md px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </div>
      {/if}
    </div>

  </div>
</div>

{#if showLightbox}
  <ImageLightbox imageUrl={lightboxImageUrl} show={showLightbox} on:close={() => (showLightbox = false)} />
{/if}

<style>
  .user-card-content {
    position: absolute;
    background: #2c2c2c;
    border-radius: 16px;
    width: 90%;
    max-width: 300px;
    height: 410px;
    overflow: hidden;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  }
  .profile-header {
    position: relative;
    height: 140px;
  }
  .banner {
    background-color: #7f8c8d;
    background-size: cover;
    background-position: center;
    width: 100%;
    height: 100px;
  }
  .pfp-container {
    position: absolute;
    left: 24px;
    top: 50px;
    border: 5px solid #ffffff;
    border-radius: 50%;
    background-color: #fff;
  }

  .pfp-container-button {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    border-radius: 50%;
    display: block;
    width: 80px;
    height: 80px;
    overflow: hidden;
  }

  .pfp {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }
  .online-status {
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 20px;
    height: 20px;
    background-color: #95a5a6;
    border-radius: 50%;
    border: 3px solid #ffffff;
  }
  .online-status.online {
    background-color: #2ecc71;
  }
  .profile-info {
    padding: 16px 24px 24px;
    text-align: left;
  }
  .username {
    margin: 0;
    font-size: 1.5rem;
  }
  .bio {
    margin: 4px 0 0;
    color: #555;
    font-size: 0.95rem;
  }
  .action-buttons {
    display: flex;
    gap: 12px;
    padding: 0 24px 24px;
  }
  .primary-action {
    flex-grow: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 16px;
    font-size: 1rem;
    font-weight: 600;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    background-color: #3498db;
    color: white;
    transition: background-color 0.2s;
  }
  .primary-action:hover {
    background-color: #2980b9;
  }
  
</style>
