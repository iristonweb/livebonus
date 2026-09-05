import { Ionicons } from "@expo/vector-icons";
import {
  FinancialLedgerEntry,
  Transaction,
  useListFinancialLedger,
  useListTransactions,
} from "@workspace/api-client-react";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollView } from "react-native-gesture-handler";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";
import { AnimatedPressable } from "@/components/AnimatedPressable";
import { formatRub, isAuthError } from "@/lib/financeUi";

const FILTERS = [
  { key: "all", label: "Все" },
  { key: "rent", label: "Аренда" },
  { key: "utilities", label: "ЖКХ" },
  { key: "transport", label: "Транспорт" },
  { key: "health", label: "Здоровье" },
  { key: "food", label: "Еда" },
  { key: "other", label: "Прочее" },
] as const;

const CATEGORY_ICONS: Record<string, string> = {
  rent: "home-outline", utilities: "flash-outline", transport: "car-outline",
  health: "medkit-outline", food: "restaurant-outline", other: "ellipsis-horizontal",
};

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

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(iso));
}

type HistoryRow =
  | { kind: "financial"; entry: FinancialLedgerEntry }
  | { kind: "legacy"; transaction: Transaction };

type LedgerMetadata = FinancialLedgerEntry & {
  category?: string | null;
  partnerName?: string | null;
};

function financialTypeLabel(entry: FinancialLedgerEntry): string {
  if (entry.source === "refund" || entry.settlementStatus === "refunded") return "Возврат бонуса";
  if (entry.dealType === "rental_deal") {
    return entry.entryType === "credit" ? "Начисление за аренду" : "Списание по аренде";
  }
  return entry.entryType === "credit" ? "Начисление бонусов" : "Списание бонусов";
}

