import { get } from "svelte/store";
import { getInvoke } from "$services/tauri";
import { persistentStore } from "$lib/stores/persistentStore";
import type { GatewayStatus } from "$lib/stores/connectivityStore";

export interface TrustedDevice {
  id: string;
  name: string;
  platform: string;
  lastSeen: string;
  active: boolean;
}

export interface ConnectedAccount {
  id: string;
  provider: string;
  username: string;
  linkedAt: string;
  scopes: string[];
}

export interface UserSettings {
  name: string;
  avatar: string;
  publicKey: string;
  status: string;
}

export type MessageDensity = "cozy" | "compact";

export interface AppSettings {
  user: UserSettings;
  enableCommandPalette: boolean;
  enableBatteryAware: boolean;
  enableCrossDeviceSync: boolean;
  preferWifiDirect: boolean;
  enableBridgeMode: boolean;
  enableIntelligentMeshRouting: boolean;
  enablePanicButton: boolean;
  enableSpamPrevention: boolean;
  enableReadReceipts: boolean;
  enableTypingIndicators: boolean;
  showMessageAvatars: boolean;
  showMessageTimestamps: boolean;
  allowDataCollection: boolean;
  personalizeExperience: boolean;
  shareOnlineStatus: boolean;
  shareUsageAnalytics: boolean;
  shareCrashReports: boolean;
  ephemeralMessageDuration: number;
  enableDarkMode: boolean;
  fontSize: number;
  messageDensity: MessageDensity;
  customTheme: boolean;
  enableLinkPreviews: boolean;
  enableResilientFileTransfer: boolean;
  enableWalkieTalkieVoiceMemos: boolean;
  doNotDisturb: boolean;
  enableNewMessageNotifications: boolean;
  enableGroupMessageNotifications: boolean;
  notificationSound: string;
  autoDownloadMedia: boolean;
  keepMediaDuration: number;
  clearCacheOnExit: boolean;
  enableTwoFactorAuth: boolean;
  audioInputDeviceId: string;
  videoInputDeviceId: string;
  audioOutputDeviceId: string;
  enableHighContrast: boolean;
  enableReducedMotion: boolean;
  enableLiveCaptions: boolean;
  screenReaderVerbosity: "concise" | "detailed";
  textToSpeechRate: number;
  filterMatureContent: boolean;
  allowTaggingByFriends: boolean;
  autoShareActivityStatus: boolean;
  allowFriendInvites: boolean;
  autoApproveKnownContacts: boolean;
  surfaceFriendSuggestions: boolean;
  preferredLanguage: string;
  commandPaletteShortcut: string;
  pushToTalkShortcut: string;
  toggleMuteShortcut: string;
  autoDownloadUpdates: boolean;
  includePreReleaseUpdates: boolean;
  remindAboutUpdates: boolean;
  updateReminderIntervalDays: number;
  connectedAccounts: ConnectedAccount[];
  trustedDevices: TrustedDevice[];
}

export const defaultSettings: AppSettings = {
  user: {
    name: "John Doe",
    avatar: "https://api.dicebear.com/8.x/bottts-neutral/svg?seed=JohnDoe",
    publicKey:
      "AEGIS-PUB-02a1b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3",
    status: "Exploring the mesh",
  },
  enableCommandPalette: true,
  enableBatteryAware: true,
  enableCrossDeviceSync: true,
  preferWifiDirect: true,
  enableBridgeMode: false,
  enableIntelligentMeshRouting: true,
  enablePanicButton: false,
  enableSpamPrevention: true,
  enableReadReceipts: true,
  enableTypingIndicators: true,
  showMessageAvatars: true,
  showMessageTimestamps: true,
  allowDataCollection: true,
  personalizeExperience: true,
  shareOnlineStatus: true,
  shareUsageAnalytics: true,
  shareCrashReports: true,
  ephemeralMessageDuration: 60,
  enableDarkMode: true,
  fontSize: 16,
  messageDensity: "cozy",
  customTheme: false,
  enableLinkPreviews: true,
  enableResilientFileTransfer: true,
  enableWalkieTalkieVoiceMemos: true,
  doNotDisturb: false,
  enableNewMessageNotifications: true,
  enableGroupMessageNotifications: true,
  notificationSound: "Default Silent Chime",
  autoDownloadMedia: true,
  keepMediaDuration: 30,
  clearCacheOnExit: false,
  enableTwoFactorAuth: false,
  audioInputDeviceId: "",
  videoInputDeviceId: "",
  audioOutputDeviceId: "",
  enableHighContrast: false,
  enableReducedMotion: false,
  enableLiveCaptions: false,
  screenReaderVerbosity: "concise",
  textToSpeechRate: 1,
  filterMatureContent: true,
  allowTaggingByFriends: true,
  autoShareActivityStatus: true,
  allowFriendInvites: true,
  autoApproveKnownContacts: false,
  surfaceFriendSuggestions: true,
  preferredLanguage: "en-US",
  commandPaletteShortcut: "Ctrl+K",
  pushToTalkShortcut: "Shift+Space",
  toggleMuteShortcut: "Ctrl+Shift+M",
  autoDownloadUpdates: true,
  includePreReleaseUpdates: false,
  remindAboutUpdates: true,
  updateReminderIntervalDays: 7,
  connectedAccounts: [],
  trustedDevices: [
    {
      id: "device-local",
      name: "Aegis Desktop",
      platform: "Linux",
      lastSeen: new Date().toISOString(),
      active: true,
    },
    {
      id: "device-mobile",
      name: "Aegis Mobile",
      platform: "Android",
      lastSeen: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      active: true,
    },
  ],
};

