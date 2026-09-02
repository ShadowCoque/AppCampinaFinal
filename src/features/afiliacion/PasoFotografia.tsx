import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { nuevoId } from "../../data/almacenamiento";
import { eliminarArchivo, formatearTamano, guardarEnExpediente } from "../../data/archivos";
import { requisitosCapturables, type RequisitoDocumental } from "../../domain/documentos";
import type { Errores } from "../../domain/formularioAfiliacion";
import type { ArchivoAdjunto, DatosAfiliacion } from "../../domain/solicitud";
import {
  capturarConCamara,
  elegirArchivo,
  elegirDeGaleria,
  type ArchivoCapturado,
} from "../../services/captura";
import { colors, radius, spacing, typography } from "../../theme";
import { Badge, Card, InfoNote } from "../../ui";

type Props = {
  solicitudId: string;
  datos: DatosAfiliacion;
  documentos: ArchivoAdjunto[];
  errores: Errores;
  onAgregar: (documento: ArchivoAdjunto) => void;
  onEliminar: (id: string) => void;
};

/**
 * Captura de la fotografía del socio.
 *
 * Es lo único que la aplicación adjunta durante la afiliación, conforme al
 * informe CLC-TI-010 versión 6, numeral 5.2: «la fotografía del socio, que
 * puede ser la oficial (de su cédula) o una nueva tomada en el momento».
 *
 * La documentación de respaldo —cédulas, partidas, tarjeta militar— no se
 * captura aquí: la Jefatura del Área de Socios la escanea desde su equipo a la
 * carpeta compartida, el vigilante la reconoce por el nombre del archivo y la
 * archiva sola en el expediente. La bandeja avisa de la que falte.
 */
