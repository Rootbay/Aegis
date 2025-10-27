import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/api/notification";

export interface NativeNotificationPayload {
  title: string;
  body: string;
  sound?: string;
}

let cachedPermission: "unknown" | "granted" | "denied" = "unknown";
let pendingPermissionRequest: Promise<boolean> | null = null;

const ensurePermission = async (): Promise<boolean> => {
  if (typeof window === "undefined") {
    return false;
  }

  if (cachedPermission === "granted") {
    return true;
  }

  if (cachedPermission === "denied") {
    return false;
  }

  try {
    const alreadyGranted = await isPermissionGranted();
    if (alreadyGranted) {
      cachedPermission = "granted";
      return true;
    }
  } catch (error) {
    console.debug("Notification permission check failed", error);
    cachedPermission = "denied";
    return false;
  }

  if (!pendingPermissionRequest) {
    pendingPermissionRequest = requestPermission()
      .then((permission) => {
        cachedPermission = permission === "granted" ? "granted" : "denied";
        return cachedPermission === "granted";
      })
      .catch((error) => {
        console.debug("Notification permission request failed", error);
        cachedPermission = "denied";
        return false;
      })
      .finally(() => {
        pendingPermissionRequest = null;
      });
  }

  return pendingPermissionRequest;
};

export async function showNativeNotification(
  payload: NativeNotificationPayload,
): Promise<void> {
  if (!payload?.title || !payload?.body) {
    return;
  }

  const hasPermission = await ensurePermission();
  if (!hasPermission) {
    return;
  }

  const notificationOptions: NativeNotificationPayload = {
    title: payload.title,
    body: payload.body,
  };

  const trimmedSound = payload.sound?.trim();
  if (trimmedSound) {
    notificationOptions.sound = trimmedSound;
  }

  try {
    await sendNotification(notificationOptions);
  } catch (error) {
    console.debug("Failed to show native notification", error);
  }
}
