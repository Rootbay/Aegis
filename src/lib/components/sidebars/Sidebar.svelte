<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { Home, Plus, Settings } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { userStore } from '$lib/data/stores/userStore';
	import { serverStore } from '$lib/data/stores/serverStore';
	import { friendStore } from '$lib/data/stores/friendStore';
	import { toasts } from '$lib/data/stores/ToastStore';
	import ServerContextMenu from '$lib/components/context-menus/ServerContextMenu.svelte';
	import type { Server } from '$lib/models/Server';

	/** @type {(event: MouseEvent) => void} */
	export let onProfileClick;
	/** @type {() => void} */
	export let onCreateJoinServerClick;

	let showServerContextMenu = false;
	let serverContextMenuX = 0;
	let serverContextMenuY = 0;
	let selectedServer: Server | null = null;

	function handleServerContextMenu(event: MouseEvent, server: Server) {
		event.preventDefault();
		showServerContextMenu = true;
		serverContextMenuX = event.clientX;
		serverContextMenuY = event.clientY;
		selectedServer = server;
	}

	async function handleServerAction(event: CustomEvent) {
		const { action, itemData } = event.detail;
		console.log(`Server action: ${action} for server:`, itemData);
			switch (action) {
			case 'mark_as_read':
				console.log('Mark as Read');
				break;
			case 'mute_unmute_server':
				console.log('Mute/Unmute Server');
				break;
			case 'notification_settings':
				console.log('Notification Settings');
				break;
			case 'copy_server_id':
				console.log('Copy Server ID:', itemData.id);
				navigator.clipboard.writeText(itemData.id);
				break;
			case 'view_icon':
				console.log('View Icon:', itemData.iconUrl);
				break;
			case 'view_raw':
				console.log('View Raw:', itemData);
				break;
			case 'invite_people':
				console.log('Invite People');
				break;
			case 'server-settings':
				console.log('Server Settings');
				break;
			case 'create_channel':
				console.log('Create Channel');
				break;
			case 'create_category':
				console.log('Create Category');
				break;
			case 'create_event':
				console.log('Create Event');
				break;
			case 'leave_server':
				if (!itemData) break;
				if (confirm(`Are you sure you want to leave the server "${itemData.name}"?`)) {
					try {
						await invoke('leave_server', { serverId: itemData.id });
						serverStore.removeServer(itemData.id);
						serverStore.setActiveServer(null);
						goto(resolve('/friends?tab=All'));
					} catch (error) {
						console.error('Failed to leave server:', error);
						toasts.addToast('Failed to leave server. Please try again.', 'error');
					}
				}
				break;
			case 'delete_server':
				console.log('Delete Server');
				break;
		}
		showServerContextMenu = false;
	}
</script>

<aside class="w-16 min-w-[64px] bg-base-100 flex flex-col items-center py-4 space-y-6">
	<button class="p-2 bg-card rounded-lg cursor-pointer" onclick={() => {
				serverStore.setActiveServer(null);
				if ($friendStore.friends.length > 0) {
					goto(resolve('/?tab=All'));
				} else {
					goto(resolve('/friends/add'));
				}
			}} aria-label="Home">
		<Home size={15} />
	</button>

	<nav class="flex flex-col space-y-2">
		{#each $serverStore.servers as server (server.id)}
			<button
				class="w-10 h-10 rounded-full overflow-hidden border-2 {$serverStore.activeServerId === server.id ? 'border-highlight-100' : 'border-border'} hover:border-highlight-100 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-base-100 focus:ring-highlight-100 cursor-pointer"
				onclick={() => {
					console.log('Setting activeServerId to:', server.id);
					serverStore.setActiveServer(server.id);
				}}
				oncontextmenu={(e) => handleServerContextMenu(e, server)}
				aria-label="{server.name}"
			>
				<img src={server.iconUrl} alt="{server.name} icon" class="w-full h-full object-cover" />
			</button>
		{/each}
		<button
			class="p-3 rounded-lg transition cursor-pointer"
			onclick={onCreateJoinServerClick}
			aria-label="Create or Join Server"
		>
			<Plus size={12} />
		</button>
	</nav>

	<ServerContextMenu
		x={serverContextMenuX}
		y={serverContextMenuY}
		bind:show={showServerContextMenu}
		server={selectedServer}
		on:action={handleServerAction}
		on:close={() => (showServerContextMenu = false)}
	/>

	<div class="flex-grow"></div>

	<div class="flex flex-col items-center space-y-4">
		<button class="p-3 rounded-lg hover:bg-card transition cursor-pointer" aria-label="Settings" onclick={() => goto(resolve('/settings'))}>
			<Settings size={12} />
		</button>
		<button
			onclick={(e) => onProfileClick(e.clientX, e.clientY)}
			class="w-10 h-10 rounded-full overflow-hidden border-2 border-border hover:border-highlight-100 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-base-100 focus:ring-highlight-100 cursor-pointer"
			aria-label="Open Profile"
		>
			<img src={$userStore.me?.avatar} alt="User Avatar" class="w-full h-full object-cover" />
		</button>
	</div>
</aside>