function dealTypeLabel(dealType: FinancialLedgerEntry["dealType"]): string {
  if (dealType === "rental_deal") return "Арендная сделка";
  if (dealType === "partner_purchase") return "Покупка у партнёра";
  return "Финансовое событие";
}

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const {
    data: transactions,
    isLoading: transactionsLoading,
    isError: transactionsIsError,
    error: transactionsError,
  } = useListTransactions(
    activeFilter !== "all" ? { category: activeFilter } : {},
    { query: { queryKey: ["transactions", activeFilter] } }
  );
  const {
    data: ledger,
    isLoading: ledgerLoading,
    isError: ledgerIsError,
    error: ledgerError,
    refetch: refetchLedger,
  } = useListFinancialLedger(
    { limit: 100, ...(activeFilter !== "all" ? { category: activeFilter } : {}) },
    { query: { queryKey: ["financial-ledger", activeFilter] } },
  );

  const transactionById = useMemo(
    () => new Map((transactions ?? []).map((transaction) => [transaction.id, transaction])),
    [transactions],
  );
  const rows = useMemo<HistoryRow[]>(() => {
    const financialRows = (ledger ?? [])
      .filter((entry) => {
        if (activeFilter === "all") return true;
        const metadata = entry as LedgerMetadata;
        const category = metadata.category
          ?? (entry.transactionId !== null ? transactionById.get(entry.transactionId)?.category : undefined)
          ?? (entry.dealType === "rental_deal" ? "rent" : "other");
        if (category === activeFilter) return true;
        return false;
      })
      .map((entry) => ({ kind: "financial" as const, entry }));
    const linkedTransactionIds = new Set(
      (ledger ?? [])
        .map((entry) => entry.transactionId)
        .filter((id): id is number => id !== null),
    );
    const legacyRows = (transactions ?? [])
      .filter((transaction) => {
        if (linkedTransactionIds.has(transaction.id)) return false;
        if (activeFilter === "all") return true;
        return transaction.category === activeFilter;
      })
      .map((transaction) => ({ kind: "legacy" as const, transaction }));
    return [...financialRows, ...legacyRows].sort((a, b) => {
      const aDate = a.kind === "financial" ? a.entry.createdAt : a.transaction.createdAt;
      const bDate = b.kind === "financial" ? b.entry.createdAt : b.transaction.createdAt;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
  }, [activeFilter, ledger, transactions, transactionById]);
  const isLoading = transactionsLoading || ledgerLoading;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 16,
      paddingHorizontal: 20,
      paddingBottom: 24,
    },
    headerTitle: { fontSize: 28, fontWeight: "800", color: colors.foreground, letterSpacing: -1 },
    headerSubtitle: { fontSize: 15, color: colors.mutedForeground, marginTop: 4, fontWeight: "500" },
    filterContainer: { paddingBottom: 20 },
    filterContent: { paddingHorizontal: 20, gap: 10 },
    filterChip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 50, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    filterChipActive: { backgroundColor: colors.foreground, borderColor: colors.foreground },
    filterChipText: { fontSize: 14, fontWeight: "600", color: colors.foreground },
    filterChipTextActive: { color: colors.background },
    list: { paddingHorizontal: 20, paddingBottom: Platform.OS === "web" ? 34 + 84 : 100 },
    
    txCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
    },
    txIconBox: {
      width: 44, height: 44, borderRadius: 22,
      alignItems: "center", justifyContent: "center",
      marginRight: 16, backgroundColor: colors.background,
      borderWidth: 1, borderColor: colors.border
    },
    txInfo: { flex: 1, minWidth: 0, justifyContent: "center" },
    txDesc: { fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 4 },
    txMeta: { fontSize: 13, color: colors.mutedForeground, fontWeight: "500" },
    txAmountBox: { alignItems: "flex-end", justifyContent: "center" },
    txAmountPositive: { fontSize: 16, fontWeight: "800", color: colors.accent, textAlign: "right" },
    txAmountNegative: { fontSize: 16, fontWeight: "800", color: colors.foreground, textAlign: "right" },
    txRub: { fontSize: 13, color: colors.mutedForeground, textAlign: "right", marginTop: 4, fontWeight: "500" },
    txStatus: { fontSize: 12, color: colors.mutedForeground, textAlign: "right", marginTop: 5, fontWeight: "600" },
    txDetails: { fontSize: 12, color: colors.mutedForeground, lineHeight: 18, marginTop: 7 },
    warning: {
      marginHorizontal: 20,
      marginBottom: 14,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.secondary,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    warningText: { flex: 1, fontSize: 13, color: colors.mutedForeground, lineHeight: 18 },
    errorText: { color: colors.destructive },
    
    loading: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 40 },
    empty: { alignItems: "center", justifyContent: "center", paddingTop: 80 },
    emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", marginBottom: 16, borderWidth: 1, borderColor: colors.border },
    emptyText: { fontSize: 16, fontWeight: "700", color: colors.foreground },
    emptySubtext: { fontSize: 14, color: colors.mutedForeground, marginTop: 4, fontWeight: "500" },
  });

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.header}>
        <Text style={styles.headerTitle}>История</Text>
        <Text style={styles.headerSubtitle}>Денежные бонусы и legacy-операции</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(600).delay(200)}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent} style={styles.filterContainer}>
          {FILTERS.map((f) => (
            <AnimatedPressable key={f.key} style={[styles.filterChip, activeFilter === f.key && styles.filterChipActive]} onPress={() => setActiveFilter(f.key)}>
              <Text style={[styles.filterChipText, activeFilter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
            </AnimatedPressable>
          ))}
        </ScrollView>
      </Animated.View>

      {(transactionsIsError || ledgerIsError) && (
        <View style={styles.warning}>
          <Ionicons name="warning-outline" size={18} color={colors.destructive} />
          <Text style={styles.warningText}>
            {isAuthError(ledgerError) || isAuthError(transactionsError)
              ? "Войдите в аккаунт, чтобы загрузить личную историю."
              : "Часть финансовых данных недоступна. Неподтверждённые операции не считаются успешным списанием."}
          </Text>
          <AnimatedPressable
            onPress={() => {
              void refetchLedger();
            }}
            accessibilityLabel="Повторить загрузку финансовой истории"
          >
            <Ionicons name="refresh" size={20} color={colors.accent} />
          </AnimatedPressable>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : !rows.length ? (
        <Animated.View entering={FadeInDown.duration(600).delay(300)} style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="receipt-outline" size={24} color={colors.mutedForeground} />
          </View>
          <Text style={styles.emptyText}>Операций нет</Text>
          <Text style={styles.emptySubtext}>Здесь появятся начисления, списания и возвраты</Text>
        </Animated.View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.kind === "financial" ? `ledger-${item.entry.id}` : `legacy-${item.transaction.id}`}
          contentContainerStyle={styles.list}
          scrollEnabled={!!rows.length}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            if (item.kind === "financial") {
              const entry = item.entry;
              const linkedTransaction = entry.transactionId === null
                ? undefined
                : transactionById.get(entry.transactionId);
              const isPositive = entry.amountRubSigned > 0;
              const iconName = entry.source === "refund"
                ? "return-up-forward-outline"
                : isPositive ? "arrow-down" : "arrow-up";
              const status = entry.settlementStatus === "refunded"
                ? "Возврат"
                : entry.settlementStatus === "pending"
                  ? "Ожидает оплаты"
              : entry.settlementStatus === "settled"
                  ? "Подтверждено"
                  : entry.settlementStatus === "payment_failed"
                    ? "Оплата не подтверждена"
                    : entry.settlementStatus === "cancelled"
                      ? "Отменено"
                      : "Не подтверждено";
              const merchant = (entry as LedgerMetadata).partnerName;
              const details = entry.dealType === "partner_purchase"
                ? `${merchant ? `${merchant} · ` : ""}Чек ${formatRub(entry.dealGrossAmountRub ?? entry.amountRub)} · net ${formatRub(entry.dealNetAmountRub ?? 0)} · комиссия ${formatRub(entry.dealFeeAmountRub ?? 0)}`
                : entry.dealType === "rental_deal"
                  ? `Сделка ${formatRub(entry.dealGrossAmountRub ?? entry.amountRub)} · начисления: арендатору ${formatRub(entry.dealTenantBonusRub ?? 0)} и арендодателю ${formatRub(entry.dealLandlordBonusRub ?? 0)}`
                  : "Состав финансовой операции недоступен";
              return (
                <Animated.View entering={FadeInDown.duration(400).delay(300 + index * 50)}>
                  <AnimatedPressable style={styles.txCard}>
                    <View style={styles.txIconBox}>
                      <Ionicons name={iconName as any} size={20} color={isPositive ? colors.accent : colors.foreground} />
                    </View>
                    <View style={styles.txInfo}>
                      <Text style={styles.txDesc} numberOfLines={1}>{financialTypeLabel(entry)}</Text>
                      <Text style={styles.txMeta} numberOfLines={1}>
                        {formatDate(entry.createdAt)} · {dealTypeLabel(entry.dealType)}
                      </Text>
                      <Text style={styles.txDetails} numberOfLines={2}>{details}</Text>
                    </View>
                    <View style={styles.txAmountBox}>
                      <Text style={isPositive ? styles.txAmountPositive : styles.txAmountNegative}>
                        {isPositive ? "+" : ""}{formatRub(entry.amountRubSigned)}
                      </Text>
                      {linkedTransaction && (
                        <Text style={styles.txRub}>
                          {linkedTransaction.pointsEarned > 0 ? "+" : ""}{new Intl.NumberFormat("ru-RU").format(linkedTransaction.pointsEarned)} б.
                        </Text>
                      )}
                      <Text style={styles.txStatus}>{status}</Text>
                    </View>
                  </AnimatedPressable>
                </Animated.View>
              );
            }

            const transaction = item.transaction;
            const iconColor = getCategoryAccent(transaction.category, colors);
            const iconName = CATEGORY_ICONS[transaction.category] ?? "ellipsis-horizontal";
            const isPositive = transaction.amountRubSigned > 0;
            const isLegacyRedeem = transaction.type === "redeem";
            return (
              <Animated.View entering={FadeInDown.duration(400).delay(300 + index * 50)}>
                <AnimatedPressable style={styles.txCard}>
                  <View style={styles.txIconBox}>
                    <Ionicons name={iconName as any} size={20} color={iconColor} />
                  </View>
                  <View style={styles.txInfo}>
                    <Text style={styles.txDesc} numberOfLines={1}>
                      {isLegacyRedeem ? "Старое списание — без подтверждения" : transaction.description}
                    </Text>
                    <Text style={styles.txMeta} numberOfLines={1}>
                      {formatDate(transaction.createdAt)}{transaction.partnerName ? ` · ${transaction.partnerName}` : ""}
                    </Text>
                    <Text style={styles.txDetails}>Legacy-запись · операция не подтверждена финансовым settlement</Text>
                  </View>
                  <View style={styles.txAmountBox}>
                    <Text style={isPositive ? styles.txAmountPositive : styles.txAmountNegative}>
                      {isPositive ? "+" : ""}{formatRub(transaction.amountRubSigned)}
                    </Text>
                    <Text style={styles.txRub}>
                      {isPositive ? "+" : ""}{new Intl.NumberFormat("ru-RU").format(transaction.pointsEarned)} б.
                    </Text>
                    <Text style={styles.txStatus}>Не подтверждено</Text>
                  </View>
                </AnimatedPressable>
              </Animated.View>
            );
          }}
        />
      )}
    </View>
  );
}