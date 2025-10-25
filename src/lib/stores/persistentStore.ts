import { writable } from "svelte/store";
import { browser } from "$app/environment";
import { Store } from "@tauri-apps/plugin-store";

const STORE_FILENAME = "aegis.dat";
let sharedStorePromise: Promise<Store> | null = null;

export const PERSISTENT_STORE_FLUSH_DELAY = 50;

function getSharedStore() {
  if (!sharedStorePromise) {
    sharedStorePromise = Store.load(STORE_FILENAME);
  }

  return sharedStorePromise;
}

function createDebouncedDiskFlush(
  diskStore: Store,
  key: string,
  delay: number,
) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastValue: unknown;
  let flushChain = Promise.resolve();

  return (value: unknown) => {
    lastValue = value;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      timeoutId = null;
      const valueToPersist = lastValue;

      flushChain = flushChain.then(async () => {
        try {
          await diskStore.set(key, valueToPersist);
          await diskStore.save();
        } catch (error) {
          console.warn(
            `[persistentStore] Failed to persist key "${key}" to disk:`,
            error,
          );
        }
      });
    }, delay);
  };
}

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
        const diskStore = await getSharedStore();
        const valueFromDisk = await diskStore.get<T>(key);

        if (valueFromDisk !== null && valueFromDisk !== undefined) {
          set(valueFromDisk);
          storedValue = valueFromDisk;
          try {
            localStorage.setItem(key, JSON.stringify(valueFromDisk));
          } catch (error) {
            console.warn(
              `[persistentStore] Failed to write localStorage value for key "${key}":`,
              error,
            );
          }
        } else if (localStorageValue !== null) {
          await diskStore.set(key, storedValue);
          await diskStore.save();
        }

        const flushToDisk = createDebouncedDiskFlush(
          diskStore,
          key,
          PERSISTENT_STORE_FLUSH_DELAY,
        );

        subscribe((value) => {
          flushToDisk(value);
          try {
            localStorage.setItem(key, JSON.stringify(value));
          } catch (error) {
            console.warn(
              `[persistentStore] Failed to write localStorage value for key "${key}":`,
              error,
            );
          }
        });
      } catch (e) {
        console.warn(
          `[persistentStore] Tauri Store failed for key "${key}", relying on localStorage:`,
          e,
        );
        subscribe((value) => {
          try {
            localStorage.setItem(key, JSON.stringify(value));
          } catch (error) {
            console.warn(
              `[persistentStore] Failed to write localStorage value for key "${key}":`,
              error,
            );
          }
        });
      }
    })();
  }

  return { subscribe, set, update };
}
