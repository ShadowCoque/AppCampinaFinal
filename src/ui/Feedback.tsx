import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";

import { colors, radius, spacing, typography } from "../theme";

/* ------------------------------------------------------------------ */
/* Badge de estado                                                     */
/* ------------------------------------------------------------------ */

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "gold";

const TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: "#EEF2F7", fg: colors.textMuted },
  info: { bg: colors.infoSoft, fg: colors.info },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  gold: { bg: colors.goldSoft, fg: "#8A6A15" },
};

export function Badge({
  label,
  tone = "neutral",
  icon,
}: {
  label: string;
  tone?: BadgeTone;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const palette = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={palette.fg} /> : null}
      <Text style={[styles.badgeText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Nota informativa                                                    */
/* ------------------------------------------------------------------ */

export function InfoNote({
  children,
  tone = "info",
  icon = "information-circle",
  style,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}) {
  const palette = TONES[tone];
  return (
    <View style={[styles.note, { backgroundColor: palette.bg }, style]}>
      <Ionicons name={icon} size={17} color={palette.fg} style={styles.noteIcon} />
      <Text style={[styles.noteText, { color: palette.fg }]}>{children}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Estado vacío                                                        */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon = "folder-open-outline",
  title,
  message,
  children,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.navyLight} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Fila etiqueta / valor (pantallas de resumen)                        */
/* ------------------------------------------------------------------ */

export function DataRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={styles.dataValue}>{value?.trim() ? value : "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 11.5, fontWeight: "800", letterSpacing: 0.2 },

  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  noteIcon: { marginTop: 1 },
  noteText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "500" },

  empty: { alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.skySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  emptyTitle: { ...typography.cardTitle, fontSize: 16, textAlign: "center" },
  emptyMessage: { ...typography.caption, textAlign: "center", marginTop: spacing.xs, maxWidth: 320 },

  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dataLabel: { fontSize: 13, color: colors.textMuted, flexShrink: 0, maxWidth: "48%" },
  dataValue: { fontSize: 13.5, color: colors.text, fontWeight: "600", flex: 1, textAlign: "right" },
});
