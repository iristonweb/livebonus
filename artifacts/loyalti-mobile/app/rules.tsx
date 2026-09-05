import { Ionicons } from "@expo/vector-icons";
import { useGetFinancialPolicy } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";

import { AnimatedPressable } from "@/components/AnimatedPressable";
import { useColors } from "@/hooks/useColors";
import { formatRate, formatRub, isAuthError } from "@/lib/financeUi";

export default function BonusRulesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: policy, isLoading, isError, error } = useGetFinancialPolicy();

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 12,
      paddingHorizontal: 20,
      paddingBottom: Platform.OS === "web" ? 118 : 100,
    },
    topBar: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: 12,
    },
    title: { flex: 1, fontSize: 26, fontWeight: "800", color: colors.foreground, letterSpacing: -0.8 },
    subtitle: { fontSize: 15, color: colors.mutedForeground, lineHeight: 21, marginBottom: 22 },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      marginBottom: 14,
    },
    cardTitle: { fontSize: 16, fontWeight: "800", color: colors.foreground, marginBottom: 8 },
    cardText: { fontSize: 14, color: colors.mutedForeground, lineHeight: 21 },
    value: { fontSize: 25, fontWeight: "800", color: colors.accent, marginBottom: 4 },
    formula: { fontSize: 13, color: colors.foreground, lineHeight: 20, marginTop: 10 },
    note: {
      backgroundColor: colors.secondary,
      borderRadius: 12,
      padding: 14,
      marginTop: 4,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    noteText: { flex: 1, fontSize: 13, color: colors.mutedForeground, lineHeight: 19 },
    state: { alignItems: "center", paddingTop: 72 },
    stateTitle: { fontSize: 17, fontWeight: "800", color: colors.foreground, textAlign: "center" },
    stateText: { fontSize: 14, color: colors.mutedForeground, lineHeight: 20, textAlign: "center", marginTop: 8 },
  });

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(500)} style={styles.topBar}>
          <AnimatedPressable onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Назад">
            <Ionicons name="arrow-back" size={20} color={colors.foreground} />
          </AnimatedPressable>
          <Text style={styles.title}>Правила бонусов</Text>
        </Animated.View>

        {isLoading ? (
          <View style={styles.state}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={[styles.stateText, { marginTop: 16 }]}>Загружаем действующую политику…</Text>
          </View>
        ) : isError || !policy ? (
          <View style={styles.state}>
            <Ionicons name="lock-closed-outline" size={32} color={colors.mutedForeground} />
            <Text style={[styles.stateTitle, { marginTop: 14 }]}>
              {isAuthError(error) ? "Нужен вход в аккаунт" : "Правила временно недоступны"}
            </Text>
            <Text style={styles.stateText}>
              {isAuthError(error)
                ? "Авторизуйтесь, чтобы увидеть действующую финансовую политику."
                : "Не удалось загрузить финансовые данные. Попробуйте позже."}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.subtitle}>
              Денежная стоимость бонусов определяется действующей политикой сервера. Версия политики: {policy.version}.
            </Text>

            <Animated.View entering={FadeInDown.duration(500).delay(100)} style={styles.card}>
              <Text style={styles.cardTitle}>Покупки у партнёров</Text>
              <Text style={styles.value}>{formatRate(policy.purchaseRedemptionRate)} максимум</Text>
              <Text style={styles.cardText}>
                Бонусами можно оплатить не более {formatRate(policy.purchaseRedemptionRate)} валового чека.
              </Text>
              <Text style={styles.formula}>
                Пример 100 000 ₽: максимум списания — {formatRub(100000 * policy.purchaseRedemptionRate)}.
              </Text>
              <Text style={styles.formula}>
                После бонусов партнёр получает комиссию {formatRate(policy.partnerFeeRate)} от net-суммы:
                {" "}{formatRub((100000 - 100000 * policy.purchaseRedemptionRate) * policy.partnerFeeRate)}.
              </Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(500).delay(200)} style={styles.card}>
              <Text style={styles.cardTitle}>Арендная сделка</Text>
              <Text style={styles.value}>{formatRate(policy.rentalBonusRate)} + {formatRate(policy.rentalBonusRate)}</Text>
              <Text style={styles.cardText}>
                Два начисления от gross-суммы сделки: одно арендатору и одно арендодателю.
              </Text>
              <Text style={styles.formula}>
                Пример 100 000 ₽: арендатору — {formatRub(100000 * policy.rentalBonusRate)}, арендодателю — {formatRub(100000 * policy.rentalBonusRate)}.
              </Text>
              <Text style={styles.formula}>
                Комиссия арендодателя — {formatRate(policy.partnerFeeRate)} от gross:
                {" "}{formatRub(100000 * policy.partnerFeeRate)}.
              </Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(500).delay(300)} style={styles.note}>
              <Ionicons name="information-circle-outline" size={20} color={colors.accent} />
              <Text style={styles.noteText}>
                Все суммы выше — предварительный расчёт до подтверждённого settlement. Фактическая операция появляется только после ответа сервера.
              </Text>
            </Animated.View>
          </>
        )}
      </ScrollView>
    </View>
  );
}