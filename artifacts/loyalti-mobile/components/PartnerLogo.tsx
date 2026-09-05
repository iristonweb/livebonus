import { Image } from "react-native";
import { SvgUri } from "react-native-svg";
import { Text, View } from "react-native";
import { useEffect, useState } from "react";

type PartnerLogoProps = {
  name: string;
  logoUrl?: string | null;
  size?: number;
};

function getLogoUri(logoUrl: string): string {
  if (/^https?:\/\//i.test(logoUrl)) return logoUrl;

  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "";
  const path = logoUrl.startsWith("/partner-logos/")
    ? `/api${logoUrl}`
    : logoUrl;
  return `${baseUrl}${path}`;
}

export function PartnerLogo({ name, logoUrl, size = 44 }: PartnerLogoProps) {
  const [hasError, setHasError] = useState(false);
  const normalizedLogoUrl = logoUrl?.trim() ?? "";

  useEffect(() => {
    setHasError(false);
  }, [normalizedLogoUrl]);

  const fallback = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#E8EEFF",
      }}
    >
      <Text style={{ fontSize: size * 0.42, fontWeight: "800", color: "#2244C3" }}>
        {name.trim().charAt(0) || "?"}
      </Text>
    </View>
  );

  if (!normalizedLogoUrl || hasError) return fallback;

  const uri = getLogoUri(normalizedLogoUrl);
  if (/\.svg(?:$|[?#])/i.test(uri)) {
    return (
      <SvgUri
        uri={uri}
        width={size}
        height={size}
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size * 0.25 }}
      resizeMode="contain"
      onError={() => setHasError(true)}
    />
  );
}