export const settings = persistentStore<AppSettings>(
  "settings",
  defaultSettings,
);

type AppSettingsKey = keyof AppSettings;

export function updateAppSetting<Key extends AppSettingsKey>(
  key: Key,
  value: AppSettings[Key],
) {
  settings.update((current) => {
    if (current[key] === value) {
      return current;
    }

    return {
      ...current,
      [key]: value,
    };
  });
}

export function updateSettings(partial: Partial<AppSettings>) {
  settings.update((current) => ({
    ...current,
    ...partial,
  }));
}

function createBooleanSetter<Key extends AppSettingsKey>(key: Key) {
  return (value: Extract<AppSettings[Key], boolean>) => {
    updateAppSetting(key, value as AppSettings[Key]);
  };
}

export async function triggerPanicWipe(): Promise<boolean> {
  if (typeof window === "undefined") {
    throw new Error("Panic wipe can only be triggered from the desktop client.");
  }

  const initialConfirmation = window.confirm(
    "This will immediately wipe local caches, database entries, and authentication keys. Continue?",
  );

  if (!initialConfirmation) {
    return false;
  }

  const finalConfirmation = window.confirm(
    "This action cannot be undone. Do you want to trigger the panic wipe now?",
  );

  if (!finalConfirmation) {
    return false;
  }

  const invoke = await getInvoke();

  if (!invoke) {
    throw new Error("Secure backend is unavailable. Panic wipe could not be initiated.");
  }

  await invoke("panic_wipe");
  return true;
}

export const setReadReceiptsEnabled = createBooleanSetter("enableReadReceipts");
export const setTypingIndicatorsEnabled = createBooleanSetter(
  "enableTypingIndicators",
);
export const setShowMessageAvatars = createBooleanSetter("showMessageAvatars");
export const setShowMessageTimestamps = createBooleanSetter(
  "showMessageTimestamps",
);
export const setAllowDataCollection = createBooleanSetter(
  "allowDataCollection",
);
export const setPersonalizeExperience = createBooleanSetter(
  "personalizeExperience",
);
export const setShareOnlineStatus = createBooleanSetter("shareOnlineStatus");
export const setShareUsageAnalytics = createBooleanSetter(
  "shareUsageAnalytics",
);
export const setShareCrashReports = createBooleanSetter("shareCrashReports");
export const setLinkPreviewsEnabled = createBooleanSetter("enableLinkPreviews");
export const setResilientFileTransferEnabled = createBooleanSetter(
  "enableResilientFileTransfer",
);
export const setHighContrastEnabled = createBooleanSetter("enableHighContrast");
export const setReducedMotionEnabled = createBooleanSetter(
  "enableReducedMotion",
);
export const setLiveCaptionsEnabled = createBooleanSetter("enableLiveCaptions");
export const setFilterMatureContentEnabled = createBooleanSetter(
  "filterMatureContent",
);
export const setAllowTaggingByFriends = createBooleanSetter(
  "allowTaggingByFriends",
);
export const setAutoShareActivityStatus = createBooleanSetter(
  "autoShareActivityStatus",
);
export const setAllowFriendInvites = createBooleanSetter("allowFriendInvites");
export const setAutoApproveKnownContacts = createBooleanSetter(
  "autoApproveKnownContacts",
);
export const setSurfaceFriendSuggestions = createBooleanSetter(
  "surfaceFriendSuggestions",
);
export const setAutoDownloadUpdates = createBooleanSetter(
  "autoDownloadUpdates",
);
export const setIncludePreReleaseUpdates = createBooleanSetter(
  "includePreReleaseUpdates",
);
export const setRemindAboutUpdates = createBooleanSetter("remindAboutUpdates");
export async function setWalkieTalkieVoiceMemosEnabled(value: boolean) {
  if (get(settings).enableWalkieTalkieVoiceMemos !== value) {
    updateAppSetting("enableWalkieTalkieVoiceMemos", value);
  }
  try {
    const invoke = await getInvoke();
    if (invoke) {
      await invoke("set_voice_memos_enabled", { enabled: value });
    }
  } catch (error) {
    console.error("Failed to sync voice memo setting with backend", error);
  }
}

