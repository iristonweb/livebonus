import { Ionicons } from "@expo/vector-icons";
import {
  getListPassportSharesQueryKey,
  getGetScoreQueryKey,
  getGetScoreHistoryQueryKey,
  getListLeasesQueryKey,
  getListScoreDisputesQueryKey,
  useCreatePassportShare,
  useCreateDispute,
  useConfirmPayment,
  useRecordLatePayment,
  useGetScore,
  useGetScoreHistory,
  useListLeases,
  useListScoreDisputes,
  useListPassportShares,
  useRevokePassportShare,
} from "@workspace/api-client-react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Svg, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from "react-native-svg";
import Animated, { useAnimatedProps, useSharedValue, withTiming, Easing, FadeInDown } from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";
import { AnimatedPressable } from "@/components/AnimatedPressable";
import { AnimatedNumber } from "@/components/AnimatedNumber";

const TIER_LABELS: Record<string, string> = {
  premium: "Premium Tenant",
  high: "Надёжный",
  above_average: "Хороший",
  average: "Средний",
  below_average: "Начинающий",
};

const TIER_COLORS: Record<string, string> = {
  premium: "#3B82F6",
  high: "#06B6D4",
  above_average: "#8B5CF6",
  average: "#F59E0B",
  below_average: "#64748B",
};

const EVENT_ICONS: Record<string, string> = {
  phone_verified: "phone-portrait-outline",
  identity_verified: "id-card-outline",
  income_verified: "briefcase-outline",
  payment_on_time: "checkmark-circle-outline",
  payment_late: "alert-circle-outline",
  lease_started: "key-outline",
  lease_completed: "checkmark-done-outline",
  long_tenure: "time-outline",
  landlord_review: "star-outline",
  no_disputes: "shield-checkmark-outline",
  dispute_opened: "warning-outline",
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function ScoreRing({ score, colors, tierColor }: { score: number; colors: ReturnType<typeof useColors>; tierColor: string }) {
  const size = 280;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const arcLength = circumference * 0.75;
  const gapLength = circumference * 0.25;
  
  const animatedProgress = useSharedValue(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      animatedProgress.value = withTiming(score / 1000, {
        duration: 1500,
        easing: Easing.out(Easing.cubic),
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [score, animatedProgress]);

  const animatedProps = useAnimatedProps(() => {
    return {
      strokeDashoffset: circumference - (arcLength * animatedProgress.value),
    };
  });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: [{ rotate: "135deg" }] }}>
        <Defs>
          <SvgLinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={tierColor} stopOpacity="1" />
            <Stop offset="1" stopColor={tierColor} stopOpacity="0.3" />
          </SvgLinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${gapLength}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#grad)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeLinecap="round"
          fill="none"
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={{ position: "absolute", alignItems: "center" }}>
        <AnimatedNumber 
          value={score} 
          duration={1500} 
          style={{ fontSize: 64, fontWeight: "800", color: colors.foreground, letterSpacing: -3, fontVariant: ["tabular-nums"] }} 
        />
        <Text style={{ fontSize: 13, color: colors.mutedForeground, fontWeight: "600", letterSpacing: 2, textTransform: "uppercase", marginTop: 4 }}>
          Live Score
        </Text>
      </View>
    </View>
  );
}

function formatRub(n: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", minimumFractionDigits: 0 }).format(n);
}

