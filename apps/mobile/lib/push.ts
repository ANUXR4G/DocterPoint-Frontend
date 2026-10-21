import Constants from "expo-constants";
import * as Device from "expo-device";

type NotificationsModule = typeof import("expo-notifications");

/** Expo Go no longer includes Android remote notifications. The installed app still does. */
function notifications(): NotificationsModule | null {
  if (Constants.executionEnvironment === "storeClient") return null;
  // Loaded only outside Expo Go. Importing it there throws on Android.
  return require("expo-notifications") as NotificationsModule;
}

const Notifications = notifications();

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/** Request push permission; device registry is optional on GlucoGuide backend. */
export async function registerForPush(): Promise<string | null> {
  if (!Notifications || !Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let final = existing;
  if (existing !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    final = req.status;
  }
  if (final !== "granted") return null;

  try {
    return (await Notifications.getExpoPushTokenAsync()).data;
  } catch {
    return null;
  }
}
