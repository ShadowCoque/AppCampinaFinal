import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

type Perfil = "SOCIOS" | "CONTABILIDAD";

const CLUB_BLUE = "#003963";

type AppRoute = "/afiliacion" | "/facturacion";

const modulos: {
  key: string;
  label: string;
  route: AppRoute;
}[] = [
  { key: "afi", label: "Afiliación", route: "/afiliacion" },
  { key: "fac", label: "Facturación", route: "/facturacion" },
];


export default function Home() {
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil>("SOCIOS");

  const modulos = useMemo(() => {
    if (perfil === "SOCIOS") {
      return [{ key: "afiliacion", label: "Formulario de Afiliación", route: "/afiliacion" }];
    }
    return [{ key: "facturacion", label: "Facturación (demo)", route: "/facturacion" }];
  }, [perfil]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Image
          source={require("../assets/images/campina-logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.title}>Portal TIC - Club</Text>
        <Text style={styles.subtitle}>Selecciona un perfil para ver módulos disponibles.</Text>

        <View style={styles.profileRow}>
          <Pressable
            onPress={() => setPerfil("SOCIOS")}
            style={[styles.profileBtn, perfil === "SOCIOS" && styles.profileBtnActive]}
          >
            <Text style={[styles.profileText, perfil === "SOCIOS" && styles.profileTextActive]}>
              Socios
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setPerfil("CONTABILIDAD")}
            style={[styles.profileBtn, perfil === "CONTABILIDAD" && styles.profileBtnActive]}
          >
            <Text
              style={[
                styles.profileText,
                perfil === "CONTABILIDAD" && styles.profileTextActive,
              ]}
            >
              Contabilidad
            </Text>
          </Pressable>
        </View>

        <View style={{ width: "100%", marginTop: 16 }}>
          {modulos.map((m) => (
            <Pressable key={m.key} onPress={() => router.push(m.route)} style={styles.moduleBtn}>
              <Text style={styles.moduleBtnText}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f7fb", alignItems: "center", justifyContent: "center" },
  card: {
    width: "92%",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e5eef8",
  },
  logo: { width: 90, height: 90, alignSelf: "center", marginBottom: 10 },
  title: { fontSize: 18, fontWeight: "800", color: CLUB_BLUE, textAlign: "center" },
  subtitle: { marginTop: 4, fontSize: 13, color: "#4a6a83", textAlign: "center" },

  profileRow: { flexDirection: "row", gap: 10, marginTop: 14, justifyContent: "center" },
  profileBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d7e6f5",
    backgroundColor: "#fff",
  },
  profileBtnActive: { backgroundColor: CLUB_BLUE, borderColor: CLUB_BLUE },
  profileText: { fontWeight: "700", color: CLUB_BLUE },
  profileTextActive: { color: "#fff" },

  moduleBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: CLUB_BLUE,
    alignItems: "center",
    marginTop: 10,
  },
  moduleBtnText: { color: "#fff", fontWeight: "800" },
});
