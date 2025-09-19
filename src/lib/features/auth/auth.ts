import { invoke } from "@tauri-apps/api/core";
import { browser } from "$app/environment";

export interface Identity {
  verifying_key: number[];
}

export async function getIdentity(): Promise<Identity | null> {
  if (browser) {
    const storedIdentity = localStorage.getItem("aegis-identity");
    if (storedIdentity) {
      return JSON.parse(storedIdentity);
    }
  }
  return null;
}

export async function createIdentity(): Promise<Identity> {
  const identity: Identity = await invoke("generate_identity");
  if (browser) {
    localStorage.setItem("aegis-identity", JSON.stringify(identity));
  }
  return identity;
}

export async function ensureIdentity(): Promise<Identity | null> {
  if (browser) {
    let identity = await getIdentity();
    if (!identity) {
      identity = await createIdentity();
    }
    return identity;
  }
  return null;
}
