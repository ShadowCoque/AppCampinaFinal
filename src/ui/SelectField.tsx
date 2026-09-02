import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, radius, spacing, typography } from "../theme";
import { Field } from "./Field";

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  /** Texto secundario mostrado bajo la etiqueta dentro del selector. */
  description?: string;
  /** Cabecera de agrupación (p. ej. "Titulares", "Dependientes"). */
  group?: string;
};

type Props<T extends string> = {
  label?: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  required?: boolean;
  helper?: string;
  error?: string;
  title?: string;
  searchable?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
};

type Row<T extends string> = { kind: "header"; key: string; label: string } | { kind: "option"; key: string; option: SelectOption<T> };

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = "Seleccionar…",
  required,
  helper,
  error,
  title,
  searchable,
  icon,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((o) => o.value === value) ?? null;

  const rows = useMemo<Row<T>[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(q) ||
            o.description?.toLowerCase().includes(q) ||
            o.group?.toLowerCase().includes(q)
        )
      : options;

    const out: Row<T>[] = [];
    let currentGroup: string | undefined;
    for (const option of filtered) {
      if (option.group && option.group !== currentGroup) {
        currentGroup = option.group;
        out.push({ kind: "header", key: `h-${option.group}`, label: option.group });
      }
      out.push({ kind: "option", key: option.value, option });
    }
    return out;
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <Field label={label} required={required} helper={helper} error={error}>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={label ?? title ?? "Seleccionar"}
          accessibilityValue={{ text: selected?.label ?? "sin seleccionar" }}
          style={({ pressed }) => [
            styles.trigger,
            !!error && styles.triggerError,
            pressed && styles.triggerPressed,
          ]}
        >
          {icon ? <Ionicons name={icon} size={18} color={colors.textFaint} /> : null}
          <View style={styles.triggerText}>
            <Text style={selected ? styles.valueText : styles.placeholderText} numberOfLines={1}>
              {selected?.label ?? placeholder}
            </Text>
            {selected?.description ? (
              <Text style={styles.valueDesc} numberOfLines={1}>
                {selected.description}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
        </Pressable>
      </Field>

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.backdrop}>
          <SafeAreaView style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={typography.title}>{title ?? label ?? "Seleccionar"}</Text>
              <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar">
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>

            {searchable ? (
              <View style={styles.searchBox}>
                <Ionicons name="search" size={17} color={colors.textFaint} />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Buscar…"
                  placeholderTextColor={colors.textFaint}
                  autoCorrect={false}
                />
              </View>
            ) : null}

            <FlatList
              data={rows}
              keyExtractor={(r) => r.key}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.list}
              ListEmptyComponent={<Text style={styles.empty}>Sin resultados para “{query}”.</Text>}
              renderItem={({ item }) => {
                if (item.kind === "header") {
                  return <Text style={styles.groupHeader}>{item.label}</Text>;
                }
                const isSelected = item.option.value === value;
                return (
                  <Pressable
                    onPress={() => {
                      onChange(item.option.value);
                      close();
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    style={({ pressed }) => [
                      styles.option,
                      isSelected && styles.optionSelected,
                      pressed && styles.optionPressed,
                    ]}
                  >
                    <View style={styles.optionText}>
                      <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                        {item.option.label}
                      </Text>
                      {item.option.description ? (
                        <Text style={styles.optionDesc}>{item.option.description}</Text>
                      ) : null}
                    </View>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={22} color={colors.navy} />
                    ) : null}
                  </Pressable>
                );
              }}
            />
          </SafeAreaView>
        </View>
      </Modal>
    </>
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
    paddingVertical: spacing.sm,
  },
  triggerPressed: { backgroundColor: colors.skySoft, borderColor: colors.sky },
  triggerError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  triggerText: { flex: 1 },
  valueText: { fontSize: 15.5, color: colors.text, fontWeight: "600" },
  valueDesc: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  placeholderText: { fontSize: 15.5, color: colors.textFaint },

  backdrop: { flex: 1, backgroundColor: "rgba(8,32,60,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "86%",
    paddingTop: spacing.lg,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, paddingTop: spacing.sm },
  groupHeader: { ...typography.overline, marginTop: spacing.lg, marginBottom: spacing.xs },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  optionPressed: { backgroundColor: colors.surfaceAlt },
  optionSelected: { backgroundColor: colors.skySoft, borderColor: colors.sky },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 15.5, color: colors.text, fontWeight: "600" },
  optionLabelSelected: { color: colors.navy, fontWeight: "800" },
  optionDesc: { fontSize: 12.5, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  empty: { ...typography.caption, textAlign: "center", marginTop: spacing.xl },
});
