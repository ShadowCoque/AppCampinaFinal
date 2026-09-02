import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import SignatureScreen, { type SignatureViewRef } from "react-native-signature-canvas";

import {
  LEYENDA_FIRMA,
  MODO_FIRMA,
  MODO_FIRMA_META,
  firmaTieneValidezLegalPlena,
} from "../../domain/firmaElectronica";
import type { ConsentimientosForm, Errores } from "../../domain/formularioAfiliacion";
import {
  CONSENTIMIENTOS,
  RESPONSABLE,
  RESUMEN_LOPDP,
  VERSION_AVISO,
  type ClaveConsentimiento,
} from "../../domain/privacidad";
import { colors, radius, spacing, typography } from "../../theme";
import { Button, Card, Checkbox, InfoNote } from "../../ui";

type Props = {
  consentimientos: ConsentimientosForm;
  /** Firma en formato `data:image/png;base64,…`. */
  firmaUri: string | null;
  errores: Errores;
  onConsentimiento: (clave: ClaveConsentimiento, valor: boolean) => void;
  onFirma: (dataUri: string | null) => void;
  /** Bloquea el scroll del formulario mientras se traza la firma. */
  onDibujando: (dibujando: boolean) => void;
};

const ESTILO_LIENZO = `
  .m-signature-pad { box-shadow: none; border: none; margin: 0; }
  .m-signature-pad--body { border: none; }
  .m-signature-pad--footer { display: none; }
  body, html { background-color: #FFFFFF; margin: 0; padding: 0;
               overscroll-behavior: none; touch-action: none; }
`;

