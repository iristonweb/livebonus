import { Ionicons } from "@expo/vector-icons";
import {
  useGetDashboardSummary,
  useGetDashboardActivity,
  useListOffers,
  useListPartners,
  useListLeases,
  useQuoteRentalDeal,
} from "@workspace/api-client-react";
import { useEffect } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";
import { BrandMark } from "@/components/BrandMark";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { AnimatedPressable } from "@/components/AnimatedPressable";
import { PartnerLogo } from "@/components/PartnerLogo";
import { isAuthError } from "@/lib/financeUi";

const STATUS_LABELS: Record<string, string> = { novice: "Новичок", silver: "Серебро", gold: "Золото", platinum: "Платина" };
const CATEGORY_LABELS: Record<string, string> = { rent: "Аренда", utilities: "ЖКХ", transport: "Транспорт", health: "Здоровье", food: "Еда", other: "Прочее" };

function getCategoryBg(category: string, colors: ReturnType<typeof useColors>): string {
  const map: Record<string, string> = {
    rent: colors.categoryRentBg,
    utilities: colors.categoryUtilitiesBg,
    transport: colors.categoryTransportBg,
    health: colors.categoryHealthBg,
    food: colors.categoryFoodBg,
    other: colors.categoryOtherBg,
  };
  return map[category] ?? colors.card;
}

function getCategoryAccent(category: string, colors: ReturnType<typeof useColors>): string {
  const map: Record<string, string> = {
    rent: colors.categoryRentAccent,
    utilities: colors.categoryUtilitiesAccent,
    transport: colors.categoryTransportAccent,
    health: colors.categoryHealthAccent,
    food: colors.categoryFoodAccent,
    other: colors.categoryOtherAccent,
  };
  return map[category] ?? colors.primary;
}

function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", minimumFractionDigits: 0 }).format(n);
}

function formatDateShort(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(iso));
}

