import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "../theme";
import { Field } from "./Field";

/* ------------------------------------------------------------------ */
/* Checkbox                                                            */
/* ------------------------------------------------------------------ */

type CheckboxProps = {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  error?: string;
  disabled?: boolean;
};

export function Checkbox({ label, description, checked, onChange, error, disabled }: CheckboxProps) {
  return (
    <View>
      <Pressable
        onPress={() => !disabled && onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled: !!disabled }}
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.checkRow,
          checked && styles.checkRowActive,
          !!error && styles.checkRowError,
          pressed && !disabled && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        <View style={[styles.box, checked && styles.boxChecked]}>
          {checked ? <Ionicons name="checkmark" size={15} color={colors.textOnDark} /> : null}
        </View>
        <View style={styles.checkText}>
          <Text style={styles.checkLabel}>{label}</Text>
          {description ? <Text style={styles.checkDesc}>{description}</Text> : null}
        </View>
      </Pressable>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Grupo de opciones (una sola selección, estilo segmentado)           */
/* ------------------------------------------------------------------ */

export type ChoiceOption<T extends string> = { value: T; label: string };

type OptionGroupProps<T extends string> = {
  label?: string;
  options: ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  required?: boolean;
  helper?: string;
  error?: string;
  /** Distribuye las opciones en columna en lugar de fila. */
  vertical?: boolean;
};

export function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  required,
  helper,
  error,
  vertical,
}: OptionGroupProps<T>) {
  return (
    <Field label={label} required={required} helper={helper} error={error}>
      <View style={[styles.group, vertical && styles.groupVertical]}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={option.label}
              style={({ pressed }) => [
                styles.chip,
                !vertical && styles.chipFlex,
                active && styles.chipActive,
                !!error && !active && styles.chipError,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name={active ? "radio-button-on" : "radio-button-off"}
                size={17}
                color={active ? colors.navy : colors.textFaint}
              />
              <Text style={[styles.chipLabel, active && styles.chipLabelActive]} numberOfLines={2}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Field>
  );
}

const styles = StyleSheet.create({
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.4,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    marginTop: spacing.sm,
  },
  checkRowActive: { borderColor: colors.navy, backgroundColor: colors.skySoft },
  checkRowError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  boxChecked: { backgroundColor: colors.navy, borderColor: colors.navy },
  checkText: { flex: 1 },
  checkLabel: { fontSize: 14.5, fontWeight: "700", color: colors.text, lineHeight: 20 },
  checkDesc: { fontSize: 12.5, color: colors.textMuted, marginTop: 3, lineHeight: 18 },
  errorText: { fontSize: 12.5, color: colors.danger, fontWeight: "600", marginTop: spacing.xs },

  group: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  groupVertical: { flexDirection: "column" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.4,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipFlex: { flexGrow: 1, flexBasis: "40%" },
  chipActive: { borderColor: colors.navy, backgroundColor: colors.skySoft },
  chipError: { borderColor: colors.danger },
  chipLabel: { flex: 1, fontSize: 14.5, fontWeight: "600", color: colors.text },
  chipLabelActive: { color: colors.navy, fontWeight: "800" },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
