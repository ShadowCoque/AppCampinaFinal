import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { guardarOperador, leerOperador } from "../src/data/operador";
import { normalizarNombre } from "../src/domain/texto";
import { INSTRUCTIVO_ESCANEO } from "../src/domain/expediente";
import {
  cerrarSesionServidor,
  comprobarServidor,
  guardarConfiguracion,
  iniciarSesion,
  leerConfiguracion,
  pendientesDeEnvio,
  sesionActiva,
  sincronizar,
  type SesionServidor,
} from "../src/services/servidor";
import { colors, radius, spacing, typography } from "../src/theme";
import { Button, Card, InfoNote, TextField } from "../src/ui";

/**
 * Configuración del dispositivo del Área de Socios.
 *
 * Reúne lo único que hay que ajustar una vez por tableta: quién la opera —su
 * nombre queda en la constancia «Registrado» del reverso del formulario— y la
 * dirección del servidor institucional al que se envían las afiliaciones.
 */
export default function ConfiguracionScreen() {
  const [operador, setOperador] = useState("");
  const [url, setUrl] = useState("");
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [sesion, setSesion] = useState<SesionServidor | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [estadoServidor, setEstadoServidor] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [nombre, config, cola] = await Promise.all([
      leerOperador(),
      leerConfiguracion(),
      pendientesDeEnvio(),
    ]);
    setOperador(nombre === "ÁREA DE SOCIOS" ? "" : nombre);
    setUrl(config.url);
    setUsuario(config.usuario);
    setPendientes(cola.length);
    if (config.url) setSesion(await sesionActiva());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar])
  );

  const guardarDatos = async () => {
    setOcupado("guardando");
    try {
      await guardarOperador(operador);
      await guardarConfiguracion({ url, usuario });
      const salud = await comprobarServidor();
      setEstadoServidor(
        salud.ok
          ? `Servidor accesible. Publicación en SAFI en modo ${salud.safiModo ?? "—"}.`
          : "No se pudo contactar al servidor con esa dirección."
      );
    } finally {
      setOcupado(null);
    }
  };

  const entrar = async () => {
    if (!usuario.trim() || !clave) {
      Alert.alert("Faltan datos", "Ingrese el usuario y la contraseña del Área de Socios.");
      return;
    }
    setOcupado("sesion");
    try {
      await guardarConfiguracion({ url, usuario });
      const abierta = await iniciarSesion(usuario, clave);
      setSesion(abierta);
      setClave("");
      Alert.alert("Sesión iniciada", `Conectado como ${abierta.nombre} (${abierta.area}).`);
    } catch (error) {
      Alert.alert("No se pudo iniciar sesión", error instanceof Error ? error.message : "Error.");
    } finally {
      setOcupado(null);
    }
  };

  const salir = async () => {
    setOcupado("sesion");
    await cerrarSesionServidor();
    setSesion(null);
    setOcupado(null);
  };

  const enviar = async () => {
    setOcupado("sincronizando");
    try {
      const resumen = await sincronizar();
      await cargar();
      Alert.alert(
        "Sincronización terminada",
        [
          `Afiliaciones enviadas: ${resumen.enviadas}`,
          `Documentos subidos: ${resumen.documentos}`,
          resumen.fallidas ? `Con problemas: ${resumen.fallidas}` : null,
          resumen.detalle ? `\n${resumen.detalle}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      );
    } finally {
      setOcupado(null);
    }
  };

  return (
    <ScrollView style={styles.pantalla} contentContainerStyle={styles.contenido}>
      <Card
        title="Funcionario que opera la tableta"
        subtitle="Su nombre consta como responsable del registro en el reverso del formulario."
        icon="person-circle"
      >
        <TextField
          label="Apellidos y nombres"
          autoCapitalize="characters"
          icon="person-outline"
          helper="En mayúsculas y sin tildes."
          value={operador}
          onChangeText={(v) => setOperador(normalizarNombre(v))}
          placeholder="APELLIDOS NOMBRES"
        />
      </Card>

      <Card
        title="Servidor institucional"
        subtitle="Dónde vive la aplicación de socios dentro de la red del Club."
        icon="server"
      >
        <InfoNote tone="info" icon="information-circle-outline">
          Esta dirección la entrega la Coordinación de TICs y es la misma que Contabilidad y la
          Gerencia abren en su navegador para ver la bandeja de tareas. Es la dirección del servidor
          del Club, no la del CRM de SAFI. Es un servidor interno: empieza con «http://», no «https://».
        </InfoNote>

        <TextField
          label="Dirección del servidor"
          autoCapitalize="none"
          keyboardType="url"
          icon="globe-outline"
          value={url}
          onChangeText={setUrl}
          placeholder="http://soporte.clublacampina.com.ec:8080"
          helper="Complete, con http:// al inicio y sin barra al final. Se escribe una sola vez por tableta."
        />
        <Button
          label="Guardar y comprobar"
          icon="save-outline"
          variant="secondary"
          onPress={guardarDatos}
          loading={ocupado === "guardando"}
          fullWidth
        />
        {estadoServidor ? (
          <InfoNote
            tone={estadoServidor.startsWith("Servidor accesible") ? "success" : "danger"}
            icon="pulse-outline"
          >
            {estadoServidor}
          </InfoNote>
        ) : null}
      </Card>

      <Card
        title="Sesión"
        subtitle="Con qué usuario envía esta tableta lo que registra."
        icon="key"
      >
        {sesion ? (
          <>
            <View style={styles.sesionFila}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.sesionTexto}>
                {`Conectado como ${sesion.nombre} · ${sesion.area}`}
              </Text>
            </View>
            <Button
              label="Cerrar sesión"
              icon="log-out-outline"
              variant="secondary"
              onPress={salir}
              loading={ocupado === "sesion"}
              fullWidth
            />
          </>
        ) : (
          <>
            <InfoNote tone="info" icon="information-circle-outline">
              Es el usuario del Área de Socios que crea la Coordinación de TICs en el servidor del
              Club. No es el usuario del CRM de SAFI, ni el del computador, ni el correo
              institucional. La contraseña se entrega una sola vez, en persona.
            </InfoNote>

            <TextField
              label="Usuario"
              autoCapitalize="none"
              icon="person-outline"
              value={usuario}
              onChangeText={setUsuario}
              placeholder="socios"
              helper="Normalmente «socios». Lo confirma la Coordinación de TICs."
            />
            <TextField
              label="Contraseña"
              autoCapitalize="none"
              secureTextEntry
              icon="lock-closed-outline"
              value={clave}
              onChangeText={setClave}
              helper="No se guarda en la tableta: el servidor emite una sesión que dura la jornada."
            />
            <Button
              label="Iniciar sesión"
              icon="log-in-outline"
              onPress={entrar}
              loading={ocupado === "sesion"}
              fullWidth
            />
          </>
        )}
      </Card>

      <Card
        title="Afiliaciones por enviar"
        subtitle="La tableta funciona sin conexión: lo registrado se envía cuando hay red."
        icon="cloud-upload"
      >
        <Text style={styles.contador}>{pendientes}</Text>
        <Text style={styles.contadorPie}>
          {pendientes === 0
            ? "Todo lo registrado en este dispositivo ya está en el servidor."
            : pendientes === 1
              ? "afiliación pendiente de enviar al servidor."
              : "afiliaciones pendientes de enviar al servidor."}
        </Text>
        <Button
          label="Sincronizar ahora"
          icon="sync"
          onPress={enviar}
          loading={ocupado === "sincronizando"}
          disabled={!sesion || pendientes === 0}
          fullWidth
        />
        {!sesion ? (
          <InfoNote tone="warning" icon="alert-circle-outline">
            Inicie sesión para poder enviar las afiliaciones al servidor.
          </InfoNote>
        ) : null}
      </Card>

      <Card
        title="Cómo escanear la documentación"
        subtitle="Instructivo para la carpeta compartida del repositorio digital."
        icon="scan"
      >
        {INSTRUCTIVO_ESCANEO.map((paso, indice) => (
          <View key={paso} style={styles.paso}>
            <Text style={styles.pasoNumero}>{indice + 1}</Text>
            <Text style={styles.pasoTexto}>{paso}</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.bg },
  contenido: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  sesionFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sesionTexto: { flex: 1, fontSize: 14, color: colors.text },
  contador: { ...typography.display, color: colors.navy, textAlign: "center" },
  contadorPie: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  paso: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  pasoNumero: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.skySoft,
    color: colors.navy,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 20,
  },
  pasoTexto: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
});
