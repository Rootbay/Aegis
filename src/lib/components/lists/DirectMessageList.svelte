<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { getContext, onMount, onDestroy } from 'svelte';
	import BaseContextMenu from '$lib/components/context-menus/BaseContextMenu.svelte';
	import { CREATE_GROUP_CONTEXT_KEY } from '$lib/data/contextKeys';
	import type { CreateGroupContext } from '$lib/data/contextTypes';
	import { browser } from '$app/environment';
	import type { Friend } from '$lib/models/Friend';
	import { friendStore } from '$lib/data/stores/friendStore';
	import { Plus, X } from '@lucide/svelte';

	interface ContextMenuItem {
		label?: string;
		action?: string;
		isDestructive?: boolean;
		isSeparator?: boolean;
		data?: Friend;
	}

	let {
		friends = [],
		activeFriendId = null,
		onSelect,
		onCreateGroupClick
	}: {
		friends?: Friend[];
		activeFriendId?: string | null;
		onSelect: Function;
		onCreateGroupClick: () => void;
	} = $props();

	let showSearchPopup = $state(false);
	let searchTerm = $state('');
	let showContextMenu = $state(false);
	let contextMenuX = $state(0);
	let contextMenuY = $state(0);
	let selectedFriend: Friend | null = null;
	let searchResults = $derived(
		friends.filter(friend =>
			friend.name.toLowerCase().includes(searchTerm.toLowerCase())
		)
	);

	const { openDetailedProfileModal } = getContext<CreateGroupContext>(CREATE_GROUP_CONTEXT_KEY);

	const contextMenuItems: ContextMenuItem[] = [
		{ label: 'View Profile', action: 'view_profile' },
		{ label: 'Remove Friend', action: 'remove_friend' },
		{ isSeparator: true, label: '-' },
		{ label: 'Block', action: 'block_user', isDestructive: true },
		{ label: 'Mute', action: 'mute_user' },
		{ label: 'Report User', action: 'report_user', isDestructive: true },
		{ isSeparator: true, label: '-' },
		{ label: 'Invite to Server', action: 'invite_to_server' },
		{ label: 'Add to Group', action: 'add_to_group' },
	];
	
	function handleKeydown(event: KeyboardEvent) {
		if (event.ctrlKey && event.key === 'k') {
			event.preventDefault();
			showSearchPopup = true;
		} else if (event.key === 'Escape') {
			showSearchPopup = false;
			searchTerm = '';
		}
	}

	function handleContextMenu(event: MouseEvent, friend: Friend) {
		event.preventDefault();
		showContextMenu = true;
		contextMenuX = event.clientX;
		contextMenuY = event.clientY;
		selectedFriend = friend;
	}

	function handleContextMenuAction({ action, itemData }: { action: string; itemData: Friend | null }) {
		console.log('Context menu action:', action, itemData);
		if (!itemData) return;

		if (action === 'view_profile') {
			openDetailedProfileModal(itemData);
		} else if (action === 'remove_friend') {
			removeFriend(itemData);
		}
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
			await invoke('remove_friendship', { friendshipId });
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

<div class="w-80 bg-card/50 flex flex-col border-r border-zinc-700/50">
	<header class="p-4 flex justify-between items-center border-b border-zinc-700/50 h-[55px]">
		<button class="text-xl font-bold w-full text-left" onclick={() => onSelect(null)}>Friends</button>
	</header>
	<div class="p-4 pt-0">
		<button
			class="w-full bg-card border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-left text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 mt-4 cursor-pointer"
			onclick={() => (showSearchPopup = true)}
		>
			Search (Ctrl+K)
		</button>
		<div class="flex justify-between items-center mt-4 mb-2">
			<h2 class="text-sm font-semibold text-muted-foreground">Direct Messages</h2>
			<button class="text-muted-foreground hover:text-white transition-colors cursor-pointer" onclick={onCreateGroupClick}>
				<Plus size={12} />
			</button>
		</div>
		
	</div>

	<div class="flex-grow overflow-y-auto mx-2">
		{#if !friends || friends.length === 0}
			<div class="text-center p-6 text-zinc-500">
				<p>No direct messages.</p>
				<p class="text-sm">Click the '+' icon to create a group or start a new conversation.</p>
			</div>
		{:else}
			{#each friends as friend (friend.id)}
				<button
					class="w-full flex items-center py-1 pl-2 pr-4 text-left transition-colors cursor-pointer rounded-md {activeFriendId === friend.id ? 'bg-zinc-700' : 'hover:bg-muted/50'}"
					onclick={() => onSelect(friend.id)}
					oncontextmenu={(event) => handleContextMenu(event, friend)}
				>
					<div class="relative mr-3">
						<img src={friend.avatar} alt={friend.name} class="w-10 h-10 rounded-full" />
						{#if friend.online}
							<span
								class="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-green-500 border-2 border-zinc-800"
							></span>
						{/if}
					</div>
					<div class="flex-grow overflow-hidden">
						<div class="flex justify-between items-baseline">
							<p class="font-semibold truncate">{friend.name}</p>
							<p class="text-xs text-muted-foreground">{friend.timestamp}</p>
						</div>
					</div>
				</button>
			{/each}
		{/if}
	</div>

	{#if showContextMenu}
		<BaseContextMenu
			x={contextMenuX}
			y={contextMenuY}
			show={showContextMenu}
			menuItems={contextMenuItems.map(item => ({ ...item, data: selectedFriend }))}
			onclose={() => (showContextMenu = false)}
			onaction={handleContextMenuAction}
		/>
	{/if}

	{#if showSearchPopup}
		<div class="fixed inset-0 flex items-center justify-center z-50">
			<div class="bg-card p-6 rounded-lg shadow-lg w-11/12 max-w-md">
				<div class="flex justify-between items-center mb-4">
					<h2 class="text-xl font-bold">Search</h2>
					<button onclick={() => (showSearchPopup = false)} class="text-muted-foreground hover:text-white cursor-pointer">
						<X size={12} />
					</button>
				</div>
				<input
					type="text"
					placeholder="Search friends..."
					class="w-full bg-zinc-700 border border-zinc-600 rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-4"
					bind:value={searchTerm}
				/>

				<div class="max-h-60 overflow-y-auto">
					{#if searchResults.length > 0}
						{#each searchResults as item (item.id)}
							<button
								class="w-full flex items-center p-2 text-left transition-colors cursor-pointer hover:bg-muted/50 rounded-md mb-2"
								onclick={() => {
									onSelect(item.id);
									showSearchPopup = false;
									searchTerm = '';
								}}
							>
								<div class="relative mr-3">
									<img src={item.avatar} alt={item.name} class="w-10 h-10 rounded-full" />
									{#if item.online}
										<span
											class="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-zinc-800"
										></span>
									{/if}
								</div>
								<div class="flex-grow overflow-hidden">
									<p class="font-semibold truncate">{item.name}</p>
									<p class="text-xs text-muted-foreground capitalize">Friend</p>
								</div>
							</button>
						{/each}
					{:else if searchTerm.length > 0}
						<p class="text-center text-zinc-500">No results found for "{searchTerm}".</p>
					{:else}
						<p class="text-center text-zinc-500">Start typing to search for friends.</p>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>



