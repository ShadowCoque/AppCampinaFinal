import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { listarSolicitudes } from "../src/data/solicitudes";
import { formatFechaHora } from "../src/domain/fechas";
import {
  ESTADO_META,
  adjuntosFaltantes,
  nombreCompleto,
  type EstadoSolicitud,
  type SolicitudAfiliacion,
} from "../src/domain/solicitud";
import { nombreTipo } from "../src/domain/tiposMiembro";
import { idsSincronizados, sincronizar } from "../src/services/servidor";
import { colors, radius, shadow, spacing, typography } from "../src/theme";
import { Badge, Button, EmptyState } from "../src/ui";

type Filtro = "PENDIENTES" | "TODAS" | "COMPLETADAS";

const FILTROS: { valor: Filtro; etiqueta: string }[] = [
  { valor: "PENDIENTES", etiqueta: "En trámite" },
  { valor: "COMPLETADAS", etiqueta: "Finalizadas" },
  { valor: "TODAS", etiqueta: "Todas" },
];

const FINALIZADAS: EstadoSolicitud[] = ["APROBADA", "RECHAZADA"];

export default function SolicitudesScreen() {
  const router = useRouter();
  const [solicitudes, setSolicitudes] = useState<SolicitudAfiliacion[]>([]);
  const [enviadas, setEnviadas] = useState<string[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("PENDIENTES");
  const [busqueda, setBusqueda] = useState("");
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    const [lista, ids] = await Promise.all([listarSolicitudes(), idsSincronizados()]);
    setSolicitudes(lista);
    setEnviadas(ids);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar])
  );

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return solicitudes
      .filter((s) => {
        if (filtro === "PENDIENTES") return !FINALIZADAS.includes(s.estado);
        if (filtro === "COMPLETADAS") return FINALIZADAS.includes(s.estado);
        return true;
      })
      .filter((s) => {
        if (!texto) return true;
        return (
          nombreCompleto(s.datos).toLowerCase().includes(texto) ||
          s.datos.cedula.includes(texto) ||
          s.codigo.toLowerCase().includes(texto)
        );
      });
  }, [solicitudes, filtro, busqueda]);

  return (
    <View style={styles.pantalla}>
      <View style={styles.barra}>
        <View style={styles.buscador}>
          <Ionicons name="search" size={17} color={colors.textFaint} />
          <TextInput
            style={styles.buscadorInput}
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Buscar por nombre, cédula o código"
            placeholderTextColor={colors.textFaint}
            autoCorrect={false}
          />
          {busqueda ? (
            <Pressable onPress={() => setBusqueda("")} hitSlop={8} accessibilityLabel="Limpiar">
              <Ionicons name="close-circle" size={17} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filtros}>
          {FILTROS.map((f) => {
            const activo = f.valor === filtro;
            return (
              <Pressable
                key={f.valor}
                onPress={() => setFiltro(f.valor)}
                accessibilityRole="tab"
                accessibilityState={{ selected: activo }}
                style={[styles.filtro, activo && styles.filtroActivo]}
              >
                <Text style={[styles.filtroTexto, activo && styles.filtroTextoActivo]}>
                  {f.etiqueta}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlatList
        data={visibles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.lista}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={async () => {
              setRefrescando(true);
              // Deslizar hacia abajo entrega lo pendiente y trae el avance.
              await sincronizar();
              await cargar();
              setRefrescando(false);
            }}
            tintColor={colors.navy}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="document-text-outline"
            title="No hay solicitudes que mostrar"
            message={
              busqueda
                ? "Ninguna solicitud coincide con la búsqueda."
                : "Las solicitudes registradas desde el formulario aparecerán aquí."
            }
          >
            {!busqueda ? (
              <Button
                label="Registrar afiliación"
                icon="person-add"
                onPress={() => router.push("/afiliacion")}
                style={styles.botonVacio}
              />
            ) : null}
          </EmptyState>
        }
        renderItem={({ item }) => {
          const meta = ESTADO_META[item.estado];
          const sinEnviar = !enviadas.includes(item.id);
          const incompleta =
            !sinEnviar && item.estado !== "RECHAZADA" && adjuntosFaltantes(item).length > 0;
          return (
            <Pressable
              onPress={() => router.push({ pathname: "/solicitud/[id]", params: { id: item.id } })}
              accessibilityRole="button"
              accessibilityLabel={`Solicitud ${item.codigo} de ${nombreCompleto(item.datos)}`}
              style={({ pressed }) => [styles.tarjeta, pressed && styles.presionada]}
            >
              <View style={styles.tarjetaCabecera}>
                <Text style={styles.codigo}>{item.codigo}</Text>
                <Badge label={meta.etiqueta} tone={meta.tono} />
              </View>

              <Text style={styles.nombre} numberOfLines={1}>
                {nombreCompleto(item.datos) || "Sin nombre registrado"}
              </Text>

              <View style={styles.metaFila}>
                <Ionicons name="card-outline" size={13} color={colors.textMuted} />
                <Text style={styles.metaTexto}>{item.datos.cedula || "—"}</Text>
                <Text style={styles.separador}>·</Text>
                <Text style={styles.metaTexto}>{nombreTipo(item.datos.tipoMiembro)}</Text>
              </View>

              {sinEnviar || incompleta ? (
                <View style={styles.aviso}>
                  <Badge
                    label={sinEnviar ? "Sin enviar al servidor" : "Faltan firmas o fotografía en el servidor"}
                    tone="danger"
                    icon="cloud-offline"
                  />
                </View>
              ) : item.tramite.numeroSocio ? (
                <View style={styles.aviso}>
                  <Badge
                    label={`Socio N.º ${item.tramite.numeroSocio}${
                      item.tramite.ordinalDependiente ? `-${item.tramite.ordinalDependiente}` : ""
                    }`}
                    tone="info"
                    icon="barcode-outline"
                  />
                </View>
              ) : null}

              <View style={styles.pieTarjeta}>
                <Text style={styles.fecha}>{formatFechaHora(item.creadaEn)}</Text>
                <View style={styles.adjuntos}>
                  <Ionicons name="attach" size={13} color={colors.textMuted} />
                  <Text style={styles.metaTexto}>{item.documentos.length}</Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.bg },

  barra: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  buscador: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buscadorInput: { flex: 1, fontSize: 15, color: colors.text },
  filtros: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  filtro: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  filtroActivo: { backgroundColor: colors.navy, borderColor: colors.navy },
  filtroTexto: { fontSize: 12.5, fontWeight: "700", color: colors.textMuted },
  filtroTextoActivo: { color: colors.textOnDark },

  lista: { padding: spacing.lg, paddingBottom: spacing.xxl },
  tarjeta: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  presionada: { opacity: 0.85 },
  tarjetaCabecera: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  codigo: { ...typography.overline, color: colors.navy },
  nombre: { ...typography.cardTitle, fontSize: 16, marginTop: spacing.sm },
  metaFila: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  metaTexto: { fontSize: 12.5, color: colors.textMuted },
  separador: { color: colors.textFaint, fontSize: 12 },
  pieTarjeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  fecha: { fontSize: 11.5, color: colors.textFaint },
  aviso: { marginTop: spacing.sm },
  adjuntos: { flexDirection: "row", alignItems: "center", gap: 4 },
  botonVacio: { marginTop: spacing.lg },
});
