import { writable, get, derived, type Writable } from 'svelte/store';

export function getWritableProperty<T, K extends keyof T>(store: Writable<T>, key: K) {
  const childStore = writable(get(store)[key]);

  childStore.subscribe(value => {
    store.update(s => ({
      ...s,
      [key]: value
    }));
  });

  return childStore;
}

export function getNestedWritableProperty<T extends Record<string, unknown>, V>(store: Writable<T>, path: string) {
  const parts = path.split('.');
  const lastPart = parts[parts.length - 1];
  const pathToParent = parts.slice(0, -1);

  return {
    subscribe: derived(store, $store => {
      let val: unknown = $store;
      for (const part of parts) {
        if (val === undefined || val === null || typeof val !== 'object') return undefined;
        val = (val as Record<string, unknown>)[part];
      }
      return val as V;
    }).subscribe,
    set: (value: V) => store.update(s => {
      const newStore = { ...s };
      let current: Record<string, unknown> = newStore;
      for (let i = 0; i < pathToParent.length; i++) {
        const part = pathToParent[i];
        current[part] = { ...(current[part] as Record<string, unknown>) };
        current = current[part] as Record<string, unknown>;
      }
      current[lastPart] = value;
      return newStore;
    }),
    update: (updater: (value: V) => V) => store.update(s => {
      const newStore = { ...s };
      let current: Record<string, unknown> = newStore;
      for (let i = 0; i < pathToParent.length; i++) {
        const part = pathToParent[i];
        current[part] = { ...(current[part] as Record<string, unknown>) };
        current = current[part] as Record<string, unknown>;
      }
      current[lastPart] = updater(current[lastPart] as V);
      return newStore;
    })
  };
}