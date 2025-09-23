<script lang="ts">
  import { slide } from "svelte/transition";
  import { userStore } from "$lib/stores/userStore";
  import { SendHorizontal, EllipsisVertical } from "@lucide/svelte";

  type Props = {
    profileUser: {
      id: string;
      name: string;
      bio: string;
      pfpUrl: string;
      bannerUrl: string;
      isOnline: boolean;
      publicKey: string;
    };
    isFriend?: boolean;
    close?: () => void;
  };

  let {
    profileUser = {
      id: "2",
      name: "Alice",
      bio: "Cryptography enthusiast & secure messenger user.",
      pfpUrl: "https://i.pravatar.cc/150?u=alice",
      bannerUrl: "https://picsum.photos/id/1015/600/200",
      isOnline: true,
      publicKey: "0xabc123def456ghi789jkl012mno345pqr678stu9",
    },
    isFriend = false,
    close = () => {},
  }: Props = $props();

  let copyFeedback = $state("");

  let isMyProfile = $derived(profileUser.id === $userStore.me?.id);

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      close();
    }
  }

  function copyPublicKey() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(profileUser.publicKey).then(() => {
        copyFeedback = "Copied!";
        setTimeout(() => {
          copyFeedback = "";
        }, 2000);
      });
    }
  }

  function handleInnerClick(e: MouseEvent) {
    e.stopPropagation();
  }

  function handleInnerKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.stopPropagation();
    }
  }

  function addFriend() {
    console.log(`Adding ${profileUser.name} as a friend.`);
  }

  function sendMessage() {
    console.log(`Sending a message to ${profileUser.name}.`);
  }

  function showMoreOptions() {
    console.log(`Showing more options for ${profileUser.name}.`);
  }

  function editProfile() {
    console.log("Editing my profile.");
  }
</script>

<div
  class="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50"
  onclick={close}
  onkeydown={handleKeyDown}
  role="presentation"
>
  <div
    class="bg-white rounded-2xl w-[90%] max-w-sm overflow-hidden shadow-xl"
    onclick={handleInnerClick}
    onkeydown={handleInnerKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="profile-username"
    tabindex="-1"
  >
    <div class="relative h-36">
      <div
        class="absolute inset-x-0 top-0 h-24 bg-gray-400 bg-cover bg-center"
        style="background-image: url({profileUser.bannerUrl})"
      ></div>
      <div
        class="absolute left-6 top-12 rounded-full border-4 border-white bg-white"
      >
        <img
          class="block h-20 w-20 rounded-full"
          src={profileUser.pfpUrl}
          alt="{profileUser.name}'s profile picture"
        />
        <div
          class="absolute bottom-0 right-0 h-5 w-5 rounded-full border-2 border-white"
          class:bg-green-500={profileUser.isOnline}
          class:bg-gray-400={!profileUser.isOnline}
          title={profileUser.isOnline ? "Online" : "Offline"}
        ></div>
      </div>
    </div>

    <div class="p-6 text-left pt-10">
      <h2 id="profile-username" class="text-2xl font-semibold text-gray-800">
        {profileUser.name}
      </h2>
      <p class="mt-1 text-gray-600 text-sm">{profileUser.bio}</p>
    </div>

    <div class="flex gap-3 px-6 pb-6">
      {#if isMyProfile}
        <button
          class="flex-grow flex items-center justify-center gap-2 px-4 py-2 text-base font-semibold text-white bg-blue-500 rounded-lg border-none cursor-pointer"
          onclick={editProfile}
        >
          <span>Edit Profile</span>
        </button>
      {:else if isFriend}
        <button
          class="flex-grow flex items-center justify-center gap-2 px-4 py-2 text-base font-semibold text-white bg-blue-500 rounded-lg border-none cursor-pointer"
          onclick={sendMessage}
        >
          <span>Message</span>
        </button>
        <button
          class="flex items-center justify-center p-2 bg-gray-200 text-gray-700 rounded-lg border-none cursor-pointer"
          onclick={showMoreOptions}
          aria-label="More options"
        >
          <EllipsisVertical size={12} />
        </button>
      {:else}
        <button
          class="flex-grow flex items-center justify-center gap-2 px-4 py-2 text-base font-semibold text-white bg-blue-500 rounded-lg border-none cursor-pointer"
          onclick={addFriend}
        >
          <span>Add Friend</span>
        </button>
        <button
          class="flex items-center justify-center p-2 bg-gray-200 text-gray-700 rounded-lg border-none cursor-pointer"
          onclick={sendMessage}
          aria-label="Message"
        >
          <SendHorizontal size={12} />
        </button>
        <button
          class="flex items-center justify-center p-2 bg-gray-200 text-gray-700 rounded-lg border-none cursor-pointer"
          onclick={showMoreOptions}
          aria-label="More options"
        >
          <EllipsisVertical size={12} />
        </button>
      {/if}
    </div>

    {#if isMyProfile}
      <div class="bg-gray-50 p-6 border-t border-gray-200">
        <div class="text-center mb-4">
          <h3 class="text-xs uppercase text-gray-600 font-semibold mb-2">
            Share Your QR Code
          </h3>
          <img
            class="mx-auto rounded-lg"
            src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data={profileUser.publicKey}"
            alt="Your QR Code"
          />
        </div>
        <div>
          <h3 class="text-xs uppercase text-gray-600 font-semibold mb-2">
            Your Public Key {#if copyFeedback}<span
                class="ml-2 text-green-500 font-semibold"
                transition:slide>{copyFeedback}</span
              >{/if}
          </h3>
          <button
            class="bg-gray-200 p-3 rounded-lg font-mono text-sm break-all cursor-pointer w-full text-left"
            onclick={copyPublicKey}
            title="Copy public key"
          >
            {profileUser.publicKey}
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
