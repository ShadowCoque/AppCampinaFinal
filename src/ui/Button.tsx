import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

import { colors, radius, shadow, spacing } from "../theme";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type Size = "md" | "lg";

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: "left" | "right";
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
};

const PALETTE: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.navy, fg: colors.textOnDark, border: colors.navy },
  secondary: { bg: colors.surface, fg: colors.navy, border: colors.borderStrong },
  ghost: { bg: "transparent", fg: colors.navy, border: "transparent" },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: "#F2C9C6" },
  gold: { bg: colors.gold, fg: "#3A2B06", border: colors.gold },
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "left",
  disabled,
  loading,
  fullWidth,
  style,
  accessibilityHint,
}: Props) {
  const palette = PALETTE[variant];
  const inactive = disabled || loading;
  const iconNode = icon ? (
    <Ionicons name={icon} size={size === "lg" ? 20 : 18} color={palette.fg} />
  ) : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        size === "lg" && styles.lg,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
        variant === "primary" && !inactive && shadow.card,
        fullWidth && styles.fullWidth,
        pressed && !inactive && styles.pressed,
        inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <View style={styles.content}>
          {iconPosition === "left" ? iconNode : null}
          <Text
            style={[
              styles.label,
              size === "lg" && styles.labelLg,
              { color: palette.fg },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {iconPosition === "right" ? iconNode : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  lg: { minHeight: 54, borderRadius: radius.lg },
  fullWidth: { alignSelf: "stretch" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.995 }] },
  disabled: { opacity: 0.45 },
  content: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { fontSize: 15, fontWeight: "800", letterSpacing: 0.1 },
  labelLg: { fontSize: 16.5 },
});
