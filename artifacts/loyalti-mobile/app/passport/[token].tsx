import { Ionicons } from "@expo/vector-icons";
import { getGetPassportQueryKey, useGetPassport } from "@workspace/api-client-react";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export default function PublicPassportScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = typeof params.token === "string" ? params.token : "";
  const validToken = /^[A-Za-z0-9_-]{40,80}$/.test(token);
  const { data: passport, isLoading, isError } = useGetPassport(token, {
    query: { enabled: validToken, queryKey: getGetPassportQueryKey(token) },
  });

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flexGrow: 1, justifyContent: "center", padding: 24 },
    card: { backgroundColor: colors.card, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: colors.border },
    title: { color: colors.foreground, fontSize: 26, fontWeight: "800", textAlign: "center", marginTop: 16 },
    subtitle: { color: colors.mutedForeground, fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 8 },
    score: { color: colors.primary, fontSize: 64, fontWeight: "800", textAlign: "center", marginTop: 20 },
    tier: { color: colors.foreground, fontSize: 16, fontWeight: "700", textAlign: "center", marginTop: 2 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 24 },
    metric: { width: "47%", backgroundColor: colors.background, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
    metricValue: { color: colors.foreground, fontSize: 22, fontWeight: "800" },
    metricLabel: { color: colors.mutedForeground, fontSize: 11, fontWeight: "700", marginTop: 4 },
    status: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 20, justifyContent: "center" },
    statusChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
    statusText: { color: colors.mutedForeground, fontSize: 12, fontWeight: "700" },
    unavailable: { color: colors.foreground, fontSize: 20, fontWeight: "800", textAlign: "center", marginTop: 16 },
  });

  if (validToken && isLoading) {
    return <View style={[styles.container, styles.content]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  if (!validToken || isError || !passport) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.card}>
            <Ionicons name="shield-checkmark-outline" size={48} color={colors.mutedForeground} style={{ alignSelf: "center" }} />
            <Text style={styles.unavailable}>Паспорт недоступен</Text>
            <Text style={styles.subtitle}>Ссылка повреждена, истекла или была отозвана. Проверьте ссылку и подключение к интернету.</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Ionicons name="shield-checkmark-outline" size={48} color={colors.primary} style={{ alignSelf: "center" }} />
          <Text style={styles.title}>Live Passport</Text>
          <Text style={styles.score}>{passport.score}</Text>
          <Text style={styles.tier}>{passport.tierLabel}</Text>
          <View style={styles.grid}>
            <View style={styles.metric}><Text style={styles.metricValue}>{passport.totalLeases}</Text><Text style={styles.metricLabel}>Договоров</Text></View>
            <View style={styles.metric}><Text style={styles.metricValue}>{passport.activeLeases}</Text><Text style={styles.metricLabel}>Активных</Text></View>
            <View style={styles.metric}><Text style={styles.metricValue}>{passport.totalTenureMonths}</Text><Text style={styles.metricLabel}>Месяцев аренды</Text></View>
            <View style={styles.metric}><Text style={styles.metricValue}>{passport.totalOnTimePayments}</Text><Text style={styles.metricLabel}>Оплат вовремя</Text></View>
          </View>
          <View style={styles.status}>
            {[
              ["Телефон", passport.isPhoneVerified],
              ["Личность", passport.isIdentityVerified],
              ["Доход", passport.isIncomeVerified],
            ].map(([label, verified]) => (
              <View key={label as string} style={styles.statusChip}>
                <Text style={[styles.statusText, verified ? { color: colors.accent } : undefined]}>{verified ? "✓ " : ""}{label as string}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}