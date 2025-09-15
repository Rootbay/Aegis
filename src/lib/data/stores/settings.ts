import { persistentStore } from '$stores/persistentStore';

interface UserSettings {
  name: string;
  avatar: string;
  publicKey: string;
  status: string;
}

interface AppSettings {
  user: UserSettings;
  enableCommandPalette: boolean;
  enableBatteryAware: boolean;
  enableCrossDeviceSync: boolean;
  preferWifiDirect: boolean;
  enableBridgeMode: boolean;
  enableIntelligentMeshRouting: boolean;
  enablePanicButton: boolean;
  enableSpamPrevention: boolean;
  ephemeralMessageDuration: number;
  enableDarkMode: boolean;
  fontSize: number;
  messageDensity: 'cozy' | 'compact';
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
}

const defaultSettings: AppSettings = {
  user: {
    name: 'John Doe',
    avatar: 'https://api.dicebear.com/8.x/bottts-neutral/svg?seed=JohnDoe',
    publicKey: 'AEGIS-PUB-02a1b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3',
    status: 'Exploring the mesh'
  },
  enableCommandPalette: true,
  enableBatteryAware: true,
  enableCrossDeviceSync: true,
  preferWifiDirect: true,
  enableBridgeMode: false,
  enableIntelligentMeshRouting: true,
  enablePanicButton: false,
  enableSpamPrevention: true,
  ephemeralMessageDuration: 60,
  enableDarkMode: true,
  fontSize: 16,
  messageDensity: 'cozy',
  customTheme: false,
  enableLinkPreviews: true,
  enableResilientFileTransfer: true,
  enableWalkieTalkieVoiceMemos: true,
  doNotDisturb: false,
  enableNewMessageNotifications: true,
  enableGroupMessageNotifications: true,
  notificationSound: 'Default Silent Chime',
  autoDownloadMedia: true,
  keepMediaDuration: 30,
  clearCacheOnExit: false,
  enableTwoFactorAuth: false,
};

export const settings = persistentStore<AppSettings>('settings', defaultSettings);
