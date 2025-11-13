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
    __TAURI_INTERNALS__?: {
      invoke?: InvokeFn;
      event?: {
        listen?: ListenFn;
      };
    };
  }
}

const isBrowser = typeof window !== "undefined";

function resolveInvokeHandle(): InvokeFn | null {
  if (!isBrowser) {
    return null;
  }
  return (
    window.__TAURI__?.invoke ??
    window.__TAURI_INTERNALS__?.invoke ??
    null
  );
}

function resolveListenHandle(): ListenFn | null {
  if (!isBrowser) {
    return null;
  }
  return (
    window.__TAURI__?.event?.listen ??
    window.__TAURI_INTERNALS__?.event?.listen ??
    null
  );
}

export async function getInvoke(): Promise<InvokeFn | null> {
  if (!isBrowser) {
    return null;
  }

  const immediate = resolveInvokeHandle();
  if (immediate) {
    return immediate;
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
      const handle = resolveInvokeHandle();
      if (handle) {
        resolveSafely(handle);
        return;
      }

      attempts += 1;

      if (attempts >= maxAttempts) {
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

  const immediate = resolveListenHandle();
  if (immediate) {
    cachedListen = immediate;
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
        const handle = resolveListenHandle();
        if (handle) {
          cachedListen = handle;
          resolveSafely(handle);
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
