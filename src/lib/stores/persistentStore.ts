import { writable } from "svelte/store";
import { browser } from "$app/environment";
import { Store } from "@tauri-apps/plugin-store";

export function persistentStore<T>(key: string, initialValue: T) {
  let storedValue: T = initialValue;
  let localStorageValue: string | null = null;

  if (browser) {
    localStorageValue = localStorage.getItem(key);
    if (localStorageValue !== null) {
      try {
        storedValue = JSON.parse(localStorageValue);
      } catch (e) {
        console.error(
          `[persistentStore] Failed to parse localStorage value for key "${key}":`,
          e,
        );
      }
    }
  }

  const { subscribe, set, update } = writable<T>(storedValue);

  if (browser) {
    (async () => {
      try {
        const diskStore = await Store.load("aegis.dat");
        const valueFromDisk = await diskStore.get<T>(key);

        if (valueFromDisk !== null && valueFromDisk !== undefined) {
          set(valueFromDisk);
          storedValue = valueFromDisk;
        } else {
          if (localStorageValue !== null) {
            await diskStore.set(key, storedValue);
            await diskStore.save();
          }
        }

        subscribe(async (value) => {
          await diskStore.set(key, value);
          await diskStore.save();
          localStorage.setItem(key, JSON.stringify(value));
        });
      } catch (e) {
        console.warn(
          `[persistentStore] Tauri Store failed for key "${key}", relying on localStorage:`,
          e,
        );
        subscribe((value) => {
          localStorage.setItem(key, JSON.stringify(value));
        });
      }
    })();
  }

  return { subscribe, set, update };
}