void setWalkieTalkieVoiceMemosEnabled(
  get(settings).enableWalkieTalkieVoiceMemos,
);
export const setAutoDownloadMediaEnabled =
  createBooleanSetter("autoDownloadMedia");
export const setClearCacheOnExit = createBooleanSetter("clearCacheOnExit");
export const setEnableNewMessageNotifications = createBooleanSetter(
  "enableNewMessageNotifications",
);
export const setEnableGroupMessageNotifications = createBooleanSetter(
  "enableGroupMessageNotifications",
);
export const setEnableCrossDeviceSync = createBooleanSetter(
  "enableCrossDeviceSync",
);
export async function setPreferWifiDirect(value: boolean) {
  const current = get(settings).preferWifiDirect;

  if (current === value) {
    return;
  }

  updateAppSetting("preferWifiDirect", value);

  try {
    const invoke = await getInvoke();
    if (invoke) {
      await invoke("set_wifi_direct_enabled", { enabled: value });
    }
  } catch (error) {
    console.error("Failed to update Wi-Fi Direct preference", error);
    updateAppSetting("preferWifiDirect", current);
  }
}

export async function setEnableIntelligentMeshRouting(value: boolean) {
  const current = get(settings).enableIntelligentMeshRouting;

  if (current === value) {
    return;
  }

  updateAppSetting("enableIntelligentMeshRouting", value);

  try {
    const invoke = await getInvoke();
    if (invoke) {
      await invoke("set_bluetooth_enabled", { enabled: value });
    }
  } catch (error) {
    console.error("Failed to update Bluetooth mesh routing", error);
    updateAppSetting("enableIntelligentMeshRouting", current);
  }
}

export async function setEnableBridgeMode(
  value: Extract<AppSettings["enableBridgeMode"], boolean>,
): Promise<GatewayStatus | null> {
  const invoke = await getInvoke();
  const previous = get(settings).enableBridgeMode;

  if (!invoke) {
    updateAppSetting(
      "enableBridgeMode",
      value as AppSettings["enableBridgeMode"],
    );
    return null;
  }

  try {
    const status = await invoke<GatewayStatus | null>(
      "set_bridge_mode_enabled",
      {
        enabled: value,
      },
    );
    const effective = status?.bridgeModeEnabled ?? value;
    updateAppSetting(
      "enableBridgeMode",
      effective as AppSettings["enableBridgeMode"],
    );
    return status;
  } catch (error) {
    console.error("Failed to toggle Bridge Mode", error);
    updateAppSetting(
      "enableBridgeMode",
      previous as AppSettings["enableBridgeMode"],
    );
    throw error;
  }
}
export const setEnableDarkMode = createBooleanSetter("enableDarkMode");

export const setMessageDensity = (density: MessageDensity) => {
  updateAppSetting("messageDensity", density);
};

export const setEphemeralMessageDuration = (durationMinutes: number) => {
  const normalized = Math.max(0, Math.round(durationMinutes));
  updateAppSetting("ephemeralMessageDuration", normalized);
};

export const setKeepMediaDuration = (days: number) => {
  const normalized = Math.max(1, Math.min(180, Math.round(days)));
  updateAppSetting("keepMediaDuration", normalized);
};

export const setNotificationSound = (sound: string) => {
  updateAppSetting("notificationSound", sound.trim());
};

export const setFontSize = (size: number) => {
  const normalized = Math.max(8, Math.min(36, Math.round(size)));
  updateAppSetting("fontSize", normalized);
};

export const setAudioInputDeviceId = (deviceId: string) => {
  updateAppSetting("audioInputDeviceId", deviceId.trim());
};

export const setVideoInputDeviceId = (deviceId: string) => {
  updateAppSetting("videoInputDeviceId", deviceId.trim());
};

