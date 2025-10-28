export type InvokeFn = <T>(
  cmd: string,
  args?: Record<string, unknown>,
) => Promise<T>;
export type ListenFn = <T>(
  event: string,
  handler: (payload: T) => void,
) => Promise<() => void>;

declare global {
  interface Window {
    __TAURI__?: {
      invoke?: InvokeFn;
      event?: {
        listen?: ListenFn;
      };
    };
  }
}

const isBrowser = typeof window !== "undefined";

export async function getInvoke(): Promise<InvokeFn | null> {
  if (!isBrowser) {
    return null;
  }

  if (window.__TAURI__?.invoke) {
    return window.__TAURI__.invoke as InvokeFn;
  }

  const pollInterval = 50;
  const maxAttempts = 100;

  return new Promise((resolve) => {
    let attempts = 0;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const resolveSafely = (value: InvokeFn | null) => {
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
      resolve(value);
    };

    intervalId = setInterval(() => {
      if (window.__TAURI__?.invoke) {
        resolveSafely(window.__TAURI__.invoke as InvokeFn);
        return;
      }

      attempts += 1;

      if (attempts >= maxAttempts) {
        // Resolve with null when Tauri never initialises so callers can handle fallbacks.
        resolveSafely(null);
      }
    }, pollInterval);
  });
}

let cachedListen: ListenFn | null = null;
let listenPromise: Promise<ListenFn | null> | null = null;

export async function getListen(): Promise<ListenFn | null> {
  if (!isBrowser) {
    return null;
  }

  if (cachedListen) {
    return cachedListen;
  }

  if (window.__TAURI__?.event?.listen) {
    cachedListen = window.__TAURI__.event.listen as ListenFn;
    return cachedListen;
  }

  if (!listenPromise) {
    const pollInterval = 50;
    const maxAttempts = 100;

    listenPromise = new Promise<ListenFn | null>((resolve) => {
      let attempts = 0;
      let intervalId: ReturnType<typeof setInterval> | null = null;

      const resolveSafely = (value: ListenFn | null) => {
        if (intervalId !== null) {
          clearInterval(intervalId);
        }
        resolve(value);
      };

      intervalId = setInterval(() => {
        if (window.__TAURI__?.event?.listen) {
          cachedListen = window.__TAURI__.event.listen as ListenFn;
          resolveSafely(cachedListen);
          return;
        }

        attempts += 1;

        if (attempts >= maxAttempts) {
          resolveSafely(null);
        }
      }, pollInterval);
    }).finally(() => {
      listenPromise = null;
    });
  }

  const result = await listenPromise;
  if (result) {
    cachedListen = result;
  }
  return result;
}

export function __resetTauriServiceStateForTesting() {
  cachedListen = null;
  listenPromise = null;
}
