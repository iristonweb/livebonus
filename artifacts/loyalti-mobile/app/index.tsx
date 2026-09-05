import { Redirect } from "expo-router";

import { AuthLoadingScreen, default as AuthScreen } from "@/components/AuthScreen";
import { useAuth } from "@/context/AuthContext";

export default function IndexScreen() {
  const { status } = useAuth();

  if (status === "loading") return <AuthLoadingScreen />;
  if (status === "authenticated") return <Redirect href="/(tabs)" />;
  return <AuthScreen />;
}