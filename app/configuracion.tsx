import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { listarActualizaciones } from "../src/data/actualizaciones";
import { guardarOperador, leerOperador } from "../src/data/operador";
import { normalizarNombre } from "../src/domain/texto";
import { INSTRUCTIVO_ESCANEO } from "../src/domain/expediente";
import {
  borrarDatosDePrueba,
  cerrarSesionServidor,
  comprobarServidor,
  describirResumen,
  describirSituacion,
  guardarConfiguracion,
  iniciarSesion,
  leerConfiguracion,
  requiereAtencion,
  seEnviaSola,
  sesionActiva,
  sincronizar,
  situacionesDeEntrega,
  ultimoResumen,
  type ResumenSincronizacion,
  type SesionServidor,
  type SituacionEntrega,
} from "../src/services/servidor";
import { colors, radius, spacing, typography } from "../src/theme";
import { Button, Card, InfoNote, TextField } from "../src/ui";

/** Lo que hay que escribir para confirmar el borrado de los datos de prueba. */
const PALABRA_BORRADO = "BORRAR";

/**
 * Configuración del dispositivo del Área de Socios.
 *
 * Reúne lo único que hay que ajustar una vez por tableta: quién la opera —su
 * nombre queda en la constancia «Registrado» del reverso del formulario—, la
 * dirección del servidor institucional al que se envían las afiliaciones y lo
 * que la tableta no puede enviar sola.
 */
