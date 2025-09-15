import { writable } from 'svelte/store';

export const selectedChannel = writable<string | null>(null);