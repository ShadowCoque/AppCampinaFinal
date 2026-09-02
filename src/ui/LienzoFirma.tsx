import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import SignatureScreen, { type SignatureViewRef } from "react-native-signature-canvas";

import { colors, radius, spacing } from "../theme";
import { Button } from "./Button";

/**
 * Lienzo de firma manuscrita.
 *
 * Lo usan el solicitante y, en los tipos de socio que los exigen, los socios
 * garantes. La firma se captura sola al levantar el dedo: obligar a pulsar un
 * botón de confirmación era la causa de que llegara vacía al paso de revisión.
 */

type Props = {
  /** Firma en formato `data:image/png;base64,…`. */
  valor: string | null;
  onChange: (dataUri: string | null) => void;
  /** Bloquea el scroll del formulario mientras se traza. */
  onDibujando: (dibujando: boolean) => void;
  error?: string;
  /** Texto que se muestra mientras no hay trazo. */
  instruccion?: string;
  alto?: number;
};

const ESTILO_LIENZO = `
  .m-signature-pad { box-shadow: none; border: none; margin: 0; }
  .m-signature-pad--body { border: none; }
  .m-signature-pad--footer { display: none; }
  body, html { background-color: #FFFFFF; margin: 0; padding: 0;
               overscroll-behavior: none; touch-action: none; }
`;

export function LienzoFirma({
  valor,
  onChange,
  onDibujando,
  error,
  instruccion = "Trace su firma en el recuadro. Se guarda automáticamente al levantar el dedo.",
  alto = 180,
}: Props) {
  const lienzo = useRef<SignatureViewRef>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    []
  );

  const capturar = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => lienzo.current?.readSignature(), 400);
  }, []);

  const limpiar = () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    lienzo.current?.clearSignature();
    onChange(null);
  };

  return (
    <View>
      <View style={[styles.lienzo, { height: alto }, !!error && styles.lienzoError]}>
        <SignatureScreen
          ref={lienzo}
          onOK={(dataUri) => onChange(dataUri)}
          onEmpty={() => onChange(null)}
          onClear={() => onChange(null)}
          onBegin={() => onDibujando(true)}
          onEnd={() => {
            onDibujando(false);
            capturar();
          }}
          onLoadEnd={() => setListo(true)}
          onError={(fallo) => console.warn("[firma] Error en el lienzo:", fallo)}
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
        {valor ? (
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
              {listo ? instruccion : "Preparando el lienzo…"}
            </Text>
          </>
        )}
      </View>

      {error ? (
        <View style={styles.errorFila}>
          <Ionicons name="alert-circle" size={14} color={colors.danger} />
          <Text style={styles.errorTexto}>{error}</Text>
        </View>
      ) : null}

      <Button
        label="Limpiar firma"
        variant="secondary"
        icon="refresh"
        onPress={limpiar}
        style={styles.botonLimpiar}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  lienzo: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  lienzoError: { borderColor: colors.danger, borderWidth: 1.5 },
  lienzoInterno: { flex: 1 },
  estadoFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  estadoOk: { color: colors.success, fontSize: 13, fontWeight: "600" },
  estadoPendiente: { color: colors.textMuted, fontSize: 12.5, flex: 1, lineHeight: 17 },
  errorFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  errorTexto: { color: colors.danger, fontSize: 12.5, flex: 1 },
  botonLimpiar: { marginTop: spacing.md },
});
