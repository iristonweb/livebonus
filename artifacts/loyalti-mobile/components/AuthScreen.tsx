import {
  useRequestOtp,
  useVerifyOtp,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";

import { BrandMark } from "@/components/BrandMark";
import { AnimatedPressable } from "@/components/AnimatedPressable";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

function getApiErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (typeof data === "object" && data !== null && "error" in data) {
      const message = (data as { error?: unknown }).error;
      if (typeof message === "string" && message.trim()) return message;
    }
  }

  return "Не удалось выполнить запрос. Попробуйте ещё раз.";
}

export function AuthLoadingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.loadingContainer,
        {
          backgroundColor: colors.background,
          paddingTop: Platform.OS === "web" ? 67 : insets.top,
          paddingBottom: Platform.OS === "web" ? 34 : insets.bottom,
        },
      ]}
    >
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}

export default function AuthScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn } = useAuth();
  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [error, setError] = useState<string | null>(null);

  const stylesForColors = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 24,
      paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24,
    },
    brand: { alignItems: "center", marginBottom: 40 },
    brandMark: {
      width: 68,
      height: 68,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
      marginBottom: 20,
    },
    eyebrow: {
      color: colors.accent,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.8,
      textTransform: "uppercase",
      marginBottom: 10,
    },
    title: {
      color: colors.foreground,
      fontSize: 30,
      fontWeight: "800",
      letterSpacing: -1,
      textAlign: "center",
    },
    subtitle: {
      color: colors.mutedForeground,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 10,
      maxWidth: 320,
      textAlign: "center",
    },
    form: {
      width: "100%",
      maxWidth: 420,
      alignSelf: "center",
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: colors.radius * 1.25,
      borderWidth: 1,
      padding: 20,
    },
    label: {
      color: colors.foreground,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.input,
      borderColor: colors.border,
      borderRadius: colors.radius,
      borderWidth: 1,
      color: colors.foreground,
      fontSize: 18,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    inputCode: {
      letterSpacing: 8,
      textAlign: "center",
    },
    helper: {
      color: colors.mutedForeground,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 10,
    },
    error: {
      color: colors.destructive,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 12,
    },
    button: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      justifyContent: "center",
      marginTop: 20,
      minHeight: 52,
      paddingHorizontal: 18,
    },
    buttonDisabled: { opacity: 0.55 },
    buttonText: {
      color: colors.primaryForeground,
      fontSize: 15,
      fontWeight: "800",
    },
    secondaryButton: {
      alignItems: "center",
      justifyContent: "center",
      marginTop: 14,
      minHeight: 44,
      paddingHorizontal: 12,
    },
    secondaryButtonText: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: "700",
    },
    secureNote: {
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
      justifyContent: "center",
      marginTop: 24,
    },
    secureNoteText: { color: colors.mutedForeground, fontSize: 12 },
  });

  const handleRequestOtp = () => {
    const trimmedPhone = phone.trim();
    if (trimmedPhone.length < 7) {
      setError("Введите номер телефона.");
      return;
    }

    setError(null);
    requestOtp.mutate(
      { data: { phone: trimmedPhone } },
      {
        onSuccess: (response) => {
          setPhone(trimmedPhone);
          setMaskedPhone(response.maskedPhone);
          setDevCode(response.devCode ?? null);
          setStep("code");
        },
        onError: (requestError) => setError(getApiErrorMessage(requestError)),
      },
    );
  };

  const handleVerifyOtp = async () => {
    const trimmedCode = code.trim();
    if (trimmedCode.length !== 4) {
      setError("Введите 4 цифры из сообщения.");
      return;
    }

    setError(null);
    try {
      const session = await verifyOtp.mutateAsync({
        data: { phone: phone.trim(), code: trimmedCode },
      });
      await signIn(session);
      router.replace("/(tabs)");
    } catch (verifyError) {
      setError(getApiErrorMessage(verifyError));
    }
  };

  const isPending = requestOtp.isPending || verifyOtp.isPending;

  return (
    <View style={stylesForColors.container}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={stylesForColors.content}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(500)} style={stylesForColors.brand}>
          <View style={stylesForColors.brandMark}>
            <BrandMark size={38} color={colors.primaryForeground} />
          </View>
          <Text style={stylesForColors.eyebrow}>ЛоялТи</Text>
          <Text style={stylesForColors.title}>Войдите в аккаунт</Text>
          <Text style={stylesForColors.subtitle}>
            Получайте бонусы, следите за балансом и управляйте историей операций.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(100)} style={stylesForColors.form}>
          {step === "phone" ? (
            <>
              <Text style={stylesForColors.label}>Номер телефона</Text>
              <TextInput
                autoComplete="tel"
                autoFocus
                autoCapitalize="none"
                keyboardType="phone-pad"
                onChangeText={setPhone}
                onSubmitEditing={handleRequestOtp}
                placeholder="+7 900 123-45-67"
                placeholderTextColor={colors.mutedForeground}
                style={stylesForColors.input}
                testID="auth-phone-input"
                textContentType="telephoneNumber"
                value={phone}
              />
              <Text style={stylesForColors.helper}>
                Мы отправим одноразовый код подтверждения. Он действует 10 минут.
              </Text>
              {error ? <Text style={stylesForColors.error}>{error}</Text> : null}
              <AnimatedPressable
                accessibilityRole="button"
                disabled={isPending}
                onPress={handleRequestOtp}
                style={[stylesForColors.button, isPending && stylesForColors.buttonDisabled]}
                testID="auth-request-otp"
              >
                {requestOtp.isPending ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={stylesForColors.buttonText}>Получить код</Text>
                )}
              </AnimatedPressable>
            </>
          ) : (
            <>
              <Text style={stylesForColors.label}>Код из сообщения</Text>
              <TextInput
                autoFocus
                keyboardType="number-pad"
                maxLength={4}
                onChangeText={setCode}
                onSubmitEditing={handleVerifyOtp}
                placeholder="0000"
                placeholderTextColor={colors.mutedForeground}
                style={[stylesForColors.input, stylesForColors.inputCode]}
                testID="auth-code-input"
                textContentType="oneTimeCode"
                value={code}
              />
              <Text style={stylesForColors.helper}>
                Код отправлен на {maskedPhone || "указанный номер"}.
              </Text>
              {devCode ? (
                <Text style={stylesForColors.helper}>Код для preview: {devCode}</Text>
              ) : null}
              {error ? <Text style={stylesForColors.error}>{error}</Text> : null}
              <AnimatedPressable
                accessibilityRole="button"
                disabled={isPending}
                onPress={handleVerifyOtp}
                style={[stylesForColors.button, isPending && stylesForColors.buttonDisabled]}
                testID="auth-verify-otp"
              >
                {verifyOtp.isPending ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={stylesForColors.buttonText}>Войти</Text>
                )}
              </AnimatedPressable>
              <AnimatedPressable
                accessibilityRole="button"
                disabled={isPending}
                onPress={() => {
                  setCode("");
                  setError(null);
                  setDevCode(null);
                  setStep("phone");
                }}
                style={stylesForColors.secondaryButton}
                testID="auth-change-phone"
              >
                <Text style={stylesForColors.secondaryButtonText}>Изменить номер</Text>
              </AnimatedPressable>
            </>
          )}
        </Animated.View>

        <View style={stylesForColors.secureNote}>
          <Ionicons name="shield-checkmark-outline" size={15} color={colors.mutedForeground} />
          <Text style={stylesForColors.secureNoteText}>Безопасный вход по одноразовому коду</Text>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
});