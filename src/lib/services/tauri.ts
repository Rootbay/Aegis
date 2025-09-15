import { browser } from '$app/environment';

declare global {
  interface Window {
    __TAURI__?: {
      invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      event?: {
        listen?: (event: string, handler: (payload: unknown) => void) => Promise<unknown>;
      };
    };
  }
}

export async function getInvoke(): Promise<((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null> {
  return new Promise((resolve) => {
    const checkTauri = () => {
      if (browser && window.__TAURI__ && window.__TAURI__.invoke) {
        resolve(window.__TAURI__.invoke);
      } else if (browser) {
        setTimeout(checkTauri, 50);
      } else {
        resolve(null);
      }
    };
    checkTauri();
  });
}

export async function getListen(): Promise<((event: string, handler: (payload: unknown) => void) => Promise<unknown>) | null> {
  if (browser && window.__TAURI__ && window.__TAURI__.event && window.__TAURI__.event.listen) {
    return window.__TAURI__.event.listen;
  }
  return null;
}
