export type DeviceTrustStatus = "active" | "revoked" | "pending_approval";

export interface TrustedDevice {
  id: string;
  name: string;
  platform: string;
  status: DeviceTrustStatus;
  addedAt: string;
  lastSeen: string;
  fingerprint?: string;
}

export type DevicePairingStage =
  | "bundle_issued"
  | "awaiting_approval"
  | "approved"
  | "completed"
  | "expired";

export interface DeviceProvisioningBundle {
  bundleId: string;
  createdAt: string;
  expiresAt: string;
  qrPayload: string;
  codePhrase: string;
}

export interface PendingDeviceLink {
  name: string;
  platform: string;
  requestedAt: string;
}

export interface DeviceProvisioningState {
  bundle: DeviceProvisioningBundle;
  stage: DevicePairingStage;
  requestingDevice?: PendingDeviceLink | null;
  statusMessage?: string | null;
}

export interface DeviceInventorySnapshot {
  trustedDevices: TrustedDevice[];
  provisioning: DeviceProvisioningState[];
}

export interface DeviceSyncResult {
  encryptedProfile: string;
  approvedDevice: TrustedDevice;
  issuedAt: string;
  messageCount: number;
}
