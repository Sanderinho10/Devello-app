import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Små dunk i fingeren: ett lett for valg og +/−, et tydelig når noe er
 * lagret. Montøren ser ikke alltid på skjermen. Feiler stille der
 * telefonen ikke støtter det.
 */
const paa = Platform.OS === "ios" || Platform.OS === "android";

export function valg() {
  if (paa) Haptics.selectionAsync().catch(() => {});
}

export function lagret() {
  if (paa) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function advarsel() {
  if (paa) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
