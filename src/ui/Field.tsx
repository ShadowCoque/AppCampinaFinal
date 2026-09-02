import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, spacing, typography } from "../theme";

type Props = {
  label?: string;
  required?: boolean;
  helper?: string;
  error?: string;
  children: React.ReactNode;
};

/**
 * Envoltorio común de todos los controles del formulario:
 * etiqueta, marca de obligatorio, texto de ayuda y mensaje de error.
 */
export function Field({ label, required, helper, error, children }: Props) {
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}

      {children}

      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={14} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  label: { ...typography.label, marginBottom: spacing.xs + 2 },
  required: { color: colors.danger, fontWeight: "800" },
  helper: { ...typography.caption, marginTop: spacing.xs + 1 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.xs + 1 },
  errorText: { flex: 1, fontSize: 12.5, color: colors.danger, fontWeight: "600", lineHeight: 17 },
});
