import { Ionicons } from "@expo/vector-icons";
import { useGetMe, useUpdateMe, useListMyVerifications, useRequestKycUploadUrl, useVerifyIdentity, useVerifyIncome, getGetMeQueryKey, getListMyVerificationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";
import { AnimatedPressable } from "@/components/AnimatedPressable";
import { BrandMark } from "@/components/BrandMark";
import { useAuth } from "@/context/AuthContext";

const STATUS_LABELS: Record<string, string> = { novice: "Новичок", silver: "Серебро", gold: "Золото", platinum: "Платина" };
const STATUS_COLORS: Record<string, string> = { novice: "#64748B", silver: "#94A3B8", gold: "#D4AF37", platinum: "#C084FC" };

type SettingItemProps = {
  icon: string;
  label: string;
  value?: string;
  colors: ReturnType<typeof useColors>;
  isLast?: boolean;
  onPress?: () => void;
};

function SettingItem({ icon, label, value, colors, isLast, onPress }: SettingItemProps) {
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={{ disabled: !onPress }}
      style={{ flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: colors.border, opacity: onPress ? 1 : 0.7 }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", marginRight: 16, borderWidth: 1, borderColor: colors.border }}>
        <Ionicons name={icon as any} size={20} color={colors.foreground} />
      </View>
      <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: colors.foreground }}>{label}</Text>
      {value ? <Text style={{ fontSize: 14, color: colors.mutedForeground, marginRight: 8, fontWeight: "500" }}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
    </AnimatedPressable>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const { data: user, isLoading, isError, error, refetch } = useGetMe();
  const updateMe = useUpdateMe();
  const requestKycUploadUrl = useRequestKycUploadUrl();
  const verifyIdentity = useVerifyIdentity();
  const verifyIncome = useVerifyIncome();
  const { data: verificationApplications } = useListMyVerifications();
  const verificationList = Array.isArray(verificationApplications) ? verificationApplications : [];
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [verificationType, setVerificationType] = useState<"identity" | "income" | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 16,
      paddingHorizontal: 20,
      paddingBottom: Platform.OS === "web" ? 34 + 84 : 100,
    },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
    title: { fontSize: 28, fontWeight: "800", color: colors.foreground, letterSpacing: -1 },
    
    passportWrapper: { marginBottom: 32, borderRadius: colors.radius * 1.5, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
    passportCard: { 
      borderRadius: colors.radius * 1.5, 
      padding: 24, 
      borderWidth: 1,
      borderColor: isDark ? colors.border : 'rgba(255,255,255,0.1)',
      overflow: 'hidden'
    },
    passportTop: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
    avatar: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: "rgba(255,255,255,0.1)",
      alignItems: "center", justifyContent: "center",
      marginRight: 16,
      borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
    },
    avatarText: { fontSize: 28, fontWeight: "700", color: "#FFFFFF" },
    passportInfo: { flex: 1 },
    userName: { fontSize: 22, fontWeight: "800", color: "#FFFFFF", marginBottom: 4, letterSpacing: -0.5 },
    userPhone: { fontSize: 14, color: "#FFFFFF", opacity: 0.8, fontWeight: "500" },
    
    passportDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.1)", marginVertical: 16 },
    
    passportBottom: { flexDirection: "row", justifyContent: "space-between" },
    passportStat: { flex: 1 },
    passportStatLabel: { fontSize: 12, color: "#FFFFFF", opacity: 0.7, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
    passportStatValue: { fontSize: 24, fontWeight: "800", color: "#FFFFFF", fontVariant: ["tabular-nums"] },
    
    section: { backgroundColor: colors.card, borderRadius: colors.radius, paddingHorizontal: 20, marginBottom: 24, borderWidth: 1, borderColor: colors.border },
    sectionTitle: { fontSize: 12, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 1.5, paddingTop: 24, paddingBottom: 8 },
    logoutButton: {
      alignItems: "center",
      borderColor: colors.border,
      borderRadius: colors.radius,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "center",
      marginBottom: 24,
      minHeight: 52,
      paddingHorizontal: 16,
    },
    logoutText: { color: colors.destructive, fontSize: 15, fontWeight: "700", marginLeft: 8 },
    state: { alignItems: "center", paddingTop: 56, paddingHorizontal: 20 },
    stateTitle: { fontSize: 17, fontWeight: "800", color: colors.foreground, textAlign: "center" },
    stateText: { fontSize: 14, color: colors.mutedForeground, lineHeight: 20, textAlign: "center", marginTop: 8 },
    stateButton: { marginTop: 18, minHeight: 46, paddingHorizontal: 20, borderRadius: colors.radius, backgroundColor: colors.foreground, alignItems: "center", justifyContent: "center" },
    stateButtonText: { color: colors.background, fontSize: 14, fontWeight: "800" },
    modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
    modalCard: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === "web" ? 24 : insets.bottom + 20 },
    modalTitle: { fontSize: 20, fontWeight: "800", color: colors.foreground, marginBottom: 18 },
    inputLabel: { color: colors.mutedForeground, fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 12 },
    input: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.input, color: colors.foreground, paddingHorizontal: 14, fontSize: 16 },
    modalActions: { flexDirection: "row", gap: 10, marginTop: 22 },
    modalButton: { flex: 1, minHeight: 50, borderRadius: colors.radius, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
    modalButtonPrimary: { backgroundColor: colors.foreground, borderColor: colors.foreground },
    modalButtonText: { color: colors.foreground, fontSize: 14, fontWeight: "800" },
    modalButtonPrimaryText: { color: colors.background },
    editError: { color: colors.destructive, fontSize: 13, lineHeight: 18, marginTop: 12 },
  });

  const openEdit = () => {
    setEditName(user?.name ?? "");
    setEditEmail(user?.email ?? "");
    setEditError(null);
    setIsEditing(true);
  };

  const saveProfile = async () => {
    if (!editName.trim()) {
      setEditError("Укажите имя.");
      return;
    }
    setEditError(null);
    try {
      const updated = await updateMe.mutateAsync({
        data: { name: editName.trim(), ...(editEmail.trim() ? { email: editEmail.trim() } : {}) },
      });
      queryClient.setQueryData(["/api/users/me"], updated);
      setIsEditing(false);
    } catch (saveError) {
      setEditError(saveError instanceof Error ? saveError.message : "Не удалось сохранить данные. Попробуйте ещё раз.");
    }
  };

  const submitDocument = async (type: "identity" | "income") => {
    setVerificationError(null);
    setVerificationType(type);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (picked.canceled || !picked.assets[0]?.uri) return;
      const asset = picked.assets[0];
      const contentType: "image/jpeg" | "image/png" | "image/webp" = asset.mimeType === "image/png" ? "image/png" : asset.mimeType === "image/webp" ? "image/webp" : "image/jpeg";
      const sourceResponse = await fetch(asset.uri);
      if (!sourceResponse.ok) throw new Error("Не удалось прочитать выбранный документ.");
      const blob = await sourceResponse.blob();
      const fileSize = asset.fileSize ?? blob.size;
      if (fileSize < 1 || fileSize > 10 * 1024 * 1024) {
        throw new Error("Выберите изображение размером до 10 МБ.");
      }
      const fileName = asset.fileName ?? `verification-${type}.${contentType === "image/png" ? "png" : "jpg"}`;
      const upload = await requestKycUploadUrl.mutateAsync({
        data: { name: fileName, size: fileSize, contentType },
      });
      const uploadResponse = await fetch(upload.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: blob,
      });
      if (!uploadResponse.ok) throw new Error("Хранилище не приняло файл. Повторите попытку.");
      const data = { objectPath: upload.objectPath, fileName, contentType, fileSize };
      await (type === "identity" ? verifyIdentity : verifyIncome).mutateAsync({ data });
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getListMyVerificationsQueryKey() });
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : "Не удалось отправить документ. Попробуйте ещё раз.");
    } finally {
      setVerificationType(null);
    }
  };

  if (isLoading) {
    return <View style={styles.container}><View style={styles.state}><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.stateText}>Загружаем профиль…</Text></View></View>;
  }

  if (isError || !user) {
    return (
      <View style={styles.container}>
        <View style={styles.state}>
          <Ionicons name="person-circle-outline" size={40} color={colors.mutedForeground} />
          <Text style={[styles.stateTitle, { marginTop: 14 }]}>{isError ? "Профиль временно недоступен" : "Данные профиля не найдены"}</Text>
          <Text style={styles.stateText}>
            {isError && error instanceof Error ? error.message : "Личные данные появятся после загрузки аккаунта."}
          </Text>
          <AnimatedPressable onPress={() => refetch()} style={styles.stateButton} testID="profile-retry">
            <Text style={styles.stateButtonText}>Повторить</Text>
          </AnimatedPressable>
        </View>
      </View>
    );
  }

  const statusColor = user ? (STATUS_COLORS[user.status] ?? STATUS_COLORS.silver) : STATUS_COLORS.silver;
  const profileEmpty = !user.name.trim() && !user.phone.trim();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.headerRow}>
          <Text style={styles.title}>Профиль</Text>
          <AnimatedPressable onPress={() => Alert.alert("Настройки", "Выберите нужный раздел ниже.")} accessibilityLabel="Открыть настройки" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="settings-outline" size={20} color={colors.foreground} />
          </AnimatedPressable>
        </Animated.View>

        {profileEmpty ? (
          <View style={styles.state}>
            <Ionicons name="person-circle-outline" size={40} color={colors.mutedForeground} />
            <Text style={[styles.stateTitle, { marginTop: 14 }]}>Личные данные пока не заполнены</Text>
            <Text style={styles.stateText}>Добавьте имя и email, чтобы ваш профиль был готов к использованию.</Text>
            <AnimatedPressable onPress={openEdit} style={styles.stateButton} testID="profile-empty-edit">
              <Text style={styles.stateButtonText}>Заполнить профиль</Text>
            </AnimatedPressable>
          </View>
        ) : (
          <>
        <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.passportWrapper}>
          <LinearGradient 
            colors={isDark ? ['#1E293B', '#0F172A'] : ['#0F172A', '#020617']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.passportCard}
          >
            <View style={styles.passportTop}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.passportInfo}>
                <Text style={styles.userName}>{user.name}</Text>
                <Text style={styles.userPhone}>{user.phone}</Text>
              </View>
              <BrandMark size={32} color="rgba(255,255,255,0.15)" />
            </View>
            
            <View style={styles.passportDivider} />
            
            <View style={styles.passportBottom}>
              <View style={styles.passportStat}>
                <Text style={styles.passportStatLabel}>Live Score</Text>
                <Text style={styles.passportStatValue}>{user.liveScore}</Text>
              </View>
              <View style={[styles.passportStat, { alignItems: "flex-end" }]}>
                <Text style={styles.passportStatLabel}>Статус</Text>
                <Text style={[styles.passportStatValue, { color: statusColor, fontSize: 18, marginTop: 4 }]}>
                  {STATUS_LABELS[user.status] ?? user.status}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(600).delay(300)}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Аккаунт</Text>
            <SettingItem icon="person-outline" label="Личные данные" value={user.name} colors={colors} onPress={openEdit} />
            <SettingItem icon="mail-outline" label="Email" value={user.email ?? "Не указан"} colors={colors} onPress={openEdit} />
            <SettingItem icon="call-outline" label="Телефон" value={user.phone} colors={colors} isLast />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(600).delay(350)}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Верификация</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19, marginBottom: 12 }}>
              Выберите проверку и загрузите изображение документа. Его увидят только вы и администратор.
            </Text>
            {([
              { type: "identity" as const, label: "Паспортные данные", description: "Фото или скан документа", status: user.identityVerificationStatus ?? "not_started" },
              { type: "income" as const, label: "Подтверждение дохода", description: "Фото или скан справки", status: user.incomeVerificationStatus ?? "not_started" },
            ]).map((item) => {
              const application = verificationList.find((candidate) => candidate.verificationType === item.type);
              const statusLabel = item.status === "approved" ? "Подтверждено" : item.status === "pending" ? "На проверке" : item.status === "rejected" ? "Нужна повторная подача" : "Не начата";
              const disabled = item.status === "approved" || item.status === "pending" || verificationType !== null;
              return (
                <View key={item.type} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Ionicons name={item.status === "approved" ? "checkmark-circle" : "shield-checkmark-outline"} size={22} color={item.status === "approved" ? colors.primary : colors.mutedForeground} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700" }}>{item.label}</Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 3 }}>{item.description} · {statusLabel}</Text>
                    </View>
                    {!disabled ? (
                      <AnimatedPressable onPress={() => void submitDocument(item.type)} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }} testID={`verification-${item.type}-upload`}>
                        {verificationType === item.type ? <ActivityIndicator color={colors.background} size="small" /> : <Text style={{ color: colors.background, fontWeight: "700", fontSize: 12 }}>{item.status === "rejected" ? "Повторить" : "Загрузить"}</Text>}
                      </AnimatedPressable>
                    ) : null}
                  </View>
                  {item.status === "rejected" && application?.rejectionReason ? <Text style={{ color: colors.destructive, fontSize: 12, lineHeight: 17, marginTop: 8, marginLeft: 34 }}>Причина: {application.rejectionReason}</Text> : null}
                </View>
              );
            })}
            {verificationError ? <Text style={{ color: colors.destructive, fontSize: 13, lineHeight: 18, marginTop: 8 }} accessibilityRole="alert">{verificationError}</Text> : null}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(600).delay(400)}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Приложение</Text>
            <SettingItem icon="notifications-outline" label="Уведомления" colors={colors} onPress={() => Alert.alert("Уведомления", "Push-уведомления пока недоступны в этой версии приложения.")} />
            <SettingItem icon="shield-outline" label="Безопасность" colors={colors} onPress={() => Alert.alert("Безопасность", "Управление сессией доступно через выход из аккаунта. Дополнительные настройки появятся позже.")} />
            <SettingItem icon="help-circle-outline" label="Правила бонусов" colors={colors} onPress={() => router.push("/rules")} />
            <SettingItem icon="document-text-outline" label="О приложении" value="1.0.0" colors={colors} isLast onPress={() => Alert.alert("ЛоялТи", "Live Score для прозрачных бонусов и аренды.\nВерсия 1.0.0")} />
          </View>
        </Animated.View>

        <AnimatedPressable
          accessibilityRole="button"
          onPress={signOut}
          style={styles.logoutButton}
          testID="logout-button"
        >
          <Ionicons name="log-out-outline" size={20} color={colors.destructive} />
          <Text style={styles.logoutText}>Выйти из аккаунта</Text>
        </AnimatedPressable>
          </>
        )}
      </ScrollView>
      <Modal visible={isEditing} transparent animationType="slide" onRequestClose={() => setIsEditing(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Личные данные</Text>
            <Text style={styles.inputLabel}>Имя</Text>
            <TextInput value={editName} onChangeText={setEditName} style={styles.input} placeholder="Ваше имя" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" testID="profile-name-input" />
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput value={editEmail} onChangeText={setEditEmail} style={styles.input} placeholder="Не указан" placeholderTextColor={colors.mutedForeground} keyboardType="email-address" autoCapitalize="none" testID="profile-email-input" />
            <Text style={styles.inputLabel}>Телефон</Text>
            <TextInput value={user.phone} style={[styles.input, { opacity: 0.6 }]} editable={false} accessibilityLabel="Телефон нельзя изменить" />
            {editError ? <Text style={styles.editError} testID="profile-edit-error">{editError}</Text> : null}
            <View style={styles.modalActions}>
              <AnimatedPressable onPress={() => setIsEditing(false)} style={styles.modalButton}><Text style={styles.modalButtonText}>Отмена</Text></AnimatedPressable>
              <AnimatedPressable onPress={saveProfile} disabled={updateMe.isPending} style={[styles.modalButton, styles.modalButtonPrimary, updateMe.isPending && { opacity: 0.6 }]} testID="profile-save-button">
                {updateMe.isPending ? <ActivityIndicator color={colors.background} /> : <Text style={[styles.modalButtonText, styles.modalButtonPrimaryText]}>Сохранить</Text>}
              </AnimatedPressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}