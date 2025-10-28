import { get } from "svelte/store";
import { getInvoke } from "$services/tauri";
import { persistentStore } from "$lib/stores/persistentStore";
import type { GatewayStatus } from "$lib/stores/connectivityStore";

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
}

const defaultSettings: AppSettings = {
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

export const setReadReceiptsEnabled = createBooleanSetter(
  "enableReadReceipts",
);
export const setTypingIndicatorsEnabled = createBooleanSetter(
  "enableTypingIndicators",
);
export const setShowMessageAvatars = createBooleanSetter(
  "showMessageAvatars",
);
export const setShowMessageTimestamps = createBooleanSetter(
  "showMessageTimestamps",
);
export const setAllowDataCollection = createBooleanSetter(
  "allowDataCollection",
);
export const setPersonalizeExperience = createBooleanSetter(
  "personalizeExperience",
);
export const setShareOnlineStatus = createBooleanSetter(
  "shareOnlineStatus",
);
export const setShareUsageAnalytics = createBooleanSetter(
  "shareUsageAnalytics",
);
export const setShareCrashReports = createBooleanSetter(
  "shareCrashReports",
);
export const setLinkPreviewsEnabled = createBooleanSetter(
  "enableLinkPreviews",
);
export const setResilientFileTransferEnabled = createBooleanSetter(
  "enableResilientFileTransfer",
);
export const setWalkieTalkieVoiceMemosEnabled = createBooleanSetter(
  "enableWalkieTalkieVoiceMemos",
);
export const setAutoDownloadMediaEnabled = createBooleanSetter(
  "autoDownloadMedia",
);
export const setEnableNewMessageNotifications = createBooleanSetter(
  "enableNewMessageNotifications",
);
export const setEnableGroupMessageNotifications = createBooleanSetter(
  "enableGroupMessageNotifications",
);
export const setEnableCrossDeviceSync = createBooleanSetter(
  "enableCrossDeviceSync",
);
export const setPreferWifiDirect = createBooleanSetter("preferWifiDirect");
export const setEnableIntelligentMeshRouting = createBooleanSetter(
  "enableIntelligentMeshRouting",
);

export async function setEnableBridgeMode(
  value: Extract<AppSettings["enableBridgeMode"], boolean>,
): Promise<GatewayStatus | null> {
  const invoke = await getInvoke();
  const previous = get(settings).enableBridgeMode;

  if (!invoke) {
    updateAppSetting("enableBridgeMode", value as AppSettings["enableBridgeMode"]);
    return null;
  }

  try {
    const status = await invoke<GatewayStatus | null>("set_bridge_mode_enabled", {
      enabled: value,
    });
    const effective = status?.bridgeModeEnabled ?? value;
    updateAppSetting("enableBridgeMode", effective as AppSettings["enableBridgeMode"]);
    return status;
  } catch (error) {
    console.error("Failed to toggle Bridge Mode", error);
    updateAppSetting("enableBridgeMode", previous as AppSettings["enableBridgeMode"]);
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
