import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useSincronizacionAutomatica } from "../src/services/sincronizacionAutomatica";
import { colors } from "../src/theme";

export default function RootLayout() {
  // Lo registrado en la tableta se entrega solo al servidor.
  useSincronizacionAutomatica();

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.navy },
          headerTintColor: colors.textOnDark,
          headerTitleStyle: { fontWeight: "800", fontSize: 17 },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="afiliacion" options={{ title: "Nueva afiliación" }} />
        <Stack.Screen name="solicitudes" options={{ title: "Solicitudes de afiliación" }} />
        <Stack.Screen name="solicitud/[id]" options={{ title: "Detalle de la solicitud" }} />
        <Stack.Screen name="actualizacion" options={{ title: "Actualización de datos" }} />
        <Stack.Screen name="configuracion" options={{ title: "Configuración y envío" }} />
        <Stack.Screen
          name="privacidad"
          options={{ title: "Protección de datos", presentation: "modal" }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
