import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getSolicitudes, SolicitudAfiliacion } from "../src/storage/solicitudes";



const CLUB_BLUE = "#003963";

type RegistroFacturacion = SolicitudAfiliacion & {
  facturaSafi?: string;
  obsContabilidad?: string;
};

export default function FacturacionScreen() {
  const [items, setItems] = useState<RegistroFacturacion[]>([]);

  const load = useCallback(async () => {
    const solicitudes = await getSolicitudes();
    setItems(solicitudes.map((s) => ({ ...s })));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Facturación (demo)</Text>
      <Text style={styles.subtitle}>
        Aquí llegan solicitudes guardadas desde Afiliación (pendientes de integración).
      </Text>

      <Pressable onPress={load} style={styles.refreshBtn}>
        <Text style={styles.refreshText}>Actualizar</Text>
      </Pressable>

      {items.length === 0 ? (
        <Text style={styles.empty}>No hay solicitudes todavía.</Text>
      ) : (
        items.map((it) => (
          <View key={it.id} style={styles.card}>
            <Text style={styles.cardTitle}>Nombre: {it.nombreCompleto}</Text>
            <Text style={styles.meta}>CI: {it.cedula}</Text>
            <Text style={styles.meta}>No. Socio (demo): {it.noSocioDemo}</Text>

            <Text style={styles.label}>Observación Control Socios (N° factura SAFI)</Text>
            <TextInput
              placeholder="Ej: 04-3842"
              placeholderTextColor="#8aa4b8"
              style={styles.input}
              value={it.facturaSafi ?? ""}
              onChangeText={(t) =>
                setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, facturaSafi: t } : x)))
              }
            />

            <Text style={styles.label}>Observación Contabilidad</Text>
            <TextInput
              placeholder="Ej: Cuota mantenimiento: marzo–diciembre 2019..."
              placeholderTextColor="#8aa4b8"
              style={[styles.input, { height: 90, textAlignVertical: "top" }]}
              multiline
              value={it.obsContabilidad ?? ""}
              onChangeText={(t) =>
                setItems((prev) =>
                  prev.map((x) => (x.id === it.id ? { ...x, obsContabilidad: t } : x))
                )
              }
            />

            <View style={styles.tagRow}>
              <Text style={styles.tag}>Pendiente</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: "#f4f7fb" },
  title: { fontSize: 18, fontWeight: "900", color: CLUB_BLUE },
  subtitle: { marginTop: 4, color: "#4a6a83" },
  refreshBtn: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d7e6f5" },
  refreshText: { color: CLUB_BLUE, fontWeight: "800", textAlign: "center" },
  empty: { marginTop: 20, color: "#4a6a83" },

  card: { marginTop: 12, backgroundColor: "#fff", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#e5eef8" },
  cardTitle: { fontSize: 16, fontWeight: "900", color: "#0f2b3a" },
  meta: { marginTop: 2, color: "#4a6a83" },
  label: { marginTop: 12, fontWeight: "800", color: "#0f2b3a" },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#d7e6f5",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#f9fbff",
    color: "#0f2b3a",
  },
  tagRow: { marginTop: 10, flexDirection: "row" },
  tag: { backgroundColor: "#fff5cc", color: "#7a5b00", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, fontWeight: "900" },
});
