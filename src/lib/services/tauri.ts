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
  return new Promise((resolve) => {
    const checkTauri = () => {
      if (browser && window.__TAURI__ && window.__TAURI__.invoke) {
        resolve(window.__TAURI__.invoke as InvokeFn);
      } else if (browser) {
        setTimeout(checkTauri, 50);
      } else {
        resolve(null);
      }
    };
    checkTauri();
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