export const setAudioOutputDeviceId = (deviceId: string) => {
  updateAppSetting("audioOutputDeviceId", deviceId.trim());
};

export const setScreenReaderVerbosity = (
  level: AppSettings["screenReaderVerbosity"],
) => {
  updateAppSetting("screenReaderVerbosity", level);
};

export const setTextToSpeechRate = (rate: number) => {
  const normalized = Math.min(2, Math.max(0.5, Number(rate)));
  updateAppSetting("textToSpeechRate", Number(normalized.toFixed(2)));
};

export const setPreferredLanguage = (language: string) => {
  updateAppSetting("preferredLanguage", language);
};

export const setCommandPaletteShortcut = (shortcut: string) => {
  updateAppSetting("commandPaletteShortcut", shortcut.trim());
};

export const setPushToTalkShortcut = (shortcut: string) => {
  updateAppSetting("pushToTalkShortcut", shortcut.trim());
};

export const setToggleMuteShortcut = (shortcut: string) => {
  updateAppSetting("toggleMuteShortcut", shortcut.trim());
};

export const setUpdateReminderInterval = (days: number) => {
  const normalized = Math.max(1, Math.min(30, Math.round(days)));
  updateAppSetting("updateReminderIntervalDays", normalized);
};

export function upsertTrustedDevice(device: TrustedDevice) {
  settings.update((current) => {
    const existingIndex = current.trustedDevices.findIndex(
      (item) => item.id === device.id,
    );
    const trustedDevices = [...current.trustedDevices];
    if (existingIndex >= 0) {
      trustedDevices[existingIndex] = {
        ...trustedDevices[existingIndex],
        ...device,
      };
    } else {
      trustedDevices.push(device);
    }

    return {
      ...current,
      trustedDevices,
    };
  });
}

export function revokeTrustedDevice(deviceId: string) {
  settings.update((current) => ({
    ...current,
    trustedDevices: current.trustedDevices.map((device) =>
      device.id === deviceId ? { ...device, active: false } : device,
    ),
  }));
}

export function removeTrustedDevice(deviceId: string) {
  settings.update((current) => ({
    ...current,
    trustedDevices: current.trustedDevices.filter(
      (device) => device.id !== deviceId,
    ),
  }));
}

function generateFallbackId(prefix: string) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

function applyConnectedAccountUpdate(
  updater: (accounts: ConnectedAccount[]) => ConnectedAccount[],
) {
  settings.update((current) => ({
    ...current,
    connectedAccounts: updater(current.connectedAccounts),
  }));
}

export async function refreshConnectedAccountsFromBackend() {
  try {
    const invoke = await getInvoke();
    if (!invoke) {
      return;
    }
    const accounts = await invoke<ConnectedAccount[]>(
      "list_connected_accounts",
    );
    settings.update((current) => ({
      ...current,
      connectedAccounts: accounts,
    }));
  } catch (error) {
    console.error("Failed to refresh connected accounts", error);
  }
}

export async function linkConnectedAccount(provider: string, username: string) {
  const normalized = username.trim();
  if (!normalized) {
    throw new Error("Account handle is required.");
  }

  try {
    const invoke = await getInvoke();
    if (invoke) {
      const account = await invoke<ConnectedAccount>("link_external_account", {
        provider,
        username: normalized,
      });
      applyConnectedAccountUpdate((accounts) => {
        const index = accounts.findIndex((item) => item.id === account.id);
        if (index >= 0) {
          const clone = [...accounts];
          clone[index] = account;
          return clone;
        }
        return [...accounts, account];
      });
      return account;
    }
  } catch (error) {
    console.error("Failed to link external account", error);
    throw error instanceof Error
      ? error
      : new Error("Unable to link external account.");
  }

  const fallbackAccount: ConnectedAccount = {
    id: generateFallbackId(provider),
    provider,
    username: normalized,
    linkedAt: new Date().toISOString(),
    scopes: ["basic"],
  };
  applyConnectedAccountUpdate((accounts) => [...accounts, fallbackAccount]);
  return fallbackAccount;
}

export async function unlinkConnectedAccount(accountId: string) {
  try {
    const invoke = await getInvoke();
    if (invoke) {
      await invoke("unlink_external_account", { accountId });
    }
  } catch (error) {
    console.error("Failed to unlink external account", error);
    throw error instanceof Error
      ? error
      : new Error("Unable to unlink external account.");
  }

  applyConnectedAccountUpdate((accounts) =>
    accounts.filter((item) => item.id !== accountId),
  );
}
