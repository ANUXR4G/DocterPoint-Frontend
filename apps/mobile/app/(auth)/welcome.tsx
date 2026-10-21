import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { CareWelcome } from "@/components/mobile/CareWelcome";

const WELCOME_KEY = "gg.preLoginWelcome";

export default function WelcomeScreen() {
  const router = useRouter();

  async function goLogin() {
    await SecureStore.setItemAsync(WELCOME_KEY, "1");
    router.replace("/(auth)/login");
  }

  return <CareWelcome onContinue={() => void goLogin()} onFocus={() => void goLogin()} />;
}
