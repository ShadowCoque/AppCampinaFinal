import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";

import { colors, radius, shadow, spacing, typography } from "../theme";

type Props = {
  title?: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  children?: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
};

export function Card({ title, subtitle, icon, children, style, padded = true }: Props) {
  return (
    <View style={[styles.card, padded && styles.padded, style]}>
      {title ? (
        <View style={styles.head}>
          {icon ? (
            <View style={styles.iconBadge}>
              <Ionicons name={icon} size={17} color={colors.navy} />
            </View>
          ) : null}
          <View style={styles.headText}>
            <Text style={typography.sectionTitle}>{title}</Text>
            {subtitle ? <Text style={[typography.caption, styles.subtitle]}>{subtitle}</Text> : null}
          </View>
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
    ...shadow.card,
  },
  padded: { padding: spacing.lg },
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, marginBottom: spacing.md },
  headText: { flex: 1 },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.skySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: { marginTop: 2 },
});
