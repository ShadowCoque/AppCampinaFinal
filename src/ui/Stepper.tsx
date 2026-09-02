import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "../theme";

export type StepDescriptor = { key: string; title: string; shortTitle: string };

type Props = {
  steps: StepDescriptor[];
  currentIndex: number;
  /** Índices ya validados; se muestran con check. */
  completed: Set<number>;
  onSelect?: (index: number) => void;
};

export function Stepper({ steps, currentIndex, completed, onSelect }: Props) {
  const indice = Math.max(0, Math.min(currentIndex, steps.length - 1));
  const current = steps[indice];
  const progress = steps.length ? ((indice + 1) / steps.length) * 100 : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={typography.overline}>
          Paso {indice + 1} de {steps.length}
        </Text>
        <Text style={styles.currentTitle} numberOfLines={1}>
          {current?.title}
        </Text>
      </View>

      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ now: indice + 1, min: 1, max: steps.length }}
      >
        <View style={[styles.trackFill, { width: `${progress}%` }]} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pills}
      >
        {steps.map((step, index) => {
          const isCurrent = index === indice;
          const isDone = completed.has(index) && !isCurrent;
          const reachable = index <= indice || completed.has(index);
          return (
            <Pressable
              key={step.key}
              disabled={!reachable || !onSelect}
              onPress={() => onSelect?.(index)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isCurrent, disabled: !reachable }}
              accessibilityLabel={`Paso ${index + 1}: ${step.title}`}
              style={[
                styles.pill,
                isCurrent && styles.pillCurrent,
                isDone && styles.pillDone,
                !reachable && styles.pillLocked,
              ]}
            >
              {isDone ? (
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              ) : (
                <Text style={[styles.pillIndex, isCurrent && styles.pillIndexCurrent]}>{index + 1}</Text>
              )}
              <Text
                style={[
                  styles.pillLabel,
                  isCurrent && styles.pillLabelCurrent,
                  isDone && styles.pillLabelDone,
                ]}
                numberOfLines={1}
              >
                {step.shortTitle}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headRow: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  currentTitle: { ...typography.title, fontSize: 18, marginTop: 2 },
  track: {
    height: 5,
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    marginHorizontal: spacing.lg,
    overflow: "hidden",
  },
  trackFill: { height: "100%", backgroundColor: colors.gold, borderRadius: radius.pill },
  pills: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  pillCurrent: { backgroundColor: colors.navy, borderColor: colors.navy },
  pillDone: { backgroundColor: colors.successSoft, borderColor: "#BDE3CE" },
  pillLocked: { opacity: 0.5 },
  pillIndex: { fontSize: 11.5, fontWeight: "800", color: colors.textMuted },
  pillIndexCurrent: { color: colors.textOnDark },
  pillLabel: { fontSize: 12.5, fontWeight: "700", color: colors.textMuted },
  pillLabelCurrent: { color: colors.textOnDark },
  pillLabelDone: { color: colors.success },
});
