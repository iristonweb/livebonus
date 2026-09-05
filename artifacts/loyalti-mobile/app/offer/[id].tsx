import { Ionicons } from "@expo/vector-icons";
import {
  useActivateOffer,
  useDeleteSavedOffer,
  useGetOffer,
  useSaveOffer,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedPressable } from "@/components/AnimatedPressable";
import { PartnerLogo } from "@/components/PartnerLogo";
import { useColors } from "@/hooks/useColors";
import { isAuthError } from "@/lib/financeUi";

const CATEGORY_LABELS: Record<string, string> = {
  rent: "Аренда",
  utilities: "ЖКХ",
  transport: "Транспорт",
  health: "Здоровье",
  food: "Еда",
  other: "Прочее",
};

function formatRub(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function daysLeft(value: string): number {
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86400000));
}

function getErrorMessage(error: unknown): string {
  if (isAuthError(error)) return "Войдите в аккаунт, чтобы управлять сохранёнными предложениями.";
  if (error instanceof Error && error.message) return error.message;
  return "Не удалось выполнить действие. Попробуйте ещё раз.";
}

export default function OfferDetailsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const offerId = Number(Array.isArray(params.id) ? params.id[0] : params.id);
  const [savedOverride, setSavedOverride] = useState<boolean | null>(null);
  const [activatedOverride, setActivatedOverride] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: offer, isLoading, isError, error, refetch } = useGetOffer(offerId);
  const saveOffer = useSaveOffer();
  const deleteSavedOffer = useDeleteSavedOffer();
  const activateOffer = useActivateOffer();

  const saved = savedOverride ?? offer?.isSaved ?? false;
  const activated = activatedOverride ?? offer?.isActivated ?? false;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top,
      paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 28,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerTitle: {
      flex: 1,
      marginLeft: 14,
      fontSize: 18,
      fontWeight: "700",
      color: colors.foreground,
    },
    hero: {
      marginHorizontal: 20,
      marginTop: 16,
      padding: 20,
      borderRadius: colors.radius * 1.25,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    heroTop: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 22,
    },
    partnerName: {
      flex: 1,
      marginLeft: 12,
      fontSize: 14,
      color: colors.mutedForeground,
      fontWeight: "700",
    },
    multiplier: {
      fontSize: 26,
      fontWeight: "800",
      color: colors.accent,
    },
    title: {
      fontSize: 26,
      lineHeight: 32,
      fontWeight: "800",
      color: colors.foreground,
      letterSpacing: -0.6,
    },
    description: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.mutedForeground,
      marginTop: 12,
    },
    category: {
      alignSelf: "flex-start",
      marginTop: 18,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.secondary,
      color: colors.mutedForeground,
      fontSize: 12,
      fontWeight: "700",
    },
    statusBadge: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      marginTop: 12,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: colors.categoryHealthBg,
    },
    statusBadgeText: {
      marginLeft: 6,
      color: colors.categoryHealthAccent,
      fontSize: 12,
      fontWeight: "700",
    },
    facts: {
      marginHorizontal: 20,
      marginTop: 16,
      padding: 18,
      borderRadius: colors.radius,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 16,
    },
    fact: {
      flexDirection: "row",
      alignItems: "center",
    },
    factIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.secondary,
      marginRight: 12,
    },
    factLabel: {
      fontSize: 12,
      color: colors.mutedForeground,
      marginBottom: 2,
    },
    factValue: {
      fontSize: 15,
      color: colors.foreground,
      fontWeight: "700",
    },
    feedback: {
      marginHorizontal: 20,
      marginTop: 16,
      padding: 14,
      borderRadius: 12,
      backgroundColor: colors.categoryHealthBg,
      color: colors.categoryHealthAccent,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "600",
    },
    error: {
      margin: 20,
      padding: 16,
      borderRadius: colors.radius,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.destructive,
      fontSize: 15,
      lineHeight: 22,
    },
    actions: {
      marginHorizontal: 20,
      marginTop: 20,
      gap: 10,
    },
    primaryButton: {
      minHeight: 52,
      borderRadius: colors.radius,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.foreground,
      paddingHorizontal: 18,
    },
    primaryButtonText: {
      color: colors.background,
      fontSize: 15,
      fontWeight: "700",
    },
    secondaryButton: {
      minHeight: 50,
      borderRadius: colors.radius,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 18,
    },
    secondaryButtonText: {
      color: colors.foreground,
      fontSize: 15,
      fontWeight: "700",
    },
    loading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    retryButton: { marginTop: 18, minHeight: 46, paddingHorizontal: 20, borderRadius: colors.radius, backgroundColor: colors.foreground, alignItems: "center", justifyContent: "center" },
    retryButtonText: { color: colors.background, fontSize: 14, fontWeight: "800" },
  });

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </View>
    );
  }

  if (isError || !offer) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Назад">
            <Ionicons name="arrow-back" size={20} color={colors.foreground} />
          </AnimatedPressable>
        </View>
        <Text style={styles.error}>
          {isAuthError(error) ? "Войдите в аккаунт, чтобы открыть предложение." : "Предложение не найдено или больше недоступно."}
        </Text>
        {!isAuthError(error) ? (
          <AnimatedPressable onPress={() => void refetch()} style={styles.retryButton} testID="offer-retry">
            <Text style={styles.retryButtonText}>Повторить</Text>
          </AnimatedPressable>
        ) : null}
      </View>
    );
  }

  const handleSave = () => {
    setFeedback(null);
    saveOffer.mutate(
      { id: offer.id },
      {
        onSuccess: (result) => {
          setSavedOverride(result.saved);
          setActivatedOverride(result.activated);
          void queryClient.invalidateQueries({ queryKey: ["offers", "saved"] });
          setFeedback("Предложение сохранено в вашем профиле.");
        },
        onError: (mutationError) => setFeedback(getErrorMessage(mutationError)),
      },
    );
  };

  const handleActivate = () => {
    setFeedback(null);
    activateOffer.mutate(
      { id: offer.id },
      {
        onSuccess: (result) => {
          setSavedOverride(result.saved);
          setActivatedOverride(result.activated);
          void queryClient.invalidateQueries({ queryKey: ["offers", "saved"] });
          setFeedback("Предложение активировано. Покажите его при оплате у партнёра.");
        },
        onError: (mutationError) => setFeedback(getErrorMessage(mutationError)),
      },
    );
  };

  const removeSavedOffer = () => {
    setFeedback(null);
    deleteSavedOffer.mutate(
      { id: offer.id },
      {
        onSuccess: () => {
          setSavedOverride(false);
          setActivatedOverride(false);
          void queryClient.invalidateQueries({ queryKey: ["offers", "saved"] });
          void queryClient.invalidateQueries({ queryKey: [`/api/offers/${offer.id}`] });
          setFeedback("Предложение удалено из сохранённых.");
        },
        onError: (mutationError) => setFeedback(getErrorMessage(mutationError)),
      },
    );
  };

  const handleRemove = () => {
    if (!saved || deleteSavedOffer.isPending) return;
    if (activated) {
      Alert.alert(
        "Удалить активированное предложение?",
        "Предложение будет удалено из сохранённых, а его активация отменена.",
        [
          { text: "Оставить", style: "cancel" },
          { text: "Удалить", style: "destructive", onPress: removeSavedOffer },
        ],
      );
      return;
    }
    removeSavedOffer();
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Назад" testID="offer-back">
            <Ionicons name="arrow-back" size={20} color={colors.foreground} />
          </AnimatedPressable>
          <Text style={styles.headerTitle} numberOfLines={1}>Предложение</Text>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <PartnerLogo name={offer.partnerName} logoUrl={offer.partnerLogoUrl} size={48} />
            <Text style={styles.partnerName} numberOfLines={2}>{offer.partnerName}</Text>
            <Text style={styles.multiplier}>{offer.bonusMultiplier}×</Text>
          </View>
          <Text style={styles.title}>{offer.title}</Text>
          {offer.description ? <Text style={styles.description}>{offer.description}</Text> : null}
          <Text style={styles.category}>{CATEGORY_LABELS[offer.category] ?? offer.category}</Text>
          {activated || saved ? (
            <View style={styles.statusBadge}>
              <Ionicons
                name={activated ? "checkmark-circle" : "bookmark"}
                size={15}
                color={colors.categoryHealthAccent}
              />
              <Text style={styles.statusBadgeText}>
                {activated ? "Предложение активировано" : "Сохранено на потом"}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.facts}>
          <View style={styles.fact}>
            <View style={styles.factIcon}>
              <Ionicons name="wallet-outline" size={18} color={colors.accent} />
            </View>
            <View>
              <Text style={styles.factLabel}>Минимальная сумма</Text>
              <Text style={styles.factValue}>{offer.minAmountRub ? `от ${formatRub(offer.minAmountRub)}` : "Без ограничений"}</Text>
            </View>
          </View>
          <View style={styles.fact}>
            <View style={styles.factIcon}>
              <Ionicons name="calendar-outline" size={18} color={colors.accent} />
            </View>
            <View>
              <Text style={styles.factLabel}>Действует до</Text>
              <Text style={styles.factValue}>{formatDate(offer.expiresAt)} · ещё {daysLeft(offer.expiresAt)} дн.</Text>
            </View>
          </View>
        </View>

        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}

        <View style={styles.actions}>
          <AnimatedPressable
            style={[styles.primaryButton, (activated || activateOffer.isPending) && { opacity: 0.6 }]}
            onPress={handleActivate}
            disabled={activated || activateOffer.isPending}
            testID="offer-activate-button"
          >
            {activateOffer.isPending ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.primaryButtonText}>{activated ? "Предложение активировано" : "Активировать предложение"}</Text>
            )}
          </AnimatedPressable>
          {saved ? (
            <AnimatedPressable
              style={[styles.secondaryButton, deleteSavedOffer.isPending && { opacity: 0.6 }]}
              onPress={handleRemove}
              disabled={deleteSavedOffer.isPending}
              testID="offer-remove-saved-button"
              accessibilityLabel="Удалить из сохранённых"
            >
              {deleteSavedOffer.isPending ? (
                <ActivityIndicator color={colors.foreground} />
              ) : (
                <>
                  <Ionicons name="bookmark" size={18} color={colors.foreground} />
                  <Text style={[styles.secondaryButtonText, { marginLeft: 8 }]}>Удалить из сохранённых</Text>
                </>
              )}
            </AnimatedPressable>
          ) : (
            <AnimatedPressable
              style={[styles.secondaryButton, saveOffer.isPending && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saveOffer.isPending}
              testID="offer-save-button"
            >
              {saveOffer.isPending ? (
                <ActivityIndicator color={colors.foreground} />
              ) : (
                <>
                  <Ionicons name="bookmark-outline" size={18} color={colors.foreground} />
                  <Text style={[styles.secondaryButtonText, { marginLeft: 8 }]}>Сохранить на потом</Text>
                </>
              )}
            </AnimatedPressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}