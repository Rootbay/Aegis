export type WritableStore<T> = {
  subscribe: (run: (value: T) => void) => () => void;
  set: (value: T) => void;
};

export function createWritableStore<T>(initial: T): WritableStore<T> {
  let value = initial;
  const subscribers = new Set<(current: T) => void>();
  return {
    subscribe(run) {
      run(value);
      subscribers.add(run);
      return () => {
        subscribers.delete(run);
      };
    },
    set(nextValue) {
      value = nextValue;
      subscribers.forEach((run) => run(value));
    },
  };
}
