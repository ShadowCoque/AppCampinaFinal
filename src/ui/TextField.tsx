import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  KeyboardTypeOptions,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, radius, spacing } from "../theme";
import { Field } from "./Field";

type Props = {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  helper?: string;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  maxLength?: number;
  multiline?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  onBlur?: () => void;
  editable?: boolean;
  showCounter?: boolean;
  /** Oculta el texto: se usa para las contraseñas de acceso al servidor. */
  secureTextEntry?: boolean;
};

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  required,
  helper,
  error,
  keyboardType,
  autoCapitalize = "sentences",
  maxLength,
  multiline,
  icon,
  onBlur,
  editable = true,
  showCounter,
  secureTextEntry,
}: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <Field label={label} required={required} helper={helper} error={error}>
      <View
        style={[
          styles.box,
          multiline && styles.boxMultiline,
          focused && styles.boxFocused,
          !!error && styles.boxError,
          !editable && styles.boxDisabled,
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={focused ? colors.navy : colors.textFaint}
            style={styles.icon}
          />
        ) : null}

        <TextInput
          style={[styles.input, multiline && styles.inputMultiline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          maxLength={maxLength}
          multiline={multiline}
          editable={editable}
          secureTextEntry={secureTextEntry}
          accessibilityLabel={label ?? placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
        />

        {showCounter && maxLength ? (
          <Text style={styles.counter}>
            {value.length}/{maxLength}
          </Text>
        ) : null}
      </View>
    </Field>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    borderWidth: 1.4,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
  },
  boxMultiline: { alignItems: "flex-start", paddingVertical: spacing.sm, minHeight: 96 },
  boxFocused: { borderColor: colors.sky, backgroundColor: colors.surface },
  boxError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  boxDisabled: { backgroundColor: "#EEF2F6", opacity: 0.75 },
  icon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    fontSize: 15.5,
    color: colors.text,
    paddingVertical: spacing.sm + 2,
  },
  inputMultiline: { textAlignVertical: "top", minHeight: 80 },
  counter: { fontSize: 11, color: colors.textFaint, marginLeft: spacing.sm, fontWeight: "700" },
});
