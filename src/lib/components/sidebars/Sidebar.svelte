<script lang="ts">
	import { invoke } from "@tauri-apps/api/core";
	import { Home, Plus, Settings } from "@lucide/svelte";
	import { goto } from "$app/navigation";
	import { page } from "$app/stores";
	import { userStore } from "$lib/data/stores/userStore";
	import { serverStore } from "$lib/data/stores/serverStore";
	import { friendStore } from "$lib/data/stores/friendStore";
	import { toasts } from "$lib/data/stores/ToastStore";
	import ServerContextMenu from "$lib/components/context-menus/ServerContextMenu.svelte";
	import type { Server } from "$lib/models/Server";
	import { lastVisitedServerId } from "$lib/data/stores/navigationStore";
	import { get } from "svelte/store";

	const { onProfileClick, onCreateJoinServerClick } = $props<{ onProfileClick: (clientX: number, clientY: number) => void; onCreateJoinServerClick: () => void }>();

	const MUTED_SERVERS_STORAGE_KEY = 'sidebar.mutedServers';

	let showServerContextMenu = $state(false);
	let serverContextMenuX = $state(0);
	let serverContextMenuY = $state(0);
	let selectedServer = $state<Server | null>(null);
	let mutedServerIds = $state<Set<string>>(loadMutedServers());

	function loadMutedServers(): Set<string> {
		if (typeof localStorage === 'undefined') {
			return new Set();
		}
		try {
			const raw = localStorage.getItem(MUTED_SERVERS_STORAGE_KEY);
			if (!raw) return new Set();
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				return new Set(parsed.filter((id): id is string => typeof id === 'string'));
			}
		} catch (error) {
			console.warn('Failed to load muted servers from storage', error);
		}
		return new Set();
	}

	function saveMutedServers(ids: Set<string>) {
		if (typeof localStorage === 'undefined') {
			return;
		}
		try {
			localStorage.setItem(MUTED_SERVERS_STORAGE_KEY, JSON.stringify(Array.from(ids)));
		} catch (error) {
			console.warn('Failed to persist muted servers', error);
		}
	}

	function gotoResolved(path: string) {
		const url = new URL(path, $page.url);
		goto(url);
	}

	function gotoServerSettings(serverId: string, tab?: string) {
		const url = new URL(`/channels/${serverId}/settings`, $page.url);
		if (tab) {
			url.searchParams.set('tab', tab);
		}
		goto(url);
	}

	function buildInviteLink(serverId: string) {
		const path = `/inv/${serverId}`;
		if (typeof window !== 'undefined' && window.location?.origin) {
			return `${window.location.origin}${path}`;
		}
		return path;
	}

	async function copyText(value: string, successMessage: string, errorMessage: string) {
		try {
			if (typeof navigator !== 'undefined' && navigator.clipboard) {
				await navigator.clipboard.writeText(value);
				toasts.addToast(successMessage, 'success');
			} else {
				throw new Error('Clipboard API unavailable');
			}
		} catch (error) {
			console.error(error);
			toasts.addToast(errorMessage, 'error');
		}
	}

	function gotoWithTab(pathname: string, tab: string) {
		const url = new URL($page.url);
		url.pathname = pathname;
		url.searchParams.set('tab', tab);
		goto(url);
	}

	function clampToViewport(x: number, y: number, approxWidth = 220, approxHeight = 260) {
		const maxX = Math.max(0, (window.innerWidth || 0) - approxWidth - 8);
		const maxY = Math.max(0, (window.innerHeight || 0) - approxHeight - 8);
		return { x: Math.min(x, maxX), y: Math.min(y, maxY) };
	}

	function handleServerContextMenu(event: MouseEvent, server: Server) {
		event.preventDefault();
		const pos = clampToViewport(event.clientX, event.clientY);
		showServerContextMenu = true;
		serverContextMenuX = pos.x;
		serverContextMenuY = pos.y;
		selectedServer = server;
	}

	function handleServerClick(server: Server) {
		lastVisitedServerId.set(server.id);
		serverStore.setActiveServer(server.id);
		const target = new URL(`/channels/${server.id}`, $page.url);
		if ($page.url.pathname !== target.pathname) {
			goto(target);
		}
	}

	async function handleServerAction({ action, itemData }: { action: string; itemData: Server | null }) {
		if (!itemData) {
			showServerContextMenu = false;
			return;
		}

		const server = itemData;

		try {
			switch (action) {
				case 'mark_as_read':
					toasts.addToast('All channels marked as read (local).', 'info');
					break;
				case 'mute_unmute_server': {
					const next = new Set(mutedServerIds);
					if (next.has(server.id)) {
						next.delete(server.id);
						toasts.addToast('Server unmuted (local).', 'info');
					} else {
						next.add(server.id);
						toasts.addToast('Server muted (local).', 'info');
					}
					mutedServerIds = next;
					saveMutedServers(next);
					break;
				}
				case 'notification_settings':
					lastVisitedServerId.set(server.id);
					gotoResolved('/settings/notifications');
					break;
				case 'copy_server_id':
					await copyText(server.id, 'Server ID copied.', 'Failed to copy server ID.');
					break;
				case 'view_icon':
					if (server.iconUrl) {
						await copyText(server.iconUrl, 'Icon URL copied.', 'Failed to copy icon URL.');
					} else {
						toasts.addToast('This server does not have an icon.', 'info');
					}
					break;
				case 'view_raw':
					await copyText(JSON.stringify(server, null, 2), 'Server data copied.', 'Failed to copy server data.');
					break;
				case 'invite_people': {
					const link = buildInviteLink(server.id);
					await copyText(link, 'Invite link copied.', 'Failed to copy invite link.');
					break;
				}
				case 'server-settings':
					lastVisitedServerId.set(server.id);
					serverStore.setActiveServer(server.id);
					gotoServerSettings(server.id);
					break;
				case 'create_channel':
					lastVisitedServerId.set(server.id);
					serverStore.setActiveServer(server.id);
					gotoServerSettings(server.id, 'channels');
					toasts.addToast('Opening server settings. Use the Channels tab to create a channel.', 'info');
					break;
				case 'create_category':
					lastVisitedServerId.set(server.id);
					serverStore.setActiveServer(server.id);
					gotoServerSettings(server.id, 'channels');
					toasts.addToast('Manage categories from the Channels tab.', 'info');
					break;
				case 'create_event':
					toasts.addToast('Server events are not implemented yet.', 'info');
					break;
				case 'leave_server':
					if (confirm(`Are you sure you want to leave the server "${server.name}"?`)) {
						try {
							await invoke('leave_server', { server_id: server.id });
							serverStore.removeServer(server.id);
							if (get(serverStore).activeServerId === server.id) {
								serverStore.setActiveServer(null);
								lastVisitedServerId.set(null);
								gotoWithTab('/friends', 'All');
							}
						} catch (error) {
							console.error('Failed to leave server:', error);
							toasts.addToast('Failed to leave server. Please try again.', 'error');
						}
					}
					break;
				case 'delete_server':
					if (confirm(`Delete "${server.name}"? This cannot be undone.`)) {
						try {
							await invoke('delete_server', { server_id: server.id });
							const activeServerId = get(serverStore).activeServerId;
							serverStore.removeServer(server.id);
							if (activeServerId === server.id) {
								serverStore.setActiveServer(null);
								lastVisitedServerId.set(null);
								gotoWithTab('/friends', 'All');
							}
							toasts.addToast('Server deleted.', 'success');
						} catch (error) {
							console.error('Failed to delete server:', error);
							toasts.addToast('Failed to delete server.', 'error');
						}
					}
					break;
				default:
					console.debug('Unhandled server action:', action, server.id);
			}
		} finally {
			showServerContextMenu = false;
			selectedServer = null;
		}
	}
