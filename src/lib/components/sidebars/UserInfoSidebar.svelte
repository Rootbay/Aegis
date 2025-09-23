<script lang="ts">
  import {
    Ban,
    Flag,
    MicOff,
    Pencil,
    Phone,
    SendHorizontal,
    Video,
    VolumeOff,
    X,
  } from "@lucide/svelte";
  import type { Friend } from "$lib/features/friends/models/Friend";
  import type { User } from "$lib/features/auth/models/User";

  type Props = {
    user: Friend | User;
    onclose: () => void;
  };

  let { user, onclose }: Props = $props();
</script>

<aside class="w-[340px] bg-muted/50 flex flex-col border-l border-border/50">
  <header
    class="p-4 flex justify-between items-center border-b border-border/50"
  >
    <h2 class="text-xl font-bold">User Info</h2>
    <button
      class="text-muted-foreground hover:text-foreground"
      onclick={onclose}
    >
      <X size={15} />
    </button>
  </header>
  <div class="flex-grow p-4 overflow-y-auto">
    <div class="flex flex-col items-center mb-6">
      <div class="relative mb-4">
        <img
          src={user.avatar}
          alt={user.name}
          class="w-24 h-24 rounded-full object-cover"
        />
        {#if user.online}
          <span
            class="absolute bottom-0 right-0 block h-6 w-6 rounded-full bg-success border-4 border-base-200"
          ></span>
        {/if}
      </div>
      <h3 class="text-2xl font-bold">{user.name}</h3>
      <p class="text-muted-foreground">
        @{user.name.toLowerCase().replace(/ /g, "")}
      </p>
    </div>

    <div class="space-y-4">
      <button
        class="w-full flex items-center justify-center p-3 rounded-md bg-primary hover:bg-accent text-foreground font-semibold"
      >
        <SendHorizontal size={10} class="mr-2" /> Send Message
      </button>
      <div class="grid grid-cols-2 gap-2">
        <button
          class="flex flex-col items-center justify-center p-3 rounded-md bg-muted hover:bg-base-400 text-muted-foreground"
        >
          <Phone size={12} />
          <span class="text-xs mt-1">Call</span>
        </button>
        <button
          class="flex flex-col items-center justify-center p-3 rounded-md bg-muted hover:bg-base-400 text-muted-foreground"
        >
          <Video size={12} />
          <span class="text-xs mt-1">Video</span>
        </button>
        <button
          class="flex flex-col items-center justify-center p-3 rounded-md bg-muted hover:bg-base-400 text-muted-foreground"
        >
          <MicOff size={12} />
          <span class="text-xs mt-1">Mute</span>
        </button>
        <button
          class="flex flex-col items-center justify-center p-3 rounded-md bg-muted hover:bg-base-400 text-muted-foreground"
        >
          <VolumeOff size={12} />
          <span class="text-xs mt-1">Deafen</span>
        </button>
      </div>

      <div class="border-t border-border/50 pt-4 mt-4 space-y-3">
        <h4 class="text-muted-foreground font-semibold">About Me</h4>
        <p class="text-muted-foreground">A passionate user of Aegis.</p>
      </div>

      <div class="border-t border-border/50 pt-4 mt-4 space-y-3">
        <h4 class="text-muted-foreground font-semibold">Actions</h4>
        <button
          class="w-full flex items-center p-2 rounded-md hover:bg-muted/50 text-muted-foreground"
        >
          <Pencil size={10} class="mr-2" /> Edit Profile
        </button>
        <button
          class="w-full flex items-center p-2 rounded-md hover:bg-muted/50 text-destructive"
        >
          <Ban size={10} class="mr-2" /> Block
        </button>
        <button
          class="w-full flex items-center p-2 rounded-md hover:bg-muted/50 text-destructive"
        >
          <Flag size={10} class="mr-2" /> Report
        </button>
      </div>
    </div>
  </div>
</aside>
