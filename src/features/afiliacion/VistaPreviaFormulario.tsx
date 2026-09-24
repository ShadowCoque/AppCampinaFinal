import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import type { SolicitudAfiliacion } from "../../domain/solicitud";
import { htmlVistaPrevia } from "../../services/pdf";
import { colors, spacing, typography } from "../../theme";
import { InfoNote } from "../../ui";

/**
 * El formulario completo, tal como se generará, dentro de la tableta: para que
 * el socio lo lea y compruebe sus datos antes de firmar (pedido del
 * Coordinador, 23/09/2026, pensando en la firma One Shot, que lo exigirá).
 *
 * Es el mismo HTML con que se genera el PDF, dibujado por el WebView que la
 * aplicación ya trae para el lienzo de la firma: no hace falta generar el PDF
 * ni salir de la aplicación.
 */

type Props = {
  visible: boolean;
  /** El trámite a enseñar; se compone al abrir, con lo que haya en ese momento. */
  solicitud: () => SolicitudAfiliacion;
  onCerrar: () => void;
};

export function VistaPreviaFormulario({ visible, solicitud, onCerrar }: Props) {
  const insets = useSafeAreaInsets();
  const [html, setHtml] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let activo = true;
    void htmlVistaPrevia(solicitud())
      .then((documento) => {
        if (!activo) return;
        if (documento) setHtml(documento);
        else setFallo(true);
      })
      .catch(() => activo && setFallo(true));
    return () => {
      activo = false;
    };
    // Se compone una vez por apertura: lo que se enseña es lo de ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Al cerrar se descarta lo compuesto: la próxima vez se compone de nuevo,
  // con lo que haya entonces.
  const cerrar = () => {
    setHtml(null);
    setFallo(false);
    onCerrar();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={cerrar}>
      <View style={[styles.pantalla, { paddingTop: insets.top }]}>
        <View style={styles.barra}>
          <View style={styles.titulos}>
            <Text style={styles.titulo}>Formulario completo</Text>
            <Text style={styles.subtitulo}>
              Así se generará. Léalo con el socio antes de firmar. Amplíe con dos dedos.
            </Text>
          </View>
          <Pressable
            onPress={cerrar}
            accessibilityRole="button"
            accessibilityLabel="Cerrar la vista previa"
            style={({ pressed }) => [styles.cerrar, pressed && styles.presionado]}
          >
            <Ionicons name="close" size={22} color={colors.navy} />
            <Text style={styles.cerrarTexto}>Cerrar</Text>
          </Pressable>
        </View>

        {fallo ? (
          <View style={styles.aviso}>
            <InfoNote tone="warning" icon="alert-circle">
              No se pudo componer el formulario. Cierre la vista previa y vuelva a intentarlo.
            </InfoNote>
          </View>
        ) : html ? (
          <WebView
            originWhitelist={["*"]}
            source={{ html }}
            style={styles.documento}
            scalesPageToFit
            setBuiltInZoomControls
            setDisplayZoomControls={false}
            javaScriptEnabled={false}
          />
        ) : (
          <View style={styles.cargando}>
            <ActivityIndicator color={colors.navy} size="large" />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.bg },
  barra: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  titulos: { flex: 1 },
  titulo: { ...typography.sectionTitle },
  subtitulo: { ...typography.caption, marginTop: 2 },
  cerrar: { flexDirection: "row", alignItems: "center", gap: 4, padding: spacing.sm },
  cerrarTexto: { color: colors.navy, fontWeight: "700", fontSize: 14 },
  presionado: { opacity: 0.7 },
  documento: { flex: 1, backgroundColor: "#E9EEF4" },
  cargando: { flex: 1, alignItems: "center", justifyContent: "center" },
  aviso: { padding: spacing.lg },
});