function daysUntilNextPayment(startDateIso: string): number {
  const start = new Date(startDateIso);
  const now = new Date();
  const dayOfMonth = start.getDate();
  const nextDue = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
  if (nextDue <= now) nextDue.setMonth(nextDue.getMonth() + 1);
  return Math.max(1, Math.ceil((nextDue.getTime() - now.getTime()) / 86400000));
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const router = useRouter();
  const isDark = colorScheme === "dark";

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryIsError,
    error: summaryError,
  } = useGetDashboardSummary();
  const { data: activity } = useGetDashboardActivity({ limit: 4 });
  const { data: offers } = useListOffers();
  const { data: partners } = useListPartners();
  const { data: leases, isLoading: leasesLoading, isError: leasesIsError } = useListLeases();
  const rentalQuote = useQuoteRentalDeal();

  const activeLease = leases?.find(l => l.isActive);
  const promoOffer = offers?.[0];
  const topPartners = partners?.slice(0, 3) ?? [];
  const progressPct = summary
    ? summary.pointsToNextStatus
      ? Math.min(100, Math.round((summary.pointsBalance / (summary.pointsBalance + summary.pointsToNextStatus)) * 100))
      : 100
    : 0;

  const daysUntilPay = activeLease ? daysUntilNextPayment(activeLease.startDate) : null;
  useEffect(() => {
    if (activeLease) {
      rentalQuote.mutate({ data: { grossAmountRub: activeLease.monthlyRentRub } });
    }
  }, [activeLease?.id, activeLease?.monthlyRentRub]);

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    content: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top,
      paddingBottom: Platform.OS === "web" ? 118 : insets.bottom + 116,
    },
    header: { 
      flexDirection: "row", 
      alignItems: "center", 
      justifyContent: "space-between", 
      paddingHorizontal: 20, 
      paddingVertical: 16 
    },
    logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    appName: { fontSize: 20, fontWeight: "700", color: colors.foreground, letterSpacing: -0.5 },
    
    iconButton: {
      width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card,
      alignItems: "center", justifyContent: "center",
      borderWidth: 1, borderColor: colors.border
    },

    balanceWrapper: { marginHorizontal: 16, marginBottom: 24, borderRadius: colors.radius * 1.5, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
    balanceCard: { 
      borderRadius: colors.radius * 1.5, 
      padding: 24, 
      borderWidth: 1,
      borderColor: isDark ? colors.border : 'rgba(255,255,255,0.1)',
      overflow: 'hidden'
    },
    balanceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
    balanceLabel: { fontSize: 12, fontWeight: "600", color: "#F8FAFC", opacity: 0.7, letterSpacing: 1.5, textTransform: "uppercase" },
    statusPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 50, backgroundColor: "rgba(255,255,255,0.1)" },
    statusText: { fontSize: 12, fontWeight: "600", color: "#FFFFFF" },
    
    balanceNumberRow: { flexDirection: "row", alignItems: "baseline", marginBottom: 4 },
    balanceNumber: { fontSize: 44, fontWeight: "800", color: "#FFFFFF", letterSpacing: -2, fontVariant: ["tabular-nums"] },
    balanceUnit: { fontSize: 22, fontWeight: "600", color: "#FFFFFF", opacity: 0.7 },
    rubEquiv: { fontSize: 14, color: "#FFFFFF", opacity: 0.7, marginBottom: 32, fontWeight: "500" },
     balanceUnavailable: { fontSize: 18, color: "#FFFFFF", fontWeight: "700", marginBottom: 8 },
     balanceError: { fontSize: 13, color: "#FCA5A5", marginBottom: 24, lineHeight: 18 },
    
    progressContainer: { backgroundColor: "rgba(0,0,0,0.2)", borderRadius: 12, padding: 12 },
    progressHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
    progressLabel: { fontSize: 12, color: "#FFFFFF", opacity: 0.8, fontWeight: "500" },
    progressValue: { fontSize: 12, color: "#FFFFFF", fontWeight: "600" },
    progressTrack: { height: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 2, overflow: "hidden" },
    progressFill: { height: 4, backgroundColor: "#FFFFFF", borderRadius: 2 },

    promoBanner: { 
      marginHorizontal: 16, 
      marginBottom: 24, 
      backgroundColor: colors.card, 
      borderRadius: colors.radius, 
      padding: 16, 
      flexDirection: "row", 
      alignItems: "center", 
      justifyContent: "space-between",
      borderWidth: 1, borderColor: colors.border
    },
    promoLeft: { flex: 1 },
    promoTitle: { fontSize: 15, fontWeight: "600", color: colors.foreground, marginBottom: 4 },
    promoSubtitle: { fontSize: 13, color: colors.mutedForeground },
    promoIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center", marginLeft: 16 },

    paymentCard: { 
      marginHorizontal: 16, 
      marginBottom: 32, 
      backgroundColor: colors.card, 
      borderRadius: colors.radius, 
      padding: 20, 
      borderWidth: 1, 
      borderColor: colors.border 
    },
    paymentTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    paymentTitle: { fontSize: 13, fontWeight: "600", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 1 },
    daysBadge: { backgroundColor: colors.accent + "15", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 50 },
    daysText: { fontSize: 12, fontWeight: "700", color: colors.accent },
    paymentAmount: { fontSize: 32, fontWeight: "800", color: colors.foreground, letterSpacing: -1, marginBottom: 4 },
    paymentAddress: { fontSize: 14, color: colors.mutedForeground, marginBottom: 6, fontWeight: "500", lineHeight: 20 },
    paymentBonus: { fontSize: 14, fontWeight: "600", color: colors.accent, marginBottom: 24 },
     paymentSecondary: { fontSize: 13, color: colors.mutedForeground, lineHeight: 19, marginBottom: 20 },
     paymentError: { fontSize: 13, color: colors.destructive, lineHeight: 18, marginBottom: 16 },
     paymentLoading: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 },
    payButton: { backgroundColor: colors.foreground, borderRadius: colors.radius, paddingVertical: 14, alignItems: "center" },
    payButtonText: { fontSize: 15, fontWeight: "700", color: colors.background },
     rulesLink: { alignSelf: "flex-start", marginTop: 12, paddingVertical: 4 },
     rulesLinkText: { fontSize: 13, fontWeight: "700", color: colors.accent },

    sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 16 },
    sectionTitle: { fontSize: 20, fontWeight: "700", color: colors.foreground, letterSpacing: -0.5 },
    seeAll: { fontSize: 14, fontWeight: "600", color: colors.mutedForeground },
    partnersRow: { flexDirection: "row", paddingHorizontal: 16, gap: 12, marginBottom: 32 },
    partnerCard: { flex: 1, borderRadius: colors.radius, padding: 16, minHeight: 130, justifyContent: "space-between" },
    partnerCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    partnerMult: { fontSize: 18, fontWeight: "800", letterSpacing: -0.5 },
    partnerName: { fontSize: 15, fontWeight: "700", color: colors.foreground, marginTop: 12 },
    partnerBonusLabel: { fontSize: 12, color: colors.mutedForeground, marginTop: 2, fontWeight: "500" },

    activityContainer: { marginHorizontal: 16, marginBottom: 24 },
    activityRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    activityIconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", marginRight: 14, borderWidth: 1, borderColor: colors.border },
    activityDesc: { flex: 1, fontSize: 15, color: colors.foreground, fontWeight: "600" },
    activityMeta: { fontSize: 13, color: colors.mutedForeground, marginTop: 4, fontWeight: "500" },
    activityPoints: { fontSize: 16, fontWeight: "700" },
  });

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.header}>
          <View style={styles.logoRow}>
            <BrandMark size={28} color={colors.foreground} />
            <Text style={styles.appName}>ЛоялТи</Text>
          </View>
          <AnimatedPressable style={styles.iconButton}>
            <Ionicons name="notifications-outline" size={20} color={colors.foreground} />
          </AnimatedPressable>
        </Animated.View>

        {/* Balance Card */}
        <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.balanceWrapper}>
          <AnimatedPressable>
            <LinearGradient
              colors={isDark ? ['#1E293B', '#0F172A'] : ['#0F172A', '#020617']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.balanceCard}
            >
              <View style={styles.balanceTop}>
                <Text style={styles.balanceLabel}>Мой баланс</Text>
                {summary && (
                  <View style={styles.statusPill}>
                    <Text style={styles.statusText}>
                      {STATUS_LABELS[summary.status] ?? summary.status}
                    </Text>
                  </View>
                )}
              </View>
              {summaryLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : summaryIsError || !summary ? (
                <>
                  <Text style={styles.balanceUnavailable}>Баланс недоступен</Text>
                  <Text style={styles.balanceError}>
                    {isAuthError(summaryError)
                      ? "Войдите в аккаунт, чтобы увидеть личный финансовый баланс."
                      : "Не удалось загрузить финансовые данные. Попробуйте ещё раз позже."}
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.balanceNumberRow}>
                    <AnimatedNumber
                      value={summary.pointsBalance}
                      style={styles.balanceNumber}
                      formatter={(v) => new Intl.NumberFormat("ru-RU").format(v)}
                    />
                    <Text style={styles.balanceUnit}> б.</Text>
                  </View>
                  <Text style={styles.rubEquiv}>
                    ≈ {summary.bonusBalanceRub === undefined ? "—" : formatRub(summary.bonusBalanceRub)}
                  </Text>

                  <View style={styles.progressContainer}>
                    <View style={styles.progressHeader}>
                      <Text style={styles.progressLabel}>
                        {summary.nextStatus ? `До статуса «${STATUS_LABELS[summary.nextStatus]}»` : "Максимальный статус"}
                      </Text>
                      <Text style={styles.progressValue}>
                        {summary.pointsToNextStatus
                          ? `${new Intl.NumberFormat("ru-RU").format(summary.pointsToNextStatus)} б.`
                          : ""}
                      </Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
                    </View>
                  </View>
                </>
              )}
            </LinearGradient>
          </AnimatedPressable>
        </Animated.View>

        {/* Promo Banner */}
        {promoOffer && (
          <Animated.View entering={FadeInDown.duration(600).delay(300)}>
            <AnimatedPressable
              style={styles.promoBanner}
              onPress={() => router.push(`/offer/${promoOffer.id}`)}
              testID="home-promo-offer"
            >
              <View style={styles.promoLeft}>
                <Text style={styles.promoTitle}>{promoOffer.title}</Text>
                <Text style={styles.promoSubtitle} numberOfLines={1}>
                  Осталось {Math.max(0, Math.ceil((new Date(promoOffer.expiresAt).getTime() - Date.now()) / 86400000))} дней · {promoOffer.bonusMultiplier}× баллов
                </Text>
              </View>
              <View style={styles.promoIcon}>
                <Ionicons name="pricetag-outline" size={20} color={colors.foreground} />
              </View>
            </AnimatedPressable>
          </Animated.View>
        )}

        {/* Next Payment Card */}
        <Animated.View entering={FadeInDown.duration(600).delay(400)} style={styles.paymentCard}>
          <View style={styles.paymentTop}>
            <Text style={styles.paymentTitle}>Ближайший платеж</Text>
            {daysUntilPay !== null && (
              <View style={styles.daysBadge}>
                <Text style={styles.daysText}>через {daysUntilPay} дн.</Text>
              </View>
            )}
          </View>
          {leasesLoading ? (
            <View style={styles.paymentLoading}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.paymentAddress}>Загрузка договора аренды…</Text>
            </View>
          ) : leasesIsError ? (
            <Text style={styles.paymentError}>Не удалось загрузить договор аренды. Расчёт недоступен.</Text>
          ) : activeLease ? (
            <>
              <Text style={styles.paymentAmount}>{formatRub(activeLease.monthlyRentRub)}</Text>
              <Text style={styles.paymentAddress} numberOfLines={2}>{activeLease.address}</Text>
              {rentalQuote.isPending ? (
                <View style={styles.paymentLoading}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.paymentAddress}>Получаем расчёт бонуса…</Text>
                </View>
              ) : rentalQuote.isError ? (
                <Text style={styles.paymentError}>
                  {isAuthError(rentalQuote.error)
                    ? "Войдите в аккаунт, чтобы получить авторитетный расчёт."
                    : "Не удалось получить авторитетный расчёт бонуса."}
                </Text>
              ) : rentalQuote.data?.valid ? (
                <>
                  <Text style={styles.paymentBonus}>
                    +{formatRub(rentalQuote.data.tenantBonusRub)} бонуса арендатору
                  </Text>
                  <Text style={styles.paymentSecondary}>
                    Арендодатель получает ещё {formatRub(rentalQuote.data.landlordBonusRub)}. Комиссия арендодателя — {formatRub(rentalQuote.data.landlordFeeRub)} от сделки.
                  </Text>
                </>
              ) : (
                <Text style={styles.paymentError}>Расчёт бонуса недействителен: проверьте сумму сделки.</Text>
              )}
            </>
          ) : (
            <>
              <Text style={styles.paymentAmount}>—</Text>
              <Text style={styles.paymentAddress}>Нет активного договора аренды</Text>
              <Text style={styles.paymentSecondary}>После появления активного договора здесь будет предварительный расчёт бонуса.</Text>
            </>
          )}
          <AnimatedPressable
            style={[styles.payButton, (!activeLease || rentalQuote.isPending) && { opacity: 0.5 }]}
            onPress={() => router.push({ pathname: "/payment" as never, params: { mode: "rental" } })}
            disabled={!activeLease || rentalQuote.isPending}
            testID="home-rental-payment"
          >
            <Text style={styles.payButtonText}>Оплатить сейчас</Text>
          </AnimatedPressable>
          <AnimatedPressable style={styles.rulesLink} onPress={() => router.push("/rules")}>
            <Text style={styles.rulesLinkText}>Как рассчитываются бонусы →</Text>
          </AnimatedPressable>
        </Animated.View>

        {/* Popular Partners */}
        {topPartners.length > 0 && (
          <Animated.View entering={FadeInDown.duration(600).delay(500)}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Партнёры</Text>
              <AnimatedPressable onPress={() => router.push("/partners")}>
                <Text style={styles.seeAll}>Все</Text>
              </AnimatedPressable>
            </View>
            <View style={styles.partnersRow}>
              {topPartners.map((partner) => {
                const bg = getCategoryBg(partner.category, colors);
                const accent = getCategoryAccent(partner.category, colors);
                return (
                  <AnimatedPressable key={partner.id} style={[styles.partnerCard, { backgroundColor: bg }]}>
                    <View style={styles.partnerCardTop}>
                      <PartnerLogo name={partner.name} logoUrl={partner.logoUrl} size={36} />
                      <Text style={[styles.partnerMult, { color: accent }]}>{partner.bonusMultiplier}×</Text>
                    </View>
                    <View>
                      <Text style={styles.partnerName} numberOfLines={1}>{partner.name}</Text>
                      <Text style={styles.partnerBonusLabel}>{CATEGORY_LABELS[partner.category] ?? partner.category}</Text>
                    </View>
                  </AnimatedPressable>
                );
              })}
            </View>
          </Animated.View>
        )}

        {/* Recent Activity */}
        {activity && activity.length > 0 && (
          <Animated.View entering={FadeInDown.duration(600).delay(600)} style={styles.activityContainer}>
            <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>История</Text>
            {activity.slice(0, 4).map((item, idx) => {
              const isPos = item.pointsDelta >= 0;
              return (
                <View key={item.id} style={[styles.activityRow, idx === Math.min(3, activity.length - 1) ? { borderBottomWidth: 0 } : {}]}>
                  <View style={styles.activityIconBox}>
                    <Ionicons name={isPos ? "arrow-down" : "arrow-up"} size={16} color={isPos ? colors.accent : colors.foreground} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityDesc} numberOfLines={1}>{item.description}</Text>
                    <Text style={styles.activityMeta}>{formatDateShort(item.createdAt)}</Text>
                  </View>
                  <Text style={[styles.activityPoints, { color: isPos ? colors.accent : colors.foreground }]}>
                    {isPos ? "+" : ""}{new Intl.NumberFormat("ru-RU").format(item.pointsDelta)}
                  </Text>
                </View>
              );
            })}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}