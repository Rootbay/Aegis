import { browser } from "$app/environment";

import {
  decodeDeviceHandshake,
  encodeDeviceHandshake,
  encryptWithSecret,
  hashString,
  verifyTotp,
  decryptWithSecret,
  type DeviceHandshakePayload,
} from "$lib/utils/security";

import type { AuthPersistence, TrustedDevice } from "./persistenceService";

export const ingestDeviceHandshake = (raw: string): DeviceHandshakePayload => {
  const payload = decodeDeviceHandshake(raw);
  if (!payload) {
    throw new Error("Unrecognized device login QR payload.");
  }
  return payload;
};

interface ApproveDeviceHandshakeParams {
  payload: DeviceHandshakePayload;
  totpCode: string;
  persisted: AuthPersistence;
}

export const approveDeviceHandshake = async ({
  payload,
  totpCode,
  persisted,
}: ApproveDeviceHandshakeParams) => {
  const {
    password,
    totpSecret,
    username,
    recoveryEnvelope,
    recoveryHash,
    requireTotpOnUnlock,
  } = payload;

  const totpValid = await verifyTotp(totpSecret, totpCode);
  if (!totpValid) {
    throw new Error("Invalid authenticator code.");
  }

  const passwordHash = await hashString(password);
  const passwordEnvelope = await encryptWithSecret(totpSecret, password);
  const totpRequirement =
    typeof requireTotpOnUnlock === "boolean"
      ? requireTotpOnUnlock
      : (persisted.requireTotpOnUnlock ?? false);

  return {
    updatedPersistence: {
      ...persisted,
      username,
      passwordHash,
      passwordEnvelope,
      recoveryEnvelope: recoveryEnvelope ?? null,
      recoveryHash: recoveryHash ?? null,
      totpSecret,
      requireTotpOnUnlock: totpRequirement,
      createdAt: persisted.createdAt ?? new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    } satisfies AuthPersistence,
    totpRequirement,
  };
};

interface CreateDeviceHandshakeParams {
  totpCode: string;
  persisted: AuthPersistence;
}

export const createDeviceHandshake = async ({
  totpCode,
  persisted,
}: CreateDeviceHandshakeParams) => {
  if (!persisted.passwordEnvelope || !persisted.totpSecret) {
    throw new Error("Device pairing is unavailable.");
  }

  const totpValid = await verifyTotp(persisted.totpSecret, totpCode);
  if (!totpValid) {
    throw new Error("Invalid authenticator code.");
  }

  const password = await decryptWithSecret(
    persisted.totpSecret,
    persisted.passwordEnvelope,
  );

  const payload: DeviceHandshakePayload = {
    version: 1,
    password,
    totpSecret: persisted.totpSecret,
    username: persisted.username,
    issuedAt: Date.now(),
    recoveryEnvelope: persisted.recoveryEnvelope ?? null,
    recoveryHash: persisted.recoveryHash ?? null,
    requireTotpOnUnlock: persisted.requireTotpOnUnlock ?? false,
  };

  return encodeDeviceHandshake(payload);
};

export const getDeviceInfo = async (): Promise<TrustedDevice> => {
  if (!browser) {
    return {
      id: "unknown",
      name: "Unknown Device",
      lastUsed: new Date().toISOString(),
    };
  }

  const userAgent = navigator.userAgent;
  const deviceId = await hashString(
    userAgent + navigator.language + screen.width + screen.height,
  );

  return {
    id: deviceId,
    name: getDeviceName(userAgent),
    lastUsed: new Date().toISOString(),
    userAgent,
  };
};

const getDeviceName = (userAgent: string): string => {
  if (userAgent.includes("Windows")) return "Windows PC";
  if (userAgent.includes("Mac")) return "Mac";
  if (userAgent.includes("Linux")) return "Linux PC";
  if (userAgent.includes("Android")) return "Android Device";
  if (userAgent.includes("iPhone")) return "iPhone";
  if (userAgent.includes("iPad")) return "iPad";
  return "Unknown Device";
};