export default function ScoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: score, isLoading, isError: scoreError, error: scoreFetchError, refetch: refetchScore } = useGetScore();
  const { data: history, isLoading: historyLoading, isError: historyError, refetch: refetchHistory } = useGetScoreHistory();
  const { data: leases } = useListLeases();
  const { data: disputes, isLoading: disputesLoading } = useListScoreDisputes();
  const { data: passportShares } = useListPassportShares();
  const confirmPayment = useConfirmPayment();
  const recordLatePayment = useRecordLatePayment();
  const createDispute = useCreateDispute();
  const createPassportShare = useCreatePassportShare();
  const revokePassportShare = useRevokePassportShare();
  const queryClient = useQueryClient();
  const [passportToken, setPassportToken] = useState<string | null>(null);
  const [passportAction, setPassportAction] = useState<"share" | "open" | null>(null);
  const [passportModalVisible, setPassportModalVisible] = useState(false);
  const [disputeModalVisible, setDisputeModalVisible] = useState(false);
  const [disputeText, setDisputeText] = useState("");
  const [actionLeaseId, setActionLeaseId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const activeShare = passportShares?.find((share) => share.status === "active");
    if (!activeShare || passportToken) return;
    void AsyncStorage.getItem(`live_passport_token_${activeShare.id}`).then((storedToken) => {
      if (storedToken) setPassportToken(storedToken);
    }).catch(() => {
      // The link can still be recreated if device storage is unavailable.
    });
  }, [passportShares, passportToken]);

  const tierColor = score ? (TIER_COLORS[score.tier] ?? colors.primary) : colors.primary;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    content: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 16,
      paddingHorizontal: 20,
      paddingBottom: Platform.OS === "web" ? 34 + 84 : 100,
    },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
    title: { fontSize: 28, fontWeight: "800", color: colors.foreground, letterSpacing: -1 },
    subtitle: { fontSize: 15, color: colors.mutedForeground, marginTop: 4, fontWeight: "500" },
    
    iconButton: {
      width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card,
      alignItems: "center", justifyContent: "center",
      borderWidth: 1, borderColor: colors.border
    },

    heroCard: { backgroundColor: colors.card, borderRadius: colors.radius * 1.5, padding: 24, marginBottom: 24, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
    tierBadge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 50, borderWidth: 1, marginTop: -20, marginBottom: 24, backgroundColor: colors.background },
    tierText: { fontSize: 14, fontWeight: "700" },
    
    leaseCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.background, borderRadius: colors.radius, padding: 16, width: "100%", borderWidth: 1, borderColor: colors.border },
    leaseIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", marginRight: 16, borderWidth: 1, borderColor: colors.border },
    leaseAddress: { fontSize: 15, fontWeight: "700", color: colors.foreground },
    leaseMeta: { fontSize: 13, color: colors.mutedForeground, marginTop: 4, fontWeight: "500" },
    
    verifyRow: { flexDirection: "row", gap: 10, marginTop: 24, flexWrap: "wrap", justifyContent: "center" },
    verifyChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 50, borderWidth: 1 },
    verifyText: { fontSize: 13, fontWeight: "600" },
    
    sectionTitle: { fontSize: 20, fontWeight: "700", color: colors.foreground, marginBottom: 16, letterSpacing: -0.5 },
    
    componentRow: { backgroundColor: colors.card, borderRadius: colors.radius, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
    componentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    componentName: { fontSize: 15, fontWeight: "700", color: colors.foreground },
    componentScore: { fontSize: 16, fontWeight: "800", color: colors.foreground },
    componentMax: { fontSize: 14, fontWeight: "500", color: colors.mutedForeground },
    progressTrack: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" },
    progressFill: { height: 6, borderRadius: 3 },
    componentDesc: { fontSize: 14, color: colors.mutedForeground, marginTop: 12, lineHeight: 20, fontWeight: "500" },
     breakdownCard: { backgroundColor: colors.card, borderRadius: colors.radius, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: colors.border },
     breakdownLabel: { fontSize: 12, color: colors.mutedForeground, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
     breakdownValue: { fontSize: 24, color: colors.foreground, fontWeight: "800", marginTop: 4 },
     breakdownNote: { fontSize: 12, color: colors.mutedForeground, lineHeight: 18, marginTop: 14, fontWeight: "500" },
    
    historyCard: { backgroundColor: colors.card, borderRadius: colors.radius, paddingHorizontal: 20, borderWidth: 1, borderColor: colors.border },
    eventRow: { flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    eventIconBox: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: 16, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
    eventDesc: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.foreground },
    eventDate: { fontSize: 13, color: colors.mutedForeground, marginTop: 4, fontWeight: "500" },
    eventDelta: { fontSize: 16, fontWeight: "700" },
    
    loading: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
    
    ctaCard: { backgroundColor: colors.foreground, borderRadius: colors.radius * 1.5, padding: 24, alignItems: "center", marginTop: 24 },
    ctaTitle: { fontSize: 20, fontWeight: "800", color: colors.background, marginBottom: 8, textAlign: "center", letterSpacing: -0.5 },
    ctaSubtitle: { fontSize: 14, color: colors.background, opacity: 0.8, textAlign: "center", marginBottom: 24, lineHeight: 20, fontWeight: "500" },
    ctaButton: { backgroundColor: colors.background, paddingHorizontal: 24, paddingVertical: 16, borderRadius: colors.radius, width: "100%", alignItems: "center" },
    ctaButtonText: { fontSize: 15, fontWeight: "700", color: colors.foreground },
    state: { alignItems: "center", paddingTop: 56, paddingHorizontal: 20 },
    stateTitle: { fontSize: 18, fontWeight: "800", color: colors.foreground, textAlign: "center" },
    stateText: { fontSize: 14, color: colors.mutedForeground, lineHeight: 20, textAlign: "center", marginTop: 8 },
    retryButton: { marginTop: 18, minHeight: 46, paddingHorizontal: 20, borderRadius: colors.radius, backgroundColor: colors.foreground, alignItems: "center", justifyContent: "center" },
    retryButtonText: { color: colors.background, fontSize: 14, fontWeight: "800" },
    inlineWarning: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, marginBottom: 16, borderRadius: 12, backgroundColor: colors.secondary },
    shareModalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
    shareModalCard: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === "web" ? 24 : insets.bottom + 20 },
    shareModalTitle: { fontSize: 20, fontWeight: "800", color: colors.foreground, marginBottom: 8 },
    shareModalText: { fontSize: 14, color: colors.mutedForeground, lineHeight: 20, marginBottom: 16 },
    shareOption: { minHeight: 50, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", marginTop: 10 },
    shareOptionText: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
    actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
    leaseAction: { flex: 1, minHeight: 42, paddingHorizontal: 10, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
    leaseActionText: { color: colors.foreground, fontSize: 12, fontWeight: "700", textAlign: "center" },
    disputeCard: { backgroundColor: colors.card, borderRadius: colors.radius, padding: 20, marginTop: 24, borderWidth: 1, borderColor: colors.border },
    textInput: { minHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.background, color: colors.foreground, padding: 12, textAlignVertical: "top", fontSize: 14 },
  });

  const publicPassportUrl = passportToken
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/passport/${passportToken}`
    : null;

  const requestPassport = (action: "share" | "open") => {
    if (!score) {
      Alert.alert("Профиль недоступен", "Ссылка на Live Passport появится после загрузки Live Score.");
      return;
    }
    setPassportAction(action);
    setPassportModalVisible(true);
  };

  const createAndRunPassportAction = async (expiresInDays: number) => {
    setPassportModalVisible(false);
    try {
      const share = await createPassportShare.mutateAsync({ data: { expiresInDays } });
      setPassportToken(share.token);
      await AsyncStorage.setItem(`live_passport_token_${share.id}`, share.token);
      await queryClient.invalidateQueries({ queryKey: getListPassportSharesQueryKey() });
      const url = `https://${process.env.EXPO_PUBLIC_DOMAIN}/passport/${share.token}`;
      if (passportAction === "share") {
        await Share.share({
          title: "Мой Live Passport",
          message: `Мой Live Score: ${score?.score ?? "—"}/1000\n${url}`,
          url,
        });
      } else {
        await Linking.openURL(url);
      }
    } catch (error) {
      const fallback = `Ссылка не создана. ${error instanceof Error ? error.message : "Проверьте подключение к интернету и попробуйте ещё раз."}`;
      Alert.alert("Live Passport недоступен", fallback);
    } finally {
      setPassportAction(null);
    }
  };

  const sharePassport = () => requestPassport("share");

  const openPassport = async () => {
    if (publicPassportUrl) {
      try {
        await Linking.openURL(publicPassportUrl);
      } catch {
        Alert.alert("Не удалось открыть Live Passport", "Откройте ссылку вручную:\n" + publicPassportUrl);
      }
      return;
    }
    requestPassport("open");
  };

  const revokePassport = async (shareId: number) => {
    try {
      await revokePassportShare.mutateAsync({ id: shareId });
      await AsyncStorage.removeItem(`live_passport_token_${shareId}`);
      setPassportToken(null);
      await queryClient.invalidateQueries({ queryKey: getListPassportSharesQueryKey() });
    } catch (error) {
      Alert.alert("Не удалось отозвать ссылку", error instanceof Error ? error.message : "Попробуйте ещё раз.");
    }
  };

  const invalidateScore = () => {
    void queryClient.invalidateQueries({ queryKey: getGetScoreQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetScoreHistoryQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListLeasesQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListScoreDisputesQueryKey() });
  };

  const recordPayment = async (leaseId: number, late: boolean) => {
    setActionLeaseId(leaseId);
    setActionError(null);
    try {
      if (late) await recordLatePayment.mutateAsync({ id: leaseId });
      else await confirmPayment.mutateAsync({ id: leaseId });
      invalidateScore();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : late ? "Не удалось записать просрочку." : "Не удалось записать оплату вовремя.");
    } finally {
      setActionLeaseId(null);
    }
  };

  const submitDispute = async () => {
    const leaseId = leases?.find((lease) => lease.isActive)?.id ?? leases?.[0]?.id;
    if (!leaseId || disputeText.trim().length < 10) return;
    setActionError(null);
    try {
      await createDispute.mutateAsync({ data: { reason: disputeText.trim(), leaseId } });
      setDisputeText("");
      setDisputeModalVisible(false);
      invalidateScore();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Не удалось зарегистрировать спор.");
    }
  };

  if (isLoading) {
    return <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  if (scoreError || !score) {
    return (
      <View style={styles.container}>
        <View style={styles.state}>
          <Ionicons name="speedometer-outline" size={40} color={colors.mutedForeground} />
          <Text style={[styles.stateTitle, { marginTop: 14 }]}>{scoreError ? "Live Score временно недоступен" : "Live Score пока не сформирован"}</Text>
          <Text style={styles.stateText}>
            {scoreFetchError instanceof Error ? scoreFetchError.message : "Для этого аккаунта ещё нет данных рейтинга."}
          </Text>
          <AnimatedPressable onPress={() => void refetchScore()} style={styles.retryButton} testID="score-retry">
            <Text style={styles.retryButtonText}>Повторить</Text>
          </AnimatedPressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.header}>
          <View>
            <Text style={styles.title}>Live Score</Text>
            <Text style={styles.subtitle}>Рейтинг доверия арендатора</Text>
          </View>
          <AnimatedPressable style={styles.iconButton} onPress={sharePassport} accessibilityLabel="Поделиться Live Passport" testID="score-share">
            <Ionicons name="share-outline" size={20} color={colors.foreground} />
          </AnimatedPressable>
        </Animated.View>

        <>
            {actionError && (
              <View style={styles.inlineWarning} testID="score-action-error">
                <Ionicons name="warning-outline" size={18} color={colors.destructive} />
                <Text style={[styles.stateText, { flex: 1, textAlign: "left", marginTop: 0 }]}>{actionError}</Text>
              </View>
            )}
            <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.heroCard}>
              <ScoreRing score={score.score} colors={colors} tierColor={tierColor} />

              <View style={[styles.tierBadge, { borderColor: tierColor + "40" }]}>
                <Text style={[styles.tierText, { color: tierColor }]}>{TIER_LABELS[score.tier] ?? "—"}</Text>
              </View>

              {score.activeLease && (
                <View style={styles.leaseCard}>
                  <View style={styles.leaseIcon}>
                    <Ionicons name="home-outline" size={20} color={colors.foreground} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.leaseAddress} numberOfLines={1}>{score.activeLease.address}</Text>
                    <Text style={styles.leaseMeta}>{formatRub(score.activeLease.monthlyRentRub)}/мес · {score.activeLease.onTimePayments} вовремя</Text>
                  </View>
                </View>
              )}
              {leases?.filter((lease) => lease.isActive).map((lease) => (
                <View key={lease.id} style={{ width: "100%" }}>
                  <View style={styles.actionRow}>
                    <AnimatedPressable style={styles.leaseAction} onPress={() => void recordPayment(lease.id, false)} disabled={actionLeaseId === lease.id}>
                      <Text style={styles.leaseActionText}>{actionLeaseId === lease.id ? "…" : "Оплата вовремя"}</Text>
                    </AnimatedPressable>
                    <AnimatedPressable style={styles.leaseAction} onPress={() => void recordPayment(lease.id, true)} disabled={actionLeaseId === lease.id}>
                      <Text style={[styles.leaseActionText, { color: colors.destructive }]}>Просрочка</Text>
                    </AnimatedPressable>
                  </View>
                </View>
              ))}

              <View style={styles.verifyRow}>
                {[
                  { label: "Телефон", achieved: score.isPhoneVerified },
                  { label: "Паспорт", achieved: score.isIdentityVerified },
                  { label: "Доход", achieved: score.isIncomeVerified },
                ].map((v, i) => (
                  <View key={v.label} style={[styles.verifyChip, v.achieved ? { borderColor: colors.accent + "40", backgroundColor: colors.accent + "10" } : { borderColor: colors.border, backgroundColor: colors.background }]}>
                    <Ionicons name={v.achieved ? "checkmark-circle" : "ellipse-outline"} size={16} color={v.achieved ? colors.accent : colors.mutedForeground} />
                    <Text style={[styles.verifyText, { color: v.achieved ? colors.accent : colors.mutedForeground }]}>{v.label}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(600).delay(250)} style={styles.breakdownCard}>
              <Text style={styles.sectionTitle}>Формула Live Score</Text>
              <Text style={styles.breakdownNote}>База остаётся отдельной составляющей. Итог = база + сумма вкладов категорий, ограниченная диапазоном 0–1000.</Text>
              <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.breakdownLabel}>База</Text>
                  <Text style={styles.breakdownValue}>{score.baseScore}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.breakdownLabel}>Категории</Text>
                  <Text style={[styles.breakdownValue, { color: score.categoryScore < 0 ? colors.destructive : colors.accent }]}>{score.categoryScore > 0 ? "+" : ""}{score.categoryScore}</Text>
                </View>
              </View>
              <Text style={styles.breakdownNote}>Версия расчёта: {score.scoreVersion}</Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(600).delay(300)}>
              <Text style={styles.sectionTitle}>Из чего складывается рейтинг</Text>
              {score.components.map((comp) => {
                const pct = Math.max(0, Math.min(100, Math.round(((comp.score - comp.minScore) / (comp.maxScore - comp.minScore)) * 100)));
                return (
                  <View key={comp.key} style={styles.componentRow}>
                    <View style={styles.componentHeader}>
                      <Text style={styles.componentName}>{comp.name}</Text>
                      <Text style={[styles.componentScore, comp.score < 0 ? { color: colors.destructive } : null]}>{comp.score} <Text style={styles.componentMax}>/ {comp.minScore}…{comp.maxScore}</Text></Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: colors.foreground }]} />
                    </View>
                    <Text style={styles.componentDesc}>{comp.description}</Text>
                    <Text style={styles.eventDate}>{comp.capDescription}{comp.capApplied ? " · применён" : ""}</Text>
                    {comp.events.slice(-3).map((event) => (
                      <View key={event.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
                        <Text style={[styles.eventDate, { flex: 1, marginTop: 0 }]} numberOfLines={1}>{event.description}</Text>
                        <Text style={[styles.eventDate, { marginTop: 0, fontWeight: "800", color: event.scoreChange < 0 ? colors.destructive : colors.accent }]}>{event.scoreChange > 0 ? "+" : ""}{event.scoreChange}</Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </Animated.View>

            {historyError ? (
              <View style={styles.inlineWarning} testID="score-history-error">
                <Ionicons name="warning-outline" size={18} color={colors.destructive} />
                <Text style={[styles.stateText, { flex: 1, textAlign: "left", marginTop: 0 }]}>История изменений недоступна.</Text>
                <AnimatedPressable onPress={() => void refetchHistory()} accessibilityLabel="Повторить загрузку истории">
                  <Ionicons name="refresh" size={20} color={colors.accent} />
                </AnimatedPressable>
              </View>
            ) : historyLoading ? (
              <ActivityIndicator color={colors.accent} />
            ) : history && history.length > 0 ? (
              <Animated.View entering={FadeInDown.duration(600).delay(400)}>
                <Text style={[styles.sectionTitle, { marginTop: 12 }]}>История изменений</Text>
                <View style={styles.historyCard}>
                  {history.slice(0, 8).map((event, idx) => {
                    const iconName = EVENT_ICONS[event.eventType] ?? "ellipse-outline";
                    const isPos = event.scoreChange > 0;
                    return (
                      <View key={event.id} style={[styles.eventRow, idx === Math.min(7, history.length - 1) ? { borderBottomWidth: 0 } : {}]}>
                        <View style={styles.eventIconBox}>
                          <Ionicons name={iconName as any} size={18} color={isPos ? colors.accent : colors.foreground} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.eventDesc} numberOfLines={1}>{event.description}</Text>
                        </View>
                        <Text style={[styles.eventDelta, { color: isPos ? colors.accent : colors.foreground }]}>
                          {isPos ? "+" : ""}{event.scoreChange}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Animated.View>
            ) : (
              <View style={styles.inlineWarning} testID="score-history-empty">
                <Ionicons name="information-circle-outline" size={18} color={colors.mutedForeground} />
                <Text style={[styles.stateText, { flex: 1, textAlign: "left", marginTop: 0 }]}>Изменений рейтинга пока нет.</Text>
              </View>
            )}

            <Animated.View entering={FadeInDown.duration(600).delay(450)} style={styles.disputeCard}>
              <Text style={styles.sectionTitle}>Оспорить изменение</Text>
              <Text style={styles.componentDesc}>Спор привязывается к действующей аренде и сначала получает статус «создан».</Text>
              <AnimatedPressable style={[styles.leaseAction, { marginTop: 14, minHeight: 46 }]} onPress={() => setDisputeModalVisible(true)} disabled={!leases?.length}>
                <Text style={styles.leaseActionText}>Зарегистрировать спор</Text>
              </AnimatedPressable>
              {!disputesLoading && disputes?.map((dispute) => (
                <View key={dispute.id} style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Text style={styles.eventDesc}>Спор по аренде #{dispute.leaseId}</Text>
                    <Text style={[styles.eventDate, { color: colors.accent }]}>{dispute.status === "created" ? "Создан" : dispute.status === "under_review" ? "На рассмотрении" : dispute.status === "resolved" ? "Одобрен" : "Отклонён"}</Text>
                  </View>
                  {dispute.resolutionReason && <Text style={styles.eventDate}>{dispute.resolutionReason}</Text>}
                </View>
              ))}
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(600).delay(500)} style={styles.ctaCard}>
              <Text style={styles.ctaTitle}>Live Passport</Text>
              <Text style={styles.ctaSubtitle}>Поделитесь цифровым профилем с арендодателем. Ссылка создаётся для текущего аккаунта и имеет срок действия.</Text>
              <AnimatedPressable style={styles.ctaButton} onPress={openPassport} testID="live-passport-button">
                <Text style={styles.ctaButtonText}>Открыть профиль</Text>
              </AnimatedPressable>
              <AnimatedPressable style={[styles.ctaButton, { marginTop: 10 }]} onPress={sharePassport} testID="live-passport-share">
                <Text style={styles.ctaButtonText}>Поделиться ссылкой</Text>
              </AnimatedPressable>
              {passportShares?.map((share) => (
                <View key={share.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
                  <Text style={[styles.ctaSubtitle, { flex: 1, marginBottom: 0, textAlign: "left", fontSize: 12 }]}>
                    {share.status === "active" ? "Активна" : share.status === "revoked" ? "Отозвана" : "Истекла"} · до {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(share.expiresAt))}
                  </Text>
                  {share.status === "active" && <AnimatedPressable onPress={() => void revokePassport(share.id)} disabled={revokePassportShare.isPending}>
                    <Text style={{ color: "#FCA5A5", fontWeight: "700", fontSize: 12 }}>Отозвать</Text>
                  </AnimatedPressable>}
                </View>
              ))}
            </Animated.View>
        </>
      </ScrollView>
      <Modal visible={passportModalVisible} transparent animationType="slide" onRequestClose={() => setPassportModalVisible(false)}>
        <View style={styles.shareModalBackdrop}>
          <View style={styles.shareModalCard}>
            <Text style={styles.shareModalTitle}>Срок действия ссылки</Text>
            <Text style={styles.shareModalText}>Выберите срок. Ссылку можно отозвать в любой момент.</Text>
            {[1, 7, 30].map((days) => (
              <AnimatedPressable key={days} style={styles.shareOption} onPress={() => void createAndRunPassportAction(days)} disabled={createPassportShare.isPending}>
                <Text style={styles.shareOptionText}>{days === 1 ? "1 день" : `${days} дней`}</Text>
              </AnimatedPressable>
            ))}
            <AnimatedPressable style={[styles.shareOption, { borderColor: "transparent" }]} onPress={() => setPassportModalVisible(false)}>
              <Text style={[styles.shareOptionText, { color: colors.mutedForeground }]}>Отмена</Text>
            </AnimatedPressable>
          </View>
        </View>
      </Modal>
      <Modal visible={disputeModalVisible} transparent animationType="slide" onRequestClose={() => setDisputeModalVisible(false)}>
        <View style={styles.shareModalBackdrop}>
          <View style={styles.shareModalCard}>
            <Text style={styles.shareModalTitle}>Зарегистрировать спор</Text>
            <Text style={styles.shareModalText}>Опишите ошибку подробно — минимум 10 символов.</Text>
            <TextInput
              value={disputeText}
              onChangeText={setDisputeText}
              placeholder="Что произошло?"
              placeholderTextColor={colors.mutedForeground}
              style={styles.textInput}
              multiline
              accessibilityLabel="Причина спора"
            />
            <AnimatedPressable style={[styles.shareOption, { backgroundColor: colors.foreground }]} onPress={() => void submitDispute()} disabled={createDispute.isPending || disputeText.trim().length < 10}>
              <Text style={[styles.shareOptionText, { color: colors.background }]}>{createDispute.isPending ? "Отправляем…" : "Отправить"}</Text>
            </AnimatedPressable>
            <AnimatedPressable style={[styles.shareOption, { borderColor: "transparent" }]} onPress={() => setDisputeModalVisible(false)}>
              <Text style={[styles.shareOptionText, { color: colors.mutedForeground }]}>Отмена</Text>
            </AnimatedPressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}