import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import {
  AVISO_PRIVACIDAD,
  FECHA_VIGENCIA_AVISO,
  RESPONSABLE,
  VERSION_AVISO,
} from "../src/domain/privacidad";
import { formatFechaLarga } from "../src/domain/fechas";
import { colors, radius, spacing, typography } from "../src/theme";

export default function PrivacidadScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.cabecera}>
        <View style={styles.escudo}>
          <Ionicons name="shield-checkmark" size={24} color={colors.gold} />
        </View>
        <Text style={styles.titulo}>Aviso de privacidad</Text>
        <Text style={styles.subtitulo}>
          Tratamiento de datos personales conforme a la Ley Orgánica de Protección de Datos
          Personales del Ecuador
        </Text>
        <View style={styles.version}>
          <Text style={styles.versionTexto}>
            Versión {VERSION_AVISO} · vigente desde el {formatFechaLarga(FECHA_VIGENCIA_AVISO)}
          </Text>
        </View>
      </View>

      {AVISO_PRIVACIDAD.map((seccion) => (
        <View key={seccion.titulo} style={styles.seccion}>
          <Text style={styles.seccionTitulo}>{seccion.titulo}</Text>
          {seccion.parrafos.map((parrafo, indice) => (
            <View key={indice} style={styles.parrafoFila}>
              <View style={styles.vinieta} />
              <Text style={styles.parrafo}>{parrafo}</Text>
            </View>
          ))}
        </View>
      ))}

      <View style={styles.contacto}>
        <Ionicons name="mail" size={18} color={colors.navy} />
        <View style={styles.contactoTexto}>
          <Text style={styles.contactoTitulo}>Canal para el ejercicio de sus derechos</Text>
          <Text style={styles.contactoValor}>{RESPONSABLE.correoContacto}</Text>
          <Text style={styles.contactoNota}>
            También puede acercarse a la oficina del Área de Socios del Club, con su documento de
            identidad.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },

  cabecera: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
  },
  escudo: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  titulo: {
    color: colors.textOnDark,
    fontSize: 20,
    fontWeight: "800",
    marginTop: spacing.md,
    textAlign: "center",
  },
  subtitulo: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  version: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(208,163,62,0.2)",
  },
  versionTexto: { color: colors.gold, fontSize: 11.5, fontWeight: "700" },

  seccion: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  seccionTitulo: { ...typography.sectionTitle, fontSize: 15, marginBottom: spacing.sm },
  parrafoFila: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  vinieta: {
    width: 5,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    marginTop: 8,
  },
  parrafo: { flex: 1, fontSize: 13.5, color: colors.text, lineHeight: 20 },

  contacto: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.skySoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  contactoTexto: { flex: 1 },
  contactoTitulo: { fontSize: 13.5, fontWeight: "800", color: colors.navy },
  contactoValor: { fontSize: 14, fontWeight: "700", color: colors.sky, marginTop: 3 },
  contactoNota: { fontSize: 12.5, color: colors.textMuted, marginTop: 6, lineHeight: 18 },
});
