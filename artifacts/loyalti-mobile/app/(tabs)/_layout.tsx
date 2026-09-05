import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";

import { useColors } from "@/hooks/useColors";
import { AuthLoadingScreen, default as AuthScreen } from "@/components/AuthScreen";
import { useAuth } from "@/context/AuthContext";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Главная</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="score">
        <Icon sf={{ default: "gauge.medium", selected: "gauge.medium" }} />
        <Label>Рейтинг</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history">
        <Icon sf={{ default: "clock", selected: "clock.fill" }} />
        <Label>История</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="partners">
        <Icon sf={{ default: "storefront", selected: "storefront.fill" }} />
        <Label>Партнёры</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} />
        <Label>Профиль</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.foreground,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={80}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Главная",
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? "house.fill" : "house"} tintColor={color} size={24} />
            ) : (
              <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="score"
        options={{
          title: "Рейтинг",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="gauge.medium" tintColor={color} size={24} />
            ) : (
              <Ionicons name="speedometer-outline" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "История",
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? "clock.fill" : "clock"} tintColor={color} size={24} />
            ) : (
              <Ionicons name={focused ? "time" : "time-outline"} size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="partners"
        options={{
          title: "Партнёры",
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? "storefront.fill" : "storefront"} tintColor={color} size={24} />
            ) : (
              <Ionicons name={focused ? "storefront" : "storefront-outline"} size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Профиль",
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? "person.crop.circle.fill" : "person.crop.circle"} tintColor={color} size={24} />
            ) : (
              <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { status } = useAuth();

  if (status === "loading") return <AuthLoadingScreen />;
  if (status === "unauthenticated") return <AuthScreen />;

  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}