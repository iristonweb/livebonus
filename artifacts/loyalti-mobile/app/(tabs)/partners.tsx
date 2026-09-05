import { Ionicons } from "@expo/vector-icons";
import { useDeleteSavedOffer, useListOffers, useListPartners, useListSavedOffers } from "@workspace/api-client-react";
import type { Offer } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";

import { useColors } from "@/hooks/useColors";
import { AnimatedPressable } from "@/components/AnimatedPressable";
import { PartnerLogo } from "@/components/PartnerLogo";

const CATEGORIES = [
  { key: "all", label: "Все" },
  { key: "saved", label: "Сохранённые" },
  { key: "rent", label: "Аренда" },
  { key: "utilities", label: "ЖКХ" },
  { key: "transport", label: "Транспорт" },
  { key: "health", label: "Здоровье" },
  { key: "food", label: "Еда" },
  { key: "other", label: "Прочее" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  rent: "Аренда",
  utilities: "ЖКХ",
  transport: "Транспорт",
  health: "Здоровье",
  food: "Еда",
  other: "Прочее",
};

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

function formatRub(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000));
}

export default function PartnersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [removingOfferId, setRemovingOfferId] = useState<number | null>(null);
  const isSavedFilter = activeCategory === "saved";

  const { data: partners, isLoading, isError: partnersError, refetch: refetchPartners } = useListPartners(
    !isSavedFilter && activeCategory !== "all" ? { category: activeCategory } : {},
    { query: { queryKey: ["partners", activeCategory], enabled: !isSavedFilter } }
  );
  const { data: offers, isLoading: offersLoading, isError: offersError, refetch: refetchOffers } = useListOffers(
    !isSavedFilter && activeCategory !== "all" ? { category: activeCategory } : {},
    { query: { queryKey: ["offers", activeCategory], enabled: !isSavedFilter } },
  );
  const { data: savedOffers, isLoading: savedOffersLoading, isError: savedOffersError, refetch: refetchSavedOffers } = useListSavedOffers({
    query: { queryKey: ["offers", "saved"], enabled: isSavedFilter },
  });
  const displayedOffers = isSavedFilter ? savedOffers : offers;
  const displayedOffersLoading = isSavedFilter ? savedOffersLoading : offersLoading;
  const deleteSavedOffer = useDeleteSavedOffer();

  const removeSavedOffer = (offer: Offer) => {
    if (removingOfferId !== null) return;
    const remove = () => {
      setRemovingOfferId(offer.id);
      deleteSavedOffer.mutate(
        { id: offer.id },
        {
          onSuccess: () => {
            queryClient.setQueryData<Offer[]>(["offers", "saved"], (current) =>
              current?.filter((savedOffer) => savedOffer.id !== offer.id),
            );
            void queryClient.invalidateQueries({ queryKey: ["offers", "saved"] });
            setRemovingOfferId(null);
          },
          onError: (error) => {
            setRemovingOfferId(null);
            Alert.alert("Не удалось удалить предложение", error instanceof Error ? error.message : "Попробуйте ещё раз.");
          },
        },
      );
    };

    if (offer.isActivated) {
      Alert.alert(
        "Удалить активированное предложение?",
        "Предложение будет удалено из сохранённых, а его активация отменена.",
        [
          { text: "Оставить", style: "cancel" },
          { text: "Удалить", style: "destructive", onPress: remove },
        ],
      );
      return;
    }
    remove();
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 16,
      paddingHorizontal: 20,
      paddingBottom: 24,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: "800",
      color: colors.foreground,
      letterSpacing: -1,
    },
    headerSubtitle: {
      fontSize: 15,
      color: colors.mutedForeground,
      marginTop: 4,
      fontWeight: "500",
    },
    filterContainer: {
      paddingBottom: 20,
    },
    filterContent: {
      paddingHorizontal: 20,
      gap: 10,
    },
    filterChip: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 50,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    filterChipActive: {
      backgroundColor: colors.foreground,
      borderColor: colors.foreground,
    },
    filterChipText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.foreground,
    },
    filterChipTextActive: {
      color: colors.background,
    },
    list: {
      paddingHorizontal: 20,
      paddingBottom: Platform.OS === "web" ? 118 : insets.bottom + 116,
    },
    columnWrapper: {
      gap: 16,
      marginBottom: 16,
    },
    partnerCard: {
      flex: 1,
      borderRadius: colors.radius,
      padding: 20,
      minHeight: 208,
    },
    partnerCardTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    multiplierText: {
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: -1,
    },
    partnerName: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.foreground,
      marginTop: 20,
    },
    partnerDesc: {
      fontSize: 13,
      color: colors.mutedForeground,
      marginTop: 6,
      lineHeight: 18,
      fontWeight: "500"
    },
    partnerBadge: {
      alignSelf: "flex-start",
      marginTop: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    partnerBadgeText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    offersSection: {
      marginBottom: 24,
    },
    offersHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    offersTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.foreground,
      letterSpacing: -0.5,
    },
    offersHint: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.mutedForeground,
    },
    offersRow: {
      paddingHorizontal: 20,
      gap: 12,
    },
    offerCard: {
      width: 274,
      minHeight: 164,
      padding: 16,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    offerCardTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    offerPartner: {
      flex: 1,
      marginLeft: 10,
      fontSize: 12,
      fontWeight: "700",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    offerMultiplier: {
      fontSize: 18,
      fontWeight: "800",
    },
    offerTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.foreground,
      lineHeight: 21,
    },
    offerDescription: {
      fontSize: 13,
      color: colors.mutedForeground,
      lineHeight: 18,
      marginTop: 5,
    },
    offerFooter: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 12,
    },
    offerMeta: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontWeight: "600",
    },
    offerAction: {
      fontSize: 12,
      color: colors.accent,
      fontWeight: "700",
    },
    offerRemoveButton: {
      flexDirection: "row",
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor: colors.border,
      marginTop: 12,
      paddingTop: 10,
    },
    offerRemoveText: {
      marginLeft: 6,
      fontSize: 12,
      color: colors.mutedForeground,
      fontWeight: "700",
    },
    loading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 40,
    },
    empty: {
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 80,
    },
    emptyIcon: {
      width: 64, height: 64, borderRadius: 32, backgroundColor: colors.card, 
      alignItems: "center", justifyContent: "center", 
      marginBottom: 16, borderWidth: 1, borderColor: colors.border
    },
    emptyText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.foreground,
    },
    emptySubtext: {
      fontSize: 14,
      color: colors.mutedForeground,
      marginTop: 4,
      fontWeight: "500"
    },
    retryButton: { marginTop: 18, minHeight: 44, paddingHorizontal: 18, borderRadius: colors.radius, backgroundColor: colors.foreground, alignItems: "center", justifyContent: "center" },
    retryButtonText: { color: colors.background, fontSize: 13, fontWeight: "800" },
  });

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.header}>
        <Text style={styles.headerTitle}>Партнёры</Text>
        <Text style={styles.headerSubtitle}>Повышенный кэшбэк у любимых брендов</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(600).delay(200)}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
          style={styles.filterContainer}
        >
          {CATEGORIES.map((cat) => (
            <AnimatedPressable
              key={cat.key}
              style={[styles.filterChip, activeCategory === cat.key && styles.filterChipActive]}
              onPress={() => setActiveCategory(cat.key)}
              testID={`offer-filter-${cat.key}`}
            >
              <Text style={[styles.filterChipText, activeCategory === cat.key && styles.filterChipTextActive]}>
                {cat.label}
              </Text>
            </AnimatedPressable>
          ))}
        </ScrollView>
      </Animated.View>

      {displayedOffersLoading ? (
        <View style={styles.offersSection}>
          <View style={styles.offersHeader}>
            <Text style={styles.offersTitle}>{isSavedFilter ? "Сохранённые" : "Предложения"}</Text>
          </View>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (isSavedFilter ? savedOffersError : offersError) && !displayedOffers ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Ionicons name="cloud-offline-outline" size={24} color={colors.mutedForeground} /></View>
          <Text style={styles.emptyText}>Предложения временно недоступны</Text>
          <Text style={styles.emptySubtext}>Проверьте соединение и повторите загрузку.</Text>
          <AnimatedPressable onPress={() => void (isSavedFilter ? refetchSavedOffers() : refetchOffers())} style={styles.retryButton} testID="offers-retry">
            <Text style={styles.retryButtonText}>Повторить</Text>
          </AnimatedPressable>
        </View>
      ) : displayedOffers && displayedOffers.length > 0 ? (
        <Animated.View entering={FadeInDown.duration(500).delay(250)} style={styles.offersSection}>
          <View style={styles.offersHeader}>
            <Text style={styles.offersTitle}>{isSavedFilter ? "Сохранённые" : "Предложения"}</Text>
            <Text style={styles.offersHint}>
              {displayedOffers.length} {isSavedFilter ? "доступно вам" : "доступно"}
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.offersRow}
          >
            {displayedOffers.map((offer: Offer) => {
              const accent = getCategoryAccent(offer.category, colors);
              return (
                <AnimatedPressable
                  key={offer.id}
                  style={styles.offerCard}
                  onPress={() => router.push(`/offer/${offer.id}`)}
                  testID={`offer-card-${offer.id}`}
                >
                  <View style={styles.offerCardTop}>
                    <PartnerLogo name={offer.partnerName} logoUrl={offer.partnerLogoUrl} size={32} />
                    <Text style={styles.offerPartner} numberOfLines={1}>{offer.partnerName}</Text>
                    <Text style={[styles.offerMultiplier, { color: accent }]}>{offer.bonusMultiplier}×</Text>
                  </View>
                  <Text style={styles.offerTitle} numberOfLines={2}>{offer.title}</Text>
                  {offer.description ? (
                    <Text style={styles.offerDescription} numberOfLines={1}>{offer.description}</Text>
                  ) : null}
                  <View style={styles.offerFooter}>
                    <Text style={styles.offerMeta}>
                      {offer.minAmountRub ? `от ${formatRub(offer.minAmountRub)} · ` : ""}
                      {daysLeft(offer.expiresAt)} дн.
                    </Text>
                    <Text style={styles.offerAction}>
                      {offer.isActivated ? "Активировано" : offer.isSaved ? "Сохранено" : "Подробнее"}
                    </Text>
                  </View>
                  {isSavedFilter ? (
                    <AnimatedPressable
                      style={[styles.offerRemoveButton, removingOfferId === offer.id && { opacity: 0.6 }]}
                      onPress={() => removeSavedOffer(offer)}
                      disabled={removingOfferId !== null}
                      testID={`offer-remove-saved-${offer.id}`}
                      accessibilityLabel="Удалить из сохранённых"
                    >
                      {removingOfferId === offer.id ? (
                        <ActivityIndicator color={colors.mutedForeground} size="small" />
                      ) : (
                        <>
                          <Ionicons name="bookmark" size={15} color={colors.mutedForeground} />
                          <Text style={styles.offerRemoveText}>Удалить из сохранённых</Text>
                        </>
                      )}
                    </AnimatedPressable>
                  ) : null}
                </AnimatedPressable>
              );
            })}
          </ScrollView>
        </Animated.View>
      ) : null}

      {isSavedFilter ? (
        !displayedOffersLoading && !displayedOffers?.length && !savedOffersError ? (
          <Animated.View entering={FadeInDown.duration(600).delay(300)} style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="bookmark-outline" size={24} color={colors.mutedForeground} />
            </View>
            <Text style={styles.emptyText}>Сохранённых предложений пока нет</Text>
            <Text style={styles.emptySubtext}>Сохраняйте интересные предложения, чтобы вернуться к ним позже</Text>
          </Animated.View>
        ) : null
      ) : isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : partnersError && !partners ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Ionicons name="cloud-offline-outline" size={24} color={colors.mutedForeground} /></View>
          <Text style={styles.emptyText}>Партнёры временно недоступны</Text>
          <Text style={styles.emptySubtext}>Проверьте соединение и повторите загрузку.</Text>
          <AnimatedPressable onPress={() => void refetchPartners()} style={styles.retryButton} testID="partners-retry">
            <Text style={styles.retryButtonText}>Повторить</Text>
          </AnimatedPressable>
        </View>
      ) : !partners?.length ? (
        <Animated.View entering={FadeInDown.duration(600).delay(300)} style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="storefront-outline" size={24} color={colors.mutedForeground} />
          </View>
          <Text style={styles.emptyText}>Партнёров не найдено</Text>
          <Text style={styles.emptySubtext}>Попробуйте выбрать другую категорию</Text>
        </Animated.View>
      ) : (
        <FlatList
          data={partners}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.list}
          scrollEnabled={!!partners.length}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const bg = getCategoryBg(item.category, colors);
            const accent = getCategoryAccent(item.category, colors);
            return (
              <Animated.View entering={FadeInDown.duration(400).delay(300 + index * 50)} style={{ flex: 1 }}>
                   <AnimatedPressable
                     style={[styles.partnerCard, { backgroundColor: bg }]}
                     onPress={() => router.push({ pathname: "/payment" as never, params: { mode: "partner", partnerId: String(item.id) } })}
                     testID={`partner-card-${item.id}`}
                   >
                  <View style={styles.partnerCardTop}>
                    <PartnerLogo name={item.name} logoUrl={item.logoUrl} />
                    <Text style={[styles.multiplierText, { color: accent }]}>
                      {item.bonusMultiplier}×
                    </Text>
                  </View>
                  <Text style={styles.partnerName} numberOfLines={1}>{item.name}</Text>
                  {item.description ? (
                    <Text style={styles.partnerDesc} numberOfLines={2}>{item.description}</Text>
                  ) : null}
                  <View style={styles.partnerBadge}>
                    <Text style={styles.partnerBadgeText}>
                      {CATEGORY_LABELS[item.category] ?? item.category}
                    </Text>
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