export function PasoConsentimiento({
  consentimientos,
  firmaUri,
  errores,
  onConsentimiento,
  onFirma,
  onDibujando,
}: Props) {
  const router = useRouter();
  const lienzo = useRef<SignatureViewRef>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    []
  );

  /**
   * La firma se captura sola: al levantar el dedo se pide el trazo al lienzo.
   * Así el usuario no tiene que acordarse de pulsar un botón para confirmarla,
   * que era la causa de que llegara vacía al paso de revisión.
   */
  const capturar = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => lienzo.current?.readSignature(), 400);
  }, []);

  const limpiar = () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    lienzo.current?.clearSignature();
    onFirma(null);
  };

  return (
    <>
      <Card
        title="Protección de datos personales"
        subtitle={`Aviso de privacidad versión ${VERSION_AVISO}`}
        icon="shield-checkmark"
      >
        <Text style={styles.resumen}>{RESUMEN_LOPDP}</Text>

        <Pressable
          onPress={() => router.push("/privacidad")}
          accessibilityRole="button"
          style={({ pressed }) => [styles.enlaceAviso, pressed && styles.presionado]}
        >
          <Ionicons name="document-text-outline" size={18} color={colors.navy} />
          <Text style={styles.enlaceTexto}>Leer el aviso de privacidad completo</Text>
          <Ionicons name="open-outline" size={16} color={colors.navy} />
        </Pressable>

        <View style={styles.derechos}>
          <Text style={styles.derechosTitulo}>Sus derechos como titular</Text>
          <Text style={styles.derechosTexto}>
            Acceso · Rectificación y actualización · Eliminación · Oposición · Portabilidad ·
            Suspensión del tratamiento
          </Text>
          <Text style={styles.derechosContacto}>
            Puede ejercerlos escribiendo a {RESPONSABLE.correoContacto} o acercándose al Área de
            Socios.
          </Text>
        </View>
      </Card>

      <Card
        title="Autorizaciones"
        subtitle="Marque cada autorización después de leerla."
        icon="checkmark-done-circle"
      >
        {CONSENTIMIENTOS.map((consentimiento) => (
          <Checkbox
            key={consentimiento.clave}
            label={`${consentimiento.titulo}${consentimiento.obligatorio ? " *" : ""}`}
            description={consentimiento.detalle}
            checked={consentimientos[consentimiento.clave]}
            onChange={(valor) => onConsentimiento(consentimiento.clave, valor)}
            error={errores[consentimiento.clave]}
          />
        ))}

        <InfoNote tone="neutral" icon="lock-closed-outline">
          Se registrará la fecha, la hora y la versión del aviso aceptado como evidencia del
          consentimiento otorgado.
        </InfoNote>
      </Card>

      <Card
        title="Firma del solicitante"
        subtitle={MODO_FIRMA_META[MODO_FIRMA].etiqueta}
        icon="create"
      >
        <Text style={styles.leyendaFirma}>{LEYENDA_FIRMA[MODO_FIRMA]}</Text>

        <InfoNote
          tone={firmaTieneValidezLegalPlena() ? "success" : "neutral"}
          icon={firmaTieneValidezLegalPlena() ? "shield-checkmark" : "information-circle-outline"}
        >
          {MODO_FIRMA_META[MODO_FIRMA].valorProbatorio}
        </InfoNote>

        {/*
          Cuando se contrate la firma electrónica de un solo uso, `MODO_FIRMA`
          pasa a "ONE_SHOT" y este lienzo se sustituye por el flujo de la entidad
          de certificación: envío del código de un solo uso al solicitante,
          confirmación y emisión del certificado. El resto del paso no cambia,
          porque la firma sigue viajando como imagen o como documento firmado en
          `firmaUri`.
        */}
        <View style={[styles.lienzo, !!errores.firma && styles.lienzoError]}>
          <SignatureScreen
            ref={lienzo}
            onOK={(dataUri) => onFirma(dataUri)}
            onEmpty={() => onFirma(null)}
            onClear={() => onFirma(null)}
            onBegin={() => onDibujando(true)}
            onEnd={() => {
              onDibujando(false);
              capturar();
            }}
            onLoadEnd={() => setListo(true)}
            onError={(error) => console.warn("[firma] Error en el lienzo:", error)}
            webStyle={ESTILO_LIENZO}
            descriptionText=""
            imageType="image/png"
            minWidth={1.4}
            maxWidth={3}
            penColor={colors.text}
            style={styles.lienzoInterno}
          />
        </View>

        <View style={styles.estadoFila}>
          {firmaUri ? (
            <>
              <Ionicons name="checkmark-circle" size={17} color={colors.success} />
              <Text style={styles.estadoOk}>Firma capturada.</Text>
            </>
          ) : (
            <>
              <Ionicons
                name={listo ? "hand-left-outline" : "hourglass-outline"}
                size={16}
                color={colors.textMuted}
              />
              <Text style={styles.estadoPendiente}>
                {listo
                  ? "Trace su firma en el recuadro. Se guarda automáticamente al levantar el dedo."
                  : "Preparando el lienzo…"}
              </Text>
            </>
          )}
        </View>

        {errores.firma ? (
          <View style={styles.errorFila}>
            <Ionicons name="alert-circle" size={14} color={colors.danger} />
            <Text style={styles.errorTexto}>{errores.firma}</Text>
          </View>
        ) : null}

        <Button
          label="Limpiar firma"
          variant="secondary"
          icon="refresh"
          onPress={limpiar}
          style={styles.botonLimpiar}
        />
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  resumen: { ...typography.body, fontSize: 13.5, lineHeight: 20 },
  enlaceAviso: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.4,
    borderColor: colors.sky,
    backgroundColor: colors.skySoft,
  },
  enlaceTexto: { flex: 1, fontSize: 14, fontWeight: "800", color: colors.navy },
  presionado: { opacity: 0.85 },

  derechos: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  derechosTitulo: { fontSize: 12.5, fontWeight: "800", color: colors.navy },
  derechosTexto: { fontSize: 12.5, color: colors.text, marginTop: 4, lineHeight: 18 },
  derechosContacto: { fontSize: 12, color: colors.textMuted, marginTop: 6, lineHeight: 17 },

  leyendaFirma: { ...typography.caption, fontSize: 13, lineHeight: 19 },
  lienzo: {
    height: 220,
    marginTop: spacing.md,
    borderWidth: 1.4,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  lienzoInterno: { flex: 1 },
  lienzoError: { borderColor: colors.danger },

  estadoFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.sm,
    minHeight: 22,
  },
  estadoOk: { flex: 1, fontSize: 13, color: colors.success, fontWeight: "700" },
  estadoPendiente: { flex: 1, fontSize: 12.5, color: colors.textMuted, lineHeight: 18 },

  errorFila: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.sm },
  errorTexto: { flex: 1, fontSize: 12.5, color: colors.danger, fontWeight: "600" },

  botonLimpiar: { marginTop: spacing.md },
});