export default function ConfiguracionScreen() {
  const router = useRouter();
  const [operador, setOperador] = useState("");
  const [url, setUrl] = useState("");
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [sesion, setSesion] = useState<SesionServidor | null>(null);
  const [situaciones, setSituaciones] = useState<SituacionEntrega[]>([]);
  const [actualizaciones, setActualizaciones] = useState(0);
  const [confirmacionBorrado, setConfirmacionBorrado] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [estadoServidor, setEstadoServidor] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResumenSincronizacion | null>(null);

  const cargar = useCallback(async () => {
    const [nombre, config, entregas, registradasActualizacion, ultimo] = await Promise.all([
      leerOperador(),
      leerConfiguracion(),
      situacionesDeEntrega(),
      listarActualizaciones(),
      ultimoResumen(),
    ]);
    setOperador(nombre === "ÁREA DE SOCIOS" ? "" : nombre);
    setUrl(config.url);
    setUsuario(config.usuario);
    setSituaciones(entregas);
    setActualizaciones(registradasActualizacion.length);
    setResumen(ultimo);
    if (config.url) setSesion(await sesionActiva());
  }, []);

  const pendientes = situaciones.filter(seEnviaSola).length;
  const conAviso = situaciones.filter(requiereAtencion);
  const sinEnviar = situaciones.filter((s) => !s.enviada).length;

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
      // Con la sesión abierta se entrega de inmediato lo que estaba en cola.
      const envio = await sincronizar();
      await cargar();
      Alert.alert(
        "Sesión iniciada",
        `Conectado como ${abierta.nombre} (${abierta.area}).${
          envio.enviadas > 0 ? `\n\nSe enviaron ${envio.enviadas} afiliaciones que estaban en cola.` : ""
        }`
      );
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
      const resultado = await sincronizar();
      await cargar();
      Alert.alert(
        "Sincronización terminada",
        [
          `Afiliaciones enviadas: ${resultado.enviadas}`,
          `Firmas y fotografías entregadas: ${resultado.archivos}`,
          `Trámites con avance nuevo: ${resultado.actualizadas}`,
          resultado.pendientes ? `Siguen pendientes: ${resultado.pendientes}` : null,
          resultado.atencion ? `Necesitan su atención: ${resultado.atencion}` : null,
          resultado.detalle ? `\n${resultado.detalle}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      );
    } finally {
      setOcupado(null);
    }
  };

  const borrar = async () => {
    setOcupado("borrando");
    try {
      const borrados = await borrarDatosDePrueba();
      setConfirmacionBorrado("");
      await cargar();
      Alert.alert(
        "Datos de prueba borrados",
        `Se borraron ${borrados.afiliaciones} afiliaciones y ${borrados.actualizaciones} actualizaciones de datos, con sus firmas y fotografías. La tableta conserva el funcionario, la dirección del servidor y la sesión.`
      );
    } finally {
      setOcupado(null);
    }
  };

  const confirmarBorrado = () => {
    Alert.alert(
      "Borrar los datos de prueba",
      `Se borrarán de esta tableta ${situaciones.length} afiliaciones y ${actualizaciones} actualizaciones de datos, con todas sus firmas y fotografías.${
        sinEnviar > 0
          ? `\n\n${sinEnviar === 1 ? "Una de ellas todavía no llegó" : `${sinEnviar} de ellas todavía no llegaron`} al servidor: se perderán para siempre.`
          : ""
      }\n\nEsta acción no se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Borrar", style: "destructive", onPress: () => void borrar() },
      ]
    );
  };

  const avisoEnvio = describirResumen(resumen);

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
              helper="No se guarda en la tableta: el servidor emite una sesión que dura 30 días en este dispositivo."
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
        subtitle="Se envían solas: al registrarlas, al abrir la aplicación y cada dos minutos."
        icon="cloud-upload"
      >
        <Text style={styles.contador}>{pendientes}</Text>
        <Text style={styles.contadorPie}>
          {pendientes === 0
            ? "Todo lo registrado en este dispositivo ya está completo en el servidor."
            : pendientes === 1
              ? "afiliación con envío pendiente (datos, firmas o fotografía)."
              : "afiliaciones con envío pendiente (datos, firmas o fotografía)."}
        </Text>
        <InfoNote tone={avisoEnvio.tono} icon="pulse-outline">
          {avisoEnvio.detalle ? `${avisoEnvio.titulo}\n${avisoEnvio.detalle}` : avisoEnvio.titulo}
        </InfoNote>
        <Button
          label="Sincronizar ahora"
          icon="sync"
          onPress={enviar}
          loading={ocupado === "sincronizando"}
          disabled={!sesion}
          fullWidth
          style={styles.botonSincronizar}
        />
        {!sesion ? (
          <InfoNote tone="warning" icon="alert-circle-outline">
            Inicie sesión para poder enviar las afiliaciones al servidor.
          </InfoNote>
        ) : null}
      </Card>

      {conAviso.length > 0 ? (
        <Card
          title="Trámites que necesitan su atención"
          subtitle="La tableta no puede completarlos sola. Abra cada uno para ver qué hacer."
          icon="alert-circle"
        >
          {conAviso.map((situacion) => (
            <Pressable
              key={situacion.solicitud.id}
              onPress={() =>
                router.push({ pathname: "/solicitud/[id]", params: { id: situacion.solicitud.id } })
              }
              accessibilityRole="button"
              style={({ pressed }) => [styles.aviso, pressed && styles.presionado]}
            >
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.avisoTexto}>{describirSituacion(situacion)}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          ))}
        </Card>
      ) : null}

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

      <Card
        title="Borrar los datos de prueba"
        subtitle="Para empezar una prueba desde cero sin reinstalar la aplicación."
        icon="trash"
      >
        <InfoNote tone="warning" icon="information-circle-outline">
          {`Borra de esta tableta las afiliaciones (${situaciones.length}), el borrador en curso y las actualizaciones de datos (${actualizaciones}), con todas sus firmas y fotografías. Conserva el funcionario, la dirección del servidor y la sesión. No borra nada del servidor.`}
        </InfoNote>
        {sinEnviar > 0 ? (
          <InfoNote tone="danger" icon="cloud-offline">
            {sinEnviar === 1
              ? "Una afiliación todavía no llegó al servidor: si borra, se pierde para siempre."
              : `${sinEnviar} afiliaciones todavía no llegaron al servidor: si borra, se pierden para siempre.`}
          </InfoNote>
        ) : null}
        <TextField
          label={`Para confirmar, escriba ${PALABRA_BORRADO}`}
          autoCapitalize="characters"
          icon="create-outline"
          value={confirmacionBorrado}
          onChangeText={setConfirmacionBorrado}
          placeholder={PALABRA_BORRADO}
        />
        <Button
          label="Borrar los datos de prueba"
          icon="trash-outline"
          variant="danger"
          onPress={confirmarBorrado}
          loading={ocupado === "borrando"}
          disabled={confirmacionBorrado.trim().toUpperCase() !== PALABRA_BORRADO || ocupado !== null}
          fullWidth
        />
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
  botonSincronizar: { marginTop: spacing.md },
  contadorPie: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  aviso: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  avisoTexto: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
  presionado: { opacity: 0.7 },
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
