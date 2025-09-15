import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { Store } from '@tauri-apps/plugin-store';

export function persistentStore<T>(key: string, initialValue: T) {
    let storedValue: T = initialValue;
    console.log(`[persistentStore] Initializing for key "${key}" with initialValue:`, initialValue);

    if (browser) {
        const localStorageValue = localStorage.getItem(key);
        if (localStorageValue !== null) {
            try {
                storedValue = JSON.parse(localStorageValue);
                console.log(`[persistentStore] Loaded from localStorage for key "${key}":`, storedValue);
            } catch (e) {
                console.error(`[persistentStore] Failed to parse localStorage value for key "${key}":`, e);
            }
        } else {
            console.log(`[persistentStore] No value found in localStorage for key "${key}".`);
        }
    }

    const { subscribe, set, update } = writable<T>(storedValue);
    console.log(`[persistentStore] Writable store initialized for key "${key}" with value:`, storedValue);


    if (browser) {
        (async () => {
            try {
                const diskStore = await Store.load('aegis.dat');
                console.log(`[persistentStore] Tauri Store loaded for key "${key}".`);
                const valueFromDisk = await diskStore.get<T>(key);

                if (valueFromDisk !== null && valueFromDisk !== undefined) {
                    set(valueFromDisk); // Update store with Tauri value if available
                    storedValue = valueFromDisk; // Also update local storedValue
                    console.log(`[persistentStore] Loaded from Tauri Store for key "${key}":`, valueFromDisk);
                } else {
                    console.log(`[persistentStore] No value found in Tauri Store for key "${key}".`);
                    // If Tauri store has no value, but localStorage did, save localStorage value to Tauri
                    if (localStorageValue !== null) {
                        await diskStore.set(key, storedValue);
                        await diskStore.save();
                        console.log(`[persistentStore] Saved localStorage value to Tauri Store for key "${key}":`, storedValue);
                    }
                }

                subscribe(async (value) => {
                    console.log(`[persistentStore] Saving to Tauri Store and localStorage for key "${key}":`, value);
                    await diskStore.set(key, value);
                    await diskStore.save();
                    localStorage.setItem(key, JSON.stringify(value)); // Keep localStorage in sync
                });

            } catch (e) {
                console.warn(`[persistentStore] Tauri Store failed for key "${key}", relying on localStorage:`, e);
                // If Tauri Store fails, ensure localStorage is the primary persistence
                subscribe((value) => {
                    console.log(`[persistentStore] Saving to localStorage (Tauri failed) for key "${key}":`, value);
                    localStorage.setItem(key, JSON.stringify(value));
                });
            }
        })();
    }

    return { subscribe, set, update };
}
