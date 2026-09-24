import { Ionicons } from "@expo/vector-icons";
import { Href, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { listarSolicitudes } from "../src/data/solicitudes";
import { RESUMEN_LOPDP } from "../src/domain/privacidad";
import {
  describirResumen,
  sincronizar,
  ultimoResumen,
  type ResumenSincronizacion,
} from "../src/services/servidor";
import { colors, radius, shadow, spacing, typography } from "../src/theme";

type Modulo = {
  key: string;
  titulo: string;
  descripcion: string;
  icono: keyof typeof Ionicons.glyphMap;
  destino: Href;
  destacado?: boolean;
  contador?: number;
};

/**
 * Portal de la tableta del Área de Socios.
 *
 * Los módulos son los que declara el informe CLC-TI-010 versión 6, numeral 5.2,
 * y solo esos: Afiliación, Actualización de datos y Expediente digital del
 * socio. El cuarto módulo del informe —la Bandeja de tareas— no vive aquí: es
 * una página web a la que la Jefatura del Área de Socios, Contabilidad y la
 * Gerencia entran «desde su propio computador».
 *
 * No hay perfil de Contabilidad ni módulo de credenciales. La facturación se
 * resuelve en el CRM de SAFI a partir del registro ya creado y queda fuera del
 * alcance (numerales 1 y 10 del informe), y la credencial la imprime el sistema
 * Card Five con los datos que toma de Autoparking.
 */
export default function Portal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [pendientesAfiliacion, setPendientesAfiliacion] = useState(0);
  const [envio, setEnvio] = useState<ResumenSincronizacion | null>(null);

  useFocusEffect(
    useCallback(() => {
      let activo = true;
      const contar = async () => {
        const solicitudes = await listarSolicitudes();
        if (!activo) return;
        setPendientesAfiliacion(
          solicitudes.filter((s) => !["APROBADA", "RECHAZADA"].includes(s.estado)).length
        );
      };
      void (async () => {
        await contar();
        if (activo) setEnvio(await ultimoResumen());
        // Al volver al portal se entrega lo pendiente y se trae el avance.
        const resumen = await sincronizar();
        if (!activo) return;
        setEnvio(resumen);
        await contar();
      })();
      return () => {
        activo = false;
      };
    }, [])
  );

  const aviso = describirResumen(envio);
  const colorAviso =
    aviso.tono === "success"
      ? colors.success
      : aviso.tono === "danger"
        ? colors.danger
        : aviso.tono === "warning"
          ? colors.warning
          : colors.info;

  const modulos = useMemo<Modulo[]>(
    () => [
      {
        key: "afiliacion",
        titulo: "Nueva afiliación",
        descripcion: "Registro guiado del socio, con su consentimiento y su firma.",
        icono: "person-add",
        destino: "/afiliacion",
        destacado: true,
      },
      {
        key: "solicitudes",
        titulo: "Expediente digital",
        descripcion: "Seguimiento del estado de cada afiliación y su documentación.",
        icono: "documents",
        destino: "/solicitudes",
        contador: pendientesAfiliacion,
      },
      {
        key: "actualizacion",
        titulo: "Actualización de datos",
        descripcion: "Corregir la ficha o la fotografía de un socio ya registrado.",
        icono: "sync-circle",
        destino: "/actualizacion",
      },
      {
        key: "mi-firma",
        titulo: "Mi firma",
        descripcion:
          "Cargar la firma del funcionario para las constancias del reverso. Una sola vez, con su propio usuario.",
        icono: "create",
        destino: "/mi-firma",
      },
      {
        key: "configuracion",
        titulo: "Configuración y envío",
        descripcion:
          "Funcionario que opera la tableta, servidor institucional y envío de lo registrado sin conexión.",
        icono: "settings",
        destino: "/configuracion",
      },
    ],
    [pendientesAfiliacion]
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}>
        <Image
          source={require("../assets/images/brand/logo-white.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Club La Campiña Country Club"
        />
        <Text style={styles.heroTitle}>Área de Socios</Text>
        <Text style={styles.heroSubtitle}>Afiliación, expediente digital y actualización de datos</Text>
      </View>

      <View style={styles.body}>
        <Pressable
          onPress={() => router.push("/configuracion")}
          accessibilityRole="button"
          accessibilityLabel={`Envío al servidor: ${aviso.titulo}`}
          style={({ pressed }) => [styles.envio, { borderLeftColor: colorAviso }, pressed && styles.pressed]}
        >
          <Ionicons
            name={
              aviso.tono === "success"
                ? "cloud-done"
                : aviso.tono === "danger"
                  ? "cloud-offline"
                  : "cloud-upload"
            }
            size={20}
            color={colorAviso}
          />
          <View style={styles.envioTexto}>
            <Text style={styles.envioTitulo}>{aviso.titulo}</Text>
            {aviso.detalle ? (
              <Text style={styles.envioDetalle} numberOfLines={3}>
                {aviso.detalle}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
        </Pressable>

        {modulos.map((modulo) => (
          <Pressable
            key={modulo.key}
            onPress={() => router.push(modulo.destino)}
            accessibilityRole="button"
            accessibilityLabel={modulo.titulo}
            accessibilityHint={modulo.descripcion}
            style={({ pressed }) => [
              styles.modulo,
              modulo.destacado && styles.moduloDestacado,
              pressed && styles.pressed,
            ]}
          >
            <View
              style={[styles.moduloIcono, modulo.destacado && styles.moduloIconoDestacado]}
            >
              <Ionicons
                name={modulo.icono}
                size={21}
                color={modulo.destacado ? colors.gold : colors.navy}
              />
            </View>

            <View style={styles.moduloTexto}>
              <View style={styles.moduloTituloFila}>
                <Text
                  style={[styles.moduloTitulo, modulo.destacado && styles.moduloTituloDestacado]}
                >
                  {modulo.titulo}
                </Text>
                {modulo.contador ? (
                  <View style={styles.contador}>
                    <Text style={styles.contadorTexto}>{modulo.contador}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[
                  styles.moduloDescripcion,
                  modulo.destacado && styles.moduloDescripcionDestacado,
                ]}
              >
                {modulo.descripcion}
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={19}
              color={modulo.destacado ? "rgba(255,255,255,0.7)" : colors.textFaint}
            />
          </Pressable>
        ))}

        <Pressable
          onPress={() => router.push("/privacidad")}
          accessibilityRole="button"
          style={({ pressed }) => [styles.lopdp, pressed && styles.pressed]}
        >
          <Ionicons name="shield-checkmark" size={19} color={colors.navy} />
          <View style={styles.lopdpTexto}>
            <Text style={styles.lopdpTitulo}>Protección de datos personales</Text>
            <Text style={styles.lopdpDescripcion} numberOfLines={3}>
              {RESUMEN_LOPDP}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
        </Pressable>

        <Text style={styles.pie}>
          Club Social y Deportivo de Oficiales de la FAE (Club La Campiña){"\n"}
          Aplicación institucional · versión 2.2
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xxl },

  hero: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl + spacing.lg,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    alignItems: "center",
  },
  logo: { width: 250, height: 82 },
  heroTitle: {
    color: colors.textOnDark,
    fontSize: 22,
    fontWeight: "800",
    marginTop: spacing.lg,
    letterSpacing: -0.2,
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    marginTop: spacing.xs,
    textAlign: "center",
  },

  body: { paddingHorizontal: spacing.lg, marginTop: -spacing.xxl },

  envio: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 5,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.raised,
  },
  envioTexto: { flex: 1 },
  envioTitulo: { fontSize: 13.5, fontWeight: "800", color: colors.text },
  envioDetalle: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },

  perfilCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.raised,
  },
  perfilRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  perfilBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.4,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  perfilBtnActivo: { backgroundColor: colors.navy, borderColor: colors.navy },
  perfilTexto: { fontSize: 13.5, fontWeight: "700", color: colors.navy },
  perfilTextoActivo: { color: colors.textOnDark },

  modulo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.md,
    ...shadow.card,
  },
  moduloDestacado: { backgroundColor: colors.navy, borderColor: colors.navy },
  moduloIcono: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.skySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  moduloIconoDestacado: { backgroundColor: "rgba(255,255,255,0.12)" },
  moduloTexto: { flex: 1 },
  moduloTituloFila: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  moduloTitulo: { fontSize: 15.5, fontWeight: "800", color: colors.text, flexShrink: 1 },
  moduloTituloDestacado: { color: colors.textOnDark },
  moduloDescripcion: { fontSize: 12.5, color: colors.textMuted, marginTop: 3, lineHeight: 17 },
  moduloDescripcionDestacado: { color: "rgba(255,255,255,0.72)" },
  contador: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  contadorTexto: { fontSize: 11.5, fontWeight: "800", color: "#3A2B06" },

  lopdp: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#EFDFB8",
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  lopdpTexto: { flex: 1 },
  lopdpTitulo: { fontSize: 14, fontWeight: "800", color: colors.navy },
  lopdpDescripcion: { fontSize: 12, color: "#7A5F17", marginTop: 3, lineHeight: 17 },

  pie: {
    ...typography.caption,
    textAlign: "center",
    marginTop: spacing.xl,
    fontSize: 11.5,
    lineHeight: 17,
  },
  pressed: { opacity: 0.85 },
});
