import { browser } from "$app/environment";

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

export async function getInvoke(): Promise<InvokeFn | null> {
  if (!browser) {
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

export async function getListen(): Promise<ListenFn | null> {
  if (
    browser &&
    window.__TAURI__ &&
    window.__TAURI__.event &&
    window.__TAURI__.event.listen
  ) {
    return window.__TAURI__.event.listen as ListenFn;
  }
  return null;
}
