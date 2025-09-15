import { writable } from 'svelte/store';

export const lastVisitedServerId = writable<string | null>(null);
