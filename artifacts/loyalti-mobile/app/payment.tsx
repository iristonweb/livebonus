import { Ionicons } from "@expo/vector-icons";
import {
  useCreatePurchaseCheckout,
  useCreateRentalCheckout,
  useGetRentalPaymentStatus,
  useGetPurchasePaymentStatus,
  useListLeases,
  useListPartners,
} from "@workspace/api-client-react";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AppState,
  type AppStateStatus,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedPressable } from "@/components/AnimatedPressable";
import AuthScreen from "@/components/AuthScreen";
import { PartnerLogo } from "@/components/PartnerLogo";
import { isAuthError } from "@/lib/financeUi";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

type PaymentMode = "rental" | "partner";
type PaymentMethod = "sbp" | "mir_pay";

function formatRub(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function parseAmount(value: string): number | null {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!normalized || !/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (isAuthError(error)) return "Войдите в аккаунт, чтобы открыть оплату.";
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (typeof data === "object" && data !== null && "error" in data) {
      const message = (data as { error?: unknown }).error;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  return fallback;
}

function getApiErrorDeal(error: unknown): { id: number; paymentFailureReason?: string | null } | null {
  if (typeof error !== "object" || error === null || !("data" in error)) return null;
  const data = (error as { data?: unknown }).data;
  if (typeof data !== "object" || data === null || !("deal" in data)) return null;
  const deal = (data as { deal?: unknown }).deal;
  if (typeof deal !== "object" || deal === null || !("id" in deal)) return null;
  const id = (deal as { id?: unknown }).id;
  if (typeof id !== "number" || !Number.isInteger(id) || id < 1) return null;
  return {
    id,
    paymentFailureReason: "paymentFailureReason" in deal
      ? (deal as { paymentFailureReason?: string | null }).paymentFailureReason
      : null,
  };
}

function paymentResultCopy(
  status: string | undefined,
  message: string | null | undefined,
): {
  title: string;
  body: string;
  tone: "success" | "pending" | "canceled" | "failed";
  action: string;
} {
  switch (status) {
    case "succeeded":
    case "settled":
      return {
        title: "Оплата подтверждена",
        body: "Платёж проверен YooKassa, а операция проведена сервером.",
        tone: "success",
        action: "Готово",
      };
    case "canceled":
    case "cancelled":
      return {
        title: "Оплата отменена",
        body: "Провайдер не подтвердил оплату. Бонусный баланс не изменён.",
        tone: "canceled",
        action: "Попробовать снова",
      };
    case "failed":
    case "payment_failed":
      return {
        title: "Оплата не прошла",
        body: message ?? "Провайдер отклонил оплату. Бонусный баланс не изменён.",
        tone: "failed",
        action: "Попробовать снова",
      };
    case "waiting_for_capture":
      return {
        title: "Платёж обрабатывается",
        body: "YooKassa ещё подтверждает платёж. Мы проверим результат автоматически.",
        tone: "pending",
        action: "Проверить ещё раз",
      };
    default:
      return {
        title: "Платёж ожидает подтверждения",
        body: "YooKassa ещё обрабатывает платёж. Мы проверим результат автоматически.",
        tone: "pending",
        action: "Проверить ещё раз",
      };
  }
}

function paymentIdFromParams(params: {
  paymentId?: string | string[];
  checkoutId?: string | string[];
  payment?: string | string[];
}): number | null {
  const rawValue = params.paymentId ?? params.checkoutId ?? params.payment;
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  const id = value ? Number(value) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function positiveIntegerParam(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default function PaymentScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { status: authStatus } = useAuth();
  const params = useLocalSearchParams<{
    mode?: string | string[];
    partnerId?: string | string[];
    paymentId?: string | string[];
    checkoutId?: string | string[];
    payment?: string | string[];
  }>();
  const rawMode = firstParam(params.mode);
  const mode: PaymentMode | null = rawMode === "partner" || rawMode === "rental" ? rawMode : null;
  const rawPartnerId = firstParam(params.partnerId);
  const parsedPartnerId = rawPartnerId === undefined ? null : positiveIntegerParam(rawPartnerId);
  const paymentParam = params.paymentId ?? params.checkoutId ?? params.payment;
  const rawPaymentId = firstParam(paymentParam);
  const parsedPaymentId = rawPaymentId === undefined ? null : positiveIntegerParam(rawPaymentId);
  const paramError = rawMode === undefined
    ? "Не указан режим оплаты. Откройте оплату из раздела аренды или партнёров."
    : mode === null
      ? "Некорректный режим оплаты. Допустимы только rental или partner."
      : rawPartnerId !== undefined && parsedPartnerId === null
        ? "Некорректный идентификатор партнёра."
        : rawPaymentId !== undefined && parsedPaymentId === null
          ? "Некорректный идентификатор платежа."
          : null;
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("sbp");
  const [amountText, setAmountText] = useState("");
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(
    parsedPartnerId,
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [checkoutId, setCheckoutId] = useState<number | null>(() => parsedPaymentId ?? paymentIdFromParams(params));
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [isAppActive, setIsAppActive] = useState(() => AppState.currentState === "active");
  const wasAppActive = useRef(isAppActive);

  const { data: leases, isLoading: leasesLoading, isError: leasesError, refetch: refetchLeases } = useListLeases({
    query: { queryKey: ["/api/leases"], enabled: authStatus === "authenticated" },
  });
  const { data: partners, isLoading: partnersLoading, isError: partnersError, refetch: refetchPartners } = useListPartners(undefined, {
    query: { queryKey: ["/api/partners"], enabled: authStatus === "authenticated" },
  });
  const rentalCheckout = useCreateRentalCheckout();
  const purchaseCheckout = useCreatePurchaseCheckout();
  const activeLease = leases?.find((lease) => lease.isActive);
  const selectedPartner = partners?.find((partner) => partner.id === selectedPartnerId);
  const purchaseStatus = useGetPurchasePaymentStatus(checkoutId ?? 0, {
    query: {
      queryKey: ["purchase-payment-status", checkoutId],
      enabled: authStatus === "authenticated"
        && mode === "partner"
        && checkoutId !== null
        && isAppActive,
        refetchOnMount: "always",
        refetchInterval: (query: { state: { data?: { paymentStatus?: string } } }) => {
          if (!isAppActive) return false;
          const status = query.state.data?.paymentStatus;
          return status === "pending" || status === "waiting_for_capture" ? 2500 : false;
        },
    },
  });
  const rentalStatus = useGetRentalPaymentStatus(checkoutId ?? 0, {
    query: {
      queryKey: ["rental-payment-status", checkoutId],
      enabled: authStatus === "authenticated"
        && mode === "rental"
        && checkoutId !== null
        && isAppActive,
      refetchOnMount: "always",
      refetchInterval: (query: { state: { data?: { paymentStatus?: string } } }) => {
        if (!isAppActive) return false;
        const status = query.state.data?.paymentStatus;
        return status === "pending" || status === "waiting_for_capture" ? 2500 : false;
      },
    },
  });
  const currentStatus = mode === "partner" ? purchaseStatus.data : rentalStatus.data;
  const statusLoading = mode === "partner" ? purchaseStatus.isLoading : rentalStatus.isLoading;
  const statusFetching = mode === "partner" ? purchaseStatus.isFetching : rentalStatus.isFetching;
  const statusError = mode === "partner" ? purchaseStatus.isError : rentalStatus.isError;
  const refetchStatus = mode === "partner" ? purchaseStatus.refetch : rentalStatus.refetch;
  const isSubmitting = rentalCheckout.isPending || purchaseCheckout.isPending;

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      setIsAppActive(nextState === "active");
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (isAppActive && !wasAppActive.current && checkoutId !== null && authStatus === "authenticated") {
      void queryClient.refetchQueries({
        queryKey: [mode === "partner" ? "purchase-payment-status" : "rental-payment-status", checkoutId],
        exact: true,
      });
    }
    wasAppActive.current = isAppActive;
  }, [authStatus, checkoutId, isAppActive, mode, queryClient]);

  useEffect(() => {
    if (mode === "rental" && activeLease && !amountText) {
      setAmountText(String(activeLease.monthlyRentRub));
    }
  }, [activeLease, amountText, mode]);

  useEffect(() => {
    if (currentStatus?.message) setCheckoutMessage(currentStatus.message);
    if (currentStatus?.deal.providerCheckoutUrl) {
      setCheckoutUrl(currentStatus.deal.providerCheckoutUrl);
    }
  }, [currentStatus?.deal.providerCheckoutUrl, currentStatus?.message]);

  const bottomPadding = Platform.OS === "web" ? 118 : insets.bottom + 32;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        content: {
          paddingTop: Platform.OS === "web" ? 67 : insets.top + 12,
          paddingBottom: bottomPadding,
          paddingHorizontal: 20,
        },
        topBar: {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginBottom: 26,
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
        title: { flex: 1, fontSize: 27, fontWeight: "800", color: colors.foreground, letterSpacing: -1 },
        subtitle: { fontSize: 14, color: colors.mutedForeground, lineHeight: 20, marginBottom: 20 },
        card: {
          backgroundColor: colors.card,
          borderRadius: colors.radius,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 18,
          marginBottom: 16,
        },
        cardTitle: { fontSize: 13, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 },
        selectionRow: { flexDirection: "row", gap: 10 },
        partnerSelection: { paddingRight: 2 },
        partnerOption: {
          width: 112,
          minHeight: 74,
          padding: 10,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
          justifyContent: "center",
          alignItems: "center",
          gap: 5,
        },
        partnerOptionActive: { borderColor: colors.accent, backgroundColor: colors.accent + "12" },
        partnerOptionText: { color: colors.foreground, fontSize: 12, fontWeight: "700", textAlign: "center" },
        emptyText: { color: colors.mutedForeground, fontSize: 14, lineHeight: 20 },
        retryButton: { marginTop: 12, minHeight: 42, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.foreground, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
        retryButtonText: { color: colors.background, fontSize: 13, fontWeight: "800" },
        input: {
          backgroundColor: colors.input,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          color: colors.foreground,
          fontSize: 22,
          fontWeight: "700",
          paddingHorizontal: 14,
          paddingVertical: 12,
        },
        inputCaption: { color: colors.mutedForeground, fontSize: 12, marginTop: 7 },
        method: {
          flex: 1,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 14,
          minHeight: 74,
          justifyContent: "center",
        },
        methodActive: { borderColor: colors.accent, backgroundColor: colors.accent + "12" },
        methodTitle: { color: colors.foreground, fontSize: 15, fontWeight: "700", marginBottom: 4 },
        methodText: { color: colors.mutedForeground, fontSize: 12 },
        summary: { color: colors.foreground, fontSize: 16, fontWeight: "700", lineHeight: 22 },
        summaryMuted: { color: colors.mutedForeground, fontSize: 13, lineHeight: 19, marginTop: 4 },
        primaryButton: {
          backgroundColor: colors.foreground,
          borderRadius: colors.radius,
          minHeight: 52,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 18,
        },
        primaryButtonDisabled: { opacity: 0.45 },
        primaryButtonText: { color: colors.background, fontSize: 15, fontWeight: "800" },
        error: { color: colors.destructive, fontSize: 13, lineHeight: 18, marginTop: 12 },
        status: {
          backgroundColor: colors.secondary,
          borderRadius: 12,
          padding: 14,
          marginBottom: 16,
        },
        resultStatus: {
          borderRadius: colors.radius,
          borderWidth: 1,
          padding: 18,
          marginBottom: 16,
        },
        resultSuccess: { backgroundColor: colors.accent + "12", borderColor: colors.accent + "35" },
        resultPending: { backgroundColor: colors.secondary, borderColor: colors.border },
        resultCanceled: { backgroundColor: colors.statusGold + "18", borderColor: colors.statusGold + "45" },
        resultFailed: { backgroundColor: colors.destructive + "12", borderColor: colors.destructive + "35" },
        resultHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
        resultIcon: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.card,
        },
        resultTitle: { color: colors.foreground, fontWeight: "800", fontSize: 17, flex: 1 },
        resultBody: { color: colors.mutedForeground, marginTop: 10, lineHeight: 19, fontSize: 13 },
        resultDetails: {
          borderTopWidth: 1,
          borderTopColor: colors.border,
          marginTop: 16,
          paddingTop: 14,
          gap: 7,
        },
        resultDetail: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
        resultDetailMuted: { color: colors.mutedForeground, fontSize: 12 },
        resultAction: { marginTop: 14, alignSelf: "flex-start" },
        statusTitle: { color: colors.foreground, fontWeight: "800", fontSize: 15 },
        statusText: { color: colors.mutedForeground, marginTop: 4, lineHeight: 18, fontSize: 13 },
      }),
    [bottomPadding, colors, insets.top],
  );

  const resetForNewPayment = () => {
    setCheckoutId(null);
    setCheckoutUrl(null);
    setCheckoutMessage(null);
    setValidationError(null);
    router.replace({
      pathname: "/payment" as never,
      params: {
        mode,
        ...(mode === "partner" && selectedPartnerId ? { partnerId: String(selectedPartnerId) } : {}),
      },
    });
  };

  const onResultAction = async () => {
    const status = currentStatus?.paymentStatus ?? currentStatus?.deal.status;
    if (status === "canceled" || status === "cancelled" || status === "failed" || status === "payment_failed") {
      resetForNewPayment();
      return;
    }
    await refetchStatus();
  };

  const refreshPaymentStatus = async (id: number) => {
    await queryClient.refetchQueries({
      queryKey: [mode === "partner" ? "purchase-payment-status" : "rental-payment-status", id],
      exact: true,
    });
  };

  const onCheckout = async () => {
    setValidationError(null);
    setCheckoutMessage(null);
    if (checkoutUrl) {
      await WebBrowser.openBrowserAsync(checkoutUrl);
      await refetchStatus();
      return;
    }
    const amount = parseAmount(amountText);
    if (mode === "rental" && !activeLease) {
      setValidationError(leasesError ? "Не удалось загрузить договор аренды." : "Нет активного договора аренды.");
      return;
    }
    if (mode === "partner" && !selectedPartnerId) {
      setValidationError("Выберите партнёра.");
      return;
    }
    if (amount === null) {
      setValidationError("Введите сумму больше нуля, например 1 500.");
      return;
    }
    const idempotencyKey = `mobile-${mode}-${Date.now()}`;
    try {
      const result = mode === "rental"
        ? await rentalCheckout.mutateAsync({
            data: {
              leaseId: activeLease!.id,
              grossAmountRub: amount,
              paymentMethod,
              idempotencyKey,
            },
          })
        : await purchaseCheckout.mutateAsync({
            data: {
              partnerId: selectedPartnerId!,
              grossAmountRub: amount,
              paymentMethod,
              idempotencyKey,
            },
          });
      setCheckoutId(result.deal.id);
      setCheckoutUrl(result.checkoutUrl);
      setCheckoutMessage(result.deal.paymentFailureReason ?? null);
      router.setParams({ paymentId: String(result.deal.id) });
      if (!result.checkoutUrl) {
        setValidationError("Провайдер не вернул ссылку на оплату.");
        return;
      }
      await WebBrowser.openBrowserAsync(result.checkoutUrl);
      await refreshPaymentStatus(result.deal.id);
    } catch (error) {
      const failedDeal = getApiErrorDeal(error);
      if (failedDeal) {
        setCheckoutId(failedDeal.id);
        setCheckoutUrl(null);
        setCheckoutMessage(
          failedDeal.paymentFailureReason
            ?? getApiErrorMessage(error, "Не удалось открыть оплату у провайдера."),
        );
        router.setParams({ paymentId: String(failedDeal.id) });
      } else {
        setValidationError(getApiErrorMessage(error, "Не удалось создать оплату. Попробуйте ещё раз."));
      }
    }
  };

  const activePaymentStatus = currentStatus?.paymentStatus ?? currentStatus?.deal.status;
  const isSuccessfulPayment = activePaymentStatus === "succeeded" || activePaymentStatus === "settled";
  const needsNewPayment = activePaymentStatus === "canceled"
    || activePaymentStatus === "cancelled"
    || activePaymentStatus === "failed"
    || activePaymentStatus === "payment_failed";

  if (authStatus === "unauthenticated") return <AuthScreen />;

  if (paramError || mode === null) {
    return (
      <View style={styles.container}>
        <View style={[styles.content, { flex: 1, justifyContent: "center" }]}>
          <View style={styles.card}>
            <Ionicons name="alert-circle-outline" size={36} color={colors.destructive} />
            <Text style={[styles.title, { marginTop: 14 }]}>Оплата недоступна</Text>
            <Text style={[styles.emptyText, { marginTop: 10 }]} testID="payment-params-error">{paramError ?? "Проверьте ссылку на оплату."}</Text>
            <AnimatedPressable onPress={() => router.back()} style={[styles.primaryButton, { marginTop: 20 }]} testID="payment-params-back">
              <Text style={styles.primaryButtonText}>Вернуться назад</Text>
            </AnimatedPressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.topBar}>
            <AnimatedPressable onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Назад">
              <Ionicons name="arrow-back" size={20} color={colors.foreground} />
            </AnimatedPressable>
            <Text style={styles.title}>{mode === "rental" ? "Оплата аренды" : "Покупка у партнёра"}</Text>
          </View>
          <Text style={styles.subtitle}>
            Оплата проходит на защищённой странице YooKassa. Данные карты не сохраняются в приложении.
          </Text>

          {checkoutId !== null && statusLoading ? (
            <View style={styles.status} testID="payment-status-loading">
              <ActivityIndicator color={colors.accent} />
              <Text style={[styles.statusText, { marginTop: 8 }]}>Проверяем статус оплаты…</Text>
            </View>
          ) : checkoutId !== null && statusError ? (
            <View style={styles.status} testID="payment-status-error">
              <Text style={styles.statusTitle}>Статус пока недоступен</Text>
              <Text style={styles.statusText}>Не удалось проверить подтверждение у провайдера.</Text>
              <AnimatedPressable onPress={() => refetchStatus()} style={{ marginTop: 10 }}>
                <Text style={[styles.statusText, { color: colors.accent, fontWeight: "800" }]}>Проверить ещё раз</Text>
              </AnimatedPressable>
            </View>
          ) : checkoutId !== null && currentStatus ? (
            (() => {
              const status = currentStatus.paymentStatus ?? currentStatus.deal.status;
              const result = paymentResultCopy(status, currentStatus.message ?? currentStatus.deal.paymentFailureReason);
              const isSuccess = result.tone === "success";
              const dealType = currentStatus.deal.kind === "rental_deal" ? "Арендная сделка" : "Покупка у партнёра";
              const resultIcon = result.tone === "success"
                ? "checkmark-circle"
                : result.tone === "failed"
                  ? "close-circle"
                  : result.tone === "canceled"
                    ? "ban"
                    : "time";
              return (
                <View
                  style={[
                    styles.resultStatus,
                    result.tone === "success"
                      ? styles.resultSuccess
                      : result.tone === "failed"
                        ? styles.resultFailed
                        : result.tone === "canceled"
                          ? styles.resultCanceled
                          : styles.resultPending,
                  ]}
                  testID={`payment-status-${status}`}
                >
                  <View style={styles.resultHeader}>
                    <View style={styles.resultIcon}>
                      <Ionicons
                        name={resultIcon}
                        size={22}
                        color={isSuccess ? colors.accent : result.tone === "failed" ? colors.destructive : colors.mutedForeground}
                      />
                    </View>
                    <Text style={styles.resultTitle}>{result.title}</Text>
                  </View>
                  <Text style={styles.resultBody}>{currentStatus.message ?? result.body}</Text>
                  <View style={styles.resultDetails}>
                    <Text style={styles.resultDetail}>{formatRub(currentStatus.deal.grossAmountRub)} · {dealType}</Text>
                    <Text style={styles.resultDetailMuted}>Сделка #{currentStatus.deal.id}</Text>
                  </View>
                  {!isSuccess ? (
                    <AnimatedPressable onPress={onResultAction} style={styles.resultAction} testID="payment-status-action">
                      <Text style={[styles.statusText, { color: colors.accent, fontWeight: "800" }]}>
                        {statusFetching ? "Проверяем…" : result.action}
                      </Text>
                    </AnimatedPressable>
                  ) : null}
                </View>
              );
            })()
          ) : null}

          {mode === "partner" ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Партнёр</Text>
              {partnersLoading ? (
                <ActivityIndicator color={colors.accent} />
              ) : partnersError ? (
                <>
                  <Text style={styles.emptyText}>Не удалось загрузить партнёров.</Text>
                  <AnimatedPressable onPress={() => void refetchPartners()} style={styles.retryButton} testID="payment-partners-retry">
                    <Text style={styles.retryButtonText}>Повторить</Text>
                  </AnimatedPressable>
                </>
              ) : !partners?.length ? (
                <Text style={styles.emptyText}>Сейчас нет доступных партнёров для покупки.</Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[styles.selectionRow, styles.partnerSelection]}
                >
                  {partners.map((partner) => (
                    <AnimatedPressable
                      key={partner.id}
                      style={[styles.partnerOption, selectedPartnerId === partner.id && styles.partnerOptionActive]}
                      onPress={() => setSelectedPartnerId(partner.id)}
                      testID={`payment-partner-${partner.id}`}
                    >
                      <PartnerLogo name={partner.name} logoUrl={partner.logoUrl} size={28} />
                      <Text style={styles.partnerOptionText} numberOfLines={2}>{partner.name}</Text>
                    </AnimatedPressable>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Договор аренды</Text>
              {leasesLoading ? (
                <ActivityIndicator color={colors.accent} />
              ) : leasesError ? (
                <>
                  <Text style={styles.emptyText}>Не удалось загрузить договор аренды.</Text>
                  <AnimatedPressable onPress={() => void refetchLeases()} style={styles.retryButton} testID="payment-leases-retry">
                    <Text style={styles.retryButtonText}>Повторить</Text>
                  </AnimatedPressable>
                </>
              ) : activeLease ? (
                <>
                  <Text style={styles.summary}>{activeLease.address}</Text>
                  <Text style={styles.summaryMuted}>Обычно к оплате {formatRub(activeLease.monthlyRentRub)}</Text>
                </>
              ) : (
                <Text style={styles.emptyText}>Нет активного договора аренды.</Text>
              )}
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Сумма</Text>
            <TextInput
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              placeholder="0 ₽"
              placeholderTextColor={colors.mutedForeground}
              style={styles.input}
              accessibilityLabel="Сумма оплаты"
              testID="payment-amount"
            />
            <Text style={styles.inputCaption}>Сумма указывается в российских рублях.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Способ оплаты</Text>
            <View style={styles.selectionRow}>
              <AnimatedPressable
                style={[styles.method, paymentMethod === "sbp" && styles.methodActive]}
                onPress={() => setPaymentMethod("sbp")}
                accessibilityRole="radio"
                accessibilityState={{ selected: paymentMethod === "sbp" }}
                testID="payment-method-sbp"
              >
                <Text style={styles.methodTitle}>СБП</Text>
                <Text style={styles.methodText}>Оплата через банк</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={[styles.method, paymentMethod === "mir_pay" && styles.methodActive]}
                onPress={() => setPaymentMethod("mir_pay")}
                accessibilityRole="radio"
                accessibilityState={{ selected: paymentMethod === "mir_pay" }}
                testID="payment-method-mir-pay"
              >
                <Text style={styles.methodTitle}>Mir Pay</Text>
                <Text style={styles.methodText}>Кошелёк Mir Pay</Text>
              </AnimatedPressable>
            </View>
          </View>

          {validationError ? <Text style={styles.error} testID="payment-error">{validationError}</Text> : null}
          {checkoutMessage && !currentStatus ? <Text style={styles.error}>{checkoutMessage}</Text> : null}
          <AnimatedPressable
            style={[styles.primaryButton, isSubmitting && styles.primaryButtonDisabled]}
            onPress={isSuccessfulPayment ? () => router.back() : needsNewPayment ? resetForNewPayment : onCheckout}
            disabled={isSubmitting}
            testID="open-provider-checkout"
          >
            {isSubmitting ? <ActivityIndicator color={colors.background} /> : (
              <Text style={styles.primaryButtonText}>
                {isSuccessfulPayment
                  ? "Вернуться"
                  : needsNewPayment
                    ? "Начать новую оплату"
                    : checkoutUrl
                      ? "Открыть оплату снова"
                      : "Перейти к оплате"}
              </Text>
            )}
          </AnimatedPressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}