import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "../theme";
import { formatFechaLarga, isoToDate, toISODate } from "../domain/fechas";
import { Field } from "./Field";

type Props = {
  label?: string;
  /** Valor en formato ISO corto: `AAAA-MM-DD`. */
  value: string;
  onChange: (isoDate: string) => void;
  required?: boolean;
  helper?: string;
  error?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  placeholder?: string;
};

export function DateField({
  label,
  value,
  onChange,
  required,
  helper,
  error,
  minimumDate,
  maximumDate,
  placeholder = "Seleccionar fecha",
}: Props) {
  const [open, setOpen] = useState(false);
  const current = isoToDate(value) ?? maximumDate ?? new Date();

  return (
    <Field label={label} required={required} helper={helper} error={error}>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label ?? "Seleccionar fecha"}
        accessibilityValue={{ text: value || "sin fecha" }}
        style={({ pressed }) => [
          styles.trigger,
          !!error && styles.triggerError,
          pressed && styles.triggerPressed,
        ]}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.textFaint} />
        <Text style={value ? styles.value : styles.placeholder}>
          {value ? formatFechaLarga(value) : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      {open ? (
        <View>
          <DateTimePicker
            value={current}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            locale="es-EC"
            onChange={(event, date) => {
              if (Platform.OS !== "ios") setOpen(false);
              if (event.type === "dismissed") return;
              if (date) onChange(toISODate(date));
            }}
          />
          {Platform.OS === "ios" ? (
            <Pressable onPress={() => setOpen(false)} style={styles.iosDone}>
              <Text style={styles.iosDoneText}>Listo</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Field>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 48,
    borderWidth: 1.4,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
  },
  triggerPressed: { backgroundColor: colors.skySoft, borderColor: colors.sky },
  triggerError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  value: { flex: 1, fontSize: 15.5, color: colors.text, fontWeight: "600" },
  placeholder: { flex: 1, fontSize: 15.5, color: colors.textFaint },
  iosDone: { alignSelf: "flex-end", paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  iosDoneText: { color: colors.navy, fontWeight: "800", fontSize: 15 },
});
