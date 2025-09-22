<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { Friend } from '$lib/features/friends/models/Friend';
	import { friendStore } from '$lib/features/friends/stores/friendStore';
	import { Plus, X } from '@lucide/svelte';
	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import {
		ContextMenu,
		ContextMenuTrigger,
		ContextMenuContent,
		ContextMenuItem,
		ContextMenuSeparator,
	} from "$lib/components/ui/context-menu";
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogFooter,
		DialogClose,
	} from "$lib/components/ui/dialog";
	import {
		Avatar,
		AvatarImage,
		AvatarFallback,
	} from "$lib/components/ui/avatar";

	let {
		friends = [],
		activeFriendId = null,
		onSelect,
		onCreateGroupClick
	}: {
		friends?: Friend[];
		activeFriendId?: string | null;
		onSelect: (id: string | null) => void;
		onCreateGroupClick: () => void;
	} = $props();

	let showSearch = $state(false);
	let searchTerm = $state('');
	let searchResults = $derived(
		friends.filter(friend =>
			friend.name.toLowerCase().includes(searchTerm.toLowerCase())
		)
	);
	
	function handleKeydown(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			showSearch = true;
		} else if (e.key === 'Escape') {
			showSearch = false;
			searchTerm = '';
		}
	}

	function handleContextItem(
	action: "open" | "mute" | "remove",
	friendId: string
	) {
		const item = friends.find((f) => f.id === friendId);
		if (!item) return;
		if (action === "open") onSelect(friendId);
		if (action === "mute") { /* ... */ }
		if (action === "remove") removeFriend(item);
	}

	async function removeFriend(friend: Friend) {
		console.log('Removing friend:', friend);
		const usesFallbackId = friend.friendshipId == null;
		const friendshipId = usesFallbackId ? friend.id : friend.friendshipId;
		if (!friendshipId) {
			console.warn('Missing friendship identifier for friend', friend);
			return;
		}
		if (usesFallbackId) {
			console.warn('Falling back to friend.id when removing friendship', friend);
		}
		try {
			await invoke('remove_friendship', { friendship_id: friendshipId });
			friendStore.removeFriend(friend.id);
			console.log('Friend removed:', friend);
		} catch (error) {
			console.error('Failed to remove friend:', error);
		}
	}

	onMount(() => {
		if (browser) {
			window.addEventListener('keydown', handleKeydown);
		}
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('keydown', handleKeydown);
		}
	});
</script>

<div class="w-80 bg-card/50 flex flex-col border-r border-border">
  <header class="h-[55px] px-4 flex items-center border-b border-border">
    <Button variant="ghost" class="text-xl font-bold px-0 justify-start w-full" onclick={() => onSelect(null)}>
      Friends
    </Button>
  </header>

  <div class="p-4 pt-3">
    <Button variant="secondary" class="w-full justify-start bg-card text-muted-foreground" onclick={() => (showSearch = true)}>
      Search (Ctrl+K)
    </Button>

    <div class="flex items-center justify-between mt-4 mb-2">
      <h2 class="text-sm font-semibold text-muted-foreground">Direct Messages</h2>
      <Button size="icon" variant="ghost" class="h-6 w-6 text-muted-foreground hover:text-foreground" onclick={onCreateGroupClick} aria-label="Create group">
        <Plus size={12} />
      </Button>
    </div>
    <Separator />
  </div>

  <ScrollArea class="flex-1 px-2">
    {#if !friends || friends.length === 0}
      <div class="text-center p-6 text-muted-foreground">
        <p>No direct messages.</p>
        <p class="text-sm">Click the ‘+’ icon to create a group or start a new conversation.</p>
      </div>
    {:else}
      {#each friends as friend (friend.id)}
        <ContextMenu>
          <ContextMenuTrigger>
            <Button
              variant="ghost"
              class="w-full justify-start gap-3 py-1 pl-2 pr-4 rounded-md hover:bg-muted/50 data-[active=true]:bg-muted"
              data-active={activeFriendId === friend.id}
              onclick={() => onSelect(friend.id)}
            >
              <div class="relative">
                <Avatar class="h-10 w-10">
                  <AvatarImage src={friend.avatar} alt={friend.name} />
                  <AvatarFallback class="uppercase">{friend.name?.[0]}</AvatarFallback>
                </Avatar>
                {#if friend.online}
                  <span class="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-background" ></span>
                {/if}
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex items-baseline justify-between gap-2">
                  <p class="font-semibold truncate">{friend.name}</p>
                  {#if friend.timestamp}
                    <p class="shrink-0 text-xs text-muted-foreground">{friend.timestamp}</p>
                  {/if}
                </div>
              </div>
            </Button>
          </ContextMenuTrigger>

          <ContextMenuContent class="w-48">
            <ContextMenuItem onselect={() => handleContextItem("open", friend.id)}>Open Chat</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onselect={() => handleContextItem("mute", friend.id)}>Mute</ContextMenuItem>
            <ContextMenuItem onselect={() => handleContextItem("remove", friend.id)} class="text-destructive">
              Remove
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      {/each}
    {/if}
  </ScrollArea>

  <Dialog bind:open={showSearch}>
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Search</DialogTitle>
      </DialogHeader>

      <div class="space-y-3">
        <Input bind:value={searchTerm} placeholder="Search friends..." />

        <ScrollArea class="max-h-60">
          {#if searchResults.length > 0}
            <div class="space-y-2">
              {#each searchResults as item (item.id)}
                <Button
                  variant="ghost"
                  class="w-full justify-start gap-3 p-2 rounded-md hover:bg-muted/50"
                  onclick={() => {
                    onSelect(item.id);
                    showSearch = false;
                    searchTerm = "";
                  }}
                >
                  <div class="relative">
                    <Avatar class="h-10 w-10">
                      <AvatarImage src={item.avatar} alt={item.name} />
                      <AvatarFallback class="uppercase">{item.name?.[0]}</AvatarFallback>
                    </Avatar>
                    {#if item.online}
                      <span class="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background" ></span>
                    {/if}
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="font-semibold truncate">{item.name}</p>
                    <p class="text-xs text-muted-foreground">Friend</p>
                  </div>
                </Button>
              {/each}
            </div>
          {:else if searchTerm.length > 0}
            <p class="text-center text-muted-foreground">No results found for “{searchTerm}”.</p>
          {:else}
            <p class="text-center text-muted-foreground">Start typing to search for friends.</p>
          {/if}
        </ScrollArea>
      </div>

      <DialogFooter class="mt-2">
        <DialogClose>
          <Button variant="ghost">
            <X size={14} class="mr-1" />
            Close
          </Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</div>