export function PasoFotografia({
  solicitudId,
  datos,
  documentos,
  errores,
  onAgregar,
  onEliminar,
}: Props) {
  const requisitos = requisitosCapturables(datos.tipoMiembro);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const adjuntar = async (
    requisito: RequisitoDocumental,
    obtener: () => Promise<ArchivoCapturado | null>
  ) => {
    setOcupado(requisito.tipo);
    try {
      const archivo = await obtener();
      if (!archivo) return;

      const guardado = guardarEnExpediente(solicitudId, archivo.uri, {
        prefijo: requisito.tipo.toLowerCase(),
        mimeType: archivo.mimeType,
      });

      onAgregar({
        id: nuevoId(),
        tipo: requisito.tipo,
        nombreArchivo: archivo.nombre,
        uri: guardado.uri,
        mimeType: archivo.mimeType,
        tamanoBytes: guardado.tamanoBytes || archivo.tamanoBytes,
        capturadoEn: new Date().toISOString(),
      });
    } catch (error) {
      console.warn("[fotografia] Error al adjuntar:", error);
      Alert.alert("No se pudo adjuntar", "Intente nuevamente con otro método de captura.");
    } finally {
      setOcupado(null);
    }
  };

  const confirmarEliminar = (documento: ArchivoAdjunto) => {
    Alert.alert("Quitar la fotografía", `¿Desea quitar “${documento.nombreArchivo}” del expediente?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Quitar",
        style: "destructive",
        onPress: () => {
          eliminarArchivo(documento.uri);
          onEliminar(documento.id);
        },
      },
    ]);
  };

  return (
    <>
      <InfoNote tone="info" icon="camera-outline">
        Tome la fotografía con la tableta o elija la de la cédula. El resto de la documentación no se
        adjunta aquí: la Jefatura la escana a la carpeta compartida y el sistema la archiva sola en
        el expediente del socio.
      </InfoNote>

      {requisitos.map((requisito) => {
        const adjuntos = documentos.filter((d) => d.tipo === requisito.tipo);
        const cargando = ocupado === requisito.tipo;
        const error = errores[requisito.tipo];
        const puedeAgregar = requisito.multiple || adjuntos.length === 0;

        return (
          <Card key={requisito.tipo} style={error ? styles.cardError : undefined}>
            <View style={styles.encabezado}>
              <View style={styles.encabezadoTexto}>
                <Text style={styles.nombre}>{requisito.nombre}</Text>
                <Text style={styles.descripcion}>{requisito.descripcion}</Text>
              </View>
              {adjuntos.length > 0 ? (
                <Badge label="Adjunto" tone="success" icon="checkmark-circle" />
              ) : (
                <Badge
                  label={requisito.obligatorio ? "Obligatorio" : "Opcional"}
                  tone={requisito.obligatorio ? "warning" : "neutral"}
                />
              )}
            </View>

            {adjuntos.map((documento) => {
              const esImagen = documento.mimeType.startsWith("image/");
              return (
                <View key={documento.id} style={styles.adjunto}>
                  {esImagen ? (
                    <Image
                      source={{ uri: documento.uri }}
                      style={styles.miniatura}
                      contentFit="cover"
                      transition={120}
                    />
                  ) : (
                    <View style={[styles.miniatura, styles.miniaturaPdf]}>
                      <Ionicons name="document-text" size={22} color={colors.navy} />
                    </View>
                  )}

                  <View style={styles.adjuntoTexto}>
                    <Text style={styles.adjuntoNombre} numberOfLines={1}>
                      {documento.nombreArchivo}
                    </Text>
                    <Text style={styles.adjuntoMeta}>
                      {formatearTamano(documento.tamanoBytes)}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => confirmarEliminar(documento)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar ${documento.nombreArchivo}`}
                    style={styles.quitar}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </View>
              );
            })}

            {puedeAgregar ? (
              cargando ? (
                <View style={styles.cargando}>
                  <ActivityIndicator color={colors.navy} />
                  <Text style={styles.cargandoTexto}>Procesando…</Text>
                </View>
              ) : (
                <View style={styles.acciones}>
                  <AccionCaptura
                    icono="camera"
                    etiqueta="Cámara"
                    destacado={requisito.preferirCamara}
                    onPress={() =>
                      adjuntar(requisito, () =>
                        capturarConCamara({ recorteCuadrado: requisito.tipo === "FOTO_CARNET" })
                      )
                    }
                  />
                  <AccionCaptura
                    icono="images"
                    etiqueta="Galería"
                    onPress={() =>
                      adjuntar(requisito, () =>
                        elegirDeGaleria({ recorteCuadrado: requisito.tipo === "FOTO_CARNET" })
                      )
                    }
                  />
                  {requisito.tipo !== "FOTO_CARNET" ? (
                    <AccionCaptura
                      icono="folder-open"
                      etiqueta="Archivo"
                      onPress={() => adjuntar(requisito, elegirArchivo)}
                    />
                  ) : null}
                </View>
              )
            ) : null}

            {error ? (
              <View style={styles.errorFila}>
                <Ionicons name="alert-circle" size={14} color={colors.danger} />
                <Text style={styles.errorTexto}>{error}</Text>
              </View>
            ) : null}
          </Card>
        );
      })}
    </>
  );
}

function AccionCaptura({
  icono,
  etiqueta,
  onPress,
  destacado,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  etiqueta: string;
  onPress: () => void;
  destacado?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      style={({ pressed }) => [
        styles.accion,
        destacado && styles.accionDestacada,
        pressed && styles.accionPresionada,
      ]}
    >
      <Ionicons name={icono} size={17} color={destacado ? colors.textOnDark : colors.navy} />
      <Text style={[styles.accionTexto, destacado && styles.accionTextoDestacado]}>{etiqueta}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardError: { borderColor: colors.danger },
  encabezado: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  encabezadoTexto: { flex: 1 },
  nombre: { ...typography.cardTitle, fontSize: 15 },
  descripcion: { ...typography.caption, marginTop: 3 },

  adjunto: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  miniatura: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: colors.skySoft },
  miniaturaPdf: { alignItems: "center", justifyContent: "center" },
  adjuntoTexto: { flex: 1 },
  adjuntoNombre: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  adjuntoMeta: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  quitar: { padding: spacing.sm },

  acciones: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  accion: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1.4,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  accionDestacada: { backgroundColor: colors.navy, borderColor: colors.navy },
  accionPresionada: { opacity: 0.8 },
  accionTexto: { fontSize: 13, fontWeight: "700", color: colors.navy },
  accionTextoDestacado: { color: colors.textOnDark },

  cargando: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
  cargandoTexto: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },

  errorFila: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.sm },
  errorTexto: { flex: 1, fontSize: 12.5, color: colors.danger, fontWeight: "600" },
});