</script>

<aside class="w-16 min-w-[64px] bg-base-100 flex flex-col items-center py-4 space-y-6">
	<button class="p-2 bg-card rounded-lg cursor-pointer" onclick={() => {
		serverStore.setActiveServer(null);
		if ($friendStore.friends.length > 0) {
			gotoWithTab('/', 'All');
		} else {
			goto('/friends/add');
		}
	}} aria-label="Home">
		<Home size={15} />
	</button>

	<nav class="flex flex-col space-y-2">
		{#each $serverStore.servers as server (server.id)}
			<button
				type="button"
				class="w-10 h-10 rounded-full overflow-hidden border-2 {$serverStore.activeServerId === server.id ? 'border-highlight-100' : 'border-border'} hover:border-highlight-100 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-base-100 focus:ring-highlight-100 cursor-pointer"
				class:opacity-60={mutedServerIds.has(server.id)}
				class:grayscale={mutedServerIds.has(server.id)}
				onclick={() => handleServerClick(server)}
				oncontextmenu={(e) => handleServerContextMenu(e, server)}
				aria-label="{server.name}"
			>
				{#if server.iconUrl}
					<img src={server.iconUrl} alt="{server.name} icon" class="w-full h-full object-cover" />
				{:else}
					<div class="flex h-full w-full items-center justify-center bg-card text-xs font-semibold uppercase">
						{server.name.slice(0, 2)}
					</div>
				{/if}
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
		 onaction={handleServerAction}
		 onclose={() => (showServerContextMenu = false)}
	/>

	<div class="flex-grow"></div>

	<div class="flex flex-col items-center space-y-4">
		<button class="p-3 rounded-lg hover:bg-card transition cursor-pointer" aria-label="Settings" onclick={() => goto('/settings')}>
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

