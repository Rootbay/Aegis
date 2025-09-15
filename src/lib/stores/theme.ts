import { persistentStore } from './persistentStore';

export const theme = persistentStore<'light' | 'dark'>('theme', 'light');
