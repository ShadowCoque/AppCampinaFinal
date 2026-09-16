import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { formatFechaHora } from "../src/domain/fechas";
import {
  cerrarSesionServidor,
  guardarMiFirma,
  iniciarSesion,
  leerConfiguracion,
  miFirma,
  sesionActiva,
  type EstadoMiFirma,
  type SesionServidor,
} from "../src/services/servidor";
import { colors, spacing, typography } from "../src/theme";
import { Button, Card, InfoNote, LienzoFirma, TextField } from "../src/ui";

/**
 * «Mi firma»: la firma del funcionario, la que se estampa en su constancia del
 * reverso del formulario —REGISTRADO, REVISADO o APROBADO—.
 *
 * Cada funcionario la carga una sola vez, desde esta tableta y con su propio
 * usuario: es suya, no del trámite ni del dispositivo. Quien no la cargue sigue
 * trabajando igual y su recuadro se imprime solo con su nombre, como hasta
 * ahora.
 *
 * Esta pantalla es la única que trabaja con un usuario que no es el de la
 * tableta. Contabilidad y la Gerencia no tienen tableta propia: vienen a esta,
 * entran un momento con su usuario y trazan su firma. Por eso la sesión que
 * abren aquí es **prestada** —no cambia con qué usuario trabaja la tableta— y
 * la pantalla insiste en devolverla al Área de Socios: mientras haya otra
 * sesión abierta, las afiliaciones no se envían.
 */
export default function MiFirmaScreen() {
  const [url, setUrl] = useState("");
  const [usuarioTableta, setUsuarioTableta] = useState("");
  const [sesion, setSesion] = useState<SesionServidor | null>(null);
  const [firma, setFirma] = useState<EstadoMiFirma | null>(null);
  const [trazo, setTrazo] = useState<string | null>(null);
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [scrollHabilitado, setScrollHabilitado] = useState(true);

  const cargar = useCallback(async () => {
    const config = await leerConfiguracion();
    setUrl(config.url);
    setUsuarioTableta(config.usuario);
    if (!config.url) return;

    const abierta = await sesionActiva();
    setSesion(abierta);
    setFirma(abierta ? await miFirma().catch(() => null) : null);
    if (!abierta) setUsuario((previo) => previo || config.usuario);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar])
  );

  /** La sesión abierta no es la de la tableta: está prestada a otro funcionario. */
  const prestada = Boolean(sesion && usuarioTableta && sesion.usuario !== usuarioTableta);

  const entrar = async () => {
    if (!usuario.trim() || !clave) {
      Alert.alert("Faltan datos", "Ingrese su usuario y su contraseña del servidor del Club.");
      return;
    }
    setOcupado("sesion");
    try {
      // Solo se recuerda el usuario cuando es el de la tableta: la sesión que
      // abre aquí Contabilidad o la Gerencia es prestada y no debe quedarse
      // como el usuario con el que la tableta envía lo que registra.
      const propia = !usuarioTableta || usuario.trim().toLowerCase() === usuarioTableta;
      const abierta = await iniciarSesion(usuario, clave, { recordar: propia });
      setSesion(abierta);
      setClave("");
      setEntrando(false);
      setFirma(await miFirma().catch(() => null));
    } catch (error) {
      Alert.alert("No se pudo iniciar sesión", error instanceof Error ? error.message : "Error.");
    } finally {
      setOcupado(null);
    }
  };

  const guardar = async () => {
    if (!trazo) return;
    setOcupado("guardar");
    try {
      const guardada = await guardarMiFirma(trazo);
      setFirma(guardada);
      setTrazo(null);
      Alert.alert(
        "Firma cargada",
        `${sesion?.nombre ?? "Su firma"} quedará firmada en las constancias que selle a partir de ahora. Las ya emitidas conservan la firma con la que se estamparon.${
          prestada
            ? `\n\nNo olvide devolver la tableta al Área de Socios: mientras esta sesión siga abierta, las afiliaciones no se envían.`
            : ""
        }`
      );
    } catch (error) {
      Alert.alert("No se pudo cargar la firma", error instanceof Error ? error.message : "Error.");
    } finally {
      setOcupado(null);
    }
  };

  const devolver = async () => {
    setOcupado("sesion");
    try {
      await cerrarSesionServidor();
      setSesion(null);
      setFirma(null);
      setTrazo(null);
      setUsuario(usuarioTableta);
      setEntrando(true);
      Alert.alert(
        "Sesión cerrada",
        usuarioTableta
          ? `Inicie otra vez la sesión de la tableta, con el usuario «${usuarioTableta}», para que vuelva a enviar las afiliaciones.`
          : "Inicie otra vez la sesión de la tableta, con el usuario del Área de Socios, para que vuelva a enviar las afiliaciones."
      );
    } finally {
      setOcupado(null);
    }
  };

  if (!url) {
    return (
      <ScrollView style={styles.pantalla} contentContainerStyle={styles.contenido}>
        <InfoNote tone="warning" icon="server-outline">
          Esta tableta todavía no tiene configurada la dirección del servidor del Club. Escríbala en
          «Configuración y envío» y vuelva aquí.
        </InfoNote>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.pantalla}
      contentContainerStyle={styles.contenido}
      scrollEnabled={scrollHabilitado}
      keyboardShouldPersistTaps="handled"
    >
      <InfoNote tone="info" icon="information-circle-outline">
        Su firma acompaña a su nombre en la constancia que usted sella en el reverso del formulario:
        REGISTRADO en el Área de Socios, REVISADO en Contabilidad y APROBADO en la Gerencia. Se carga
        una sola vez y puede volver a trazarla cuando quiera; las constancias ya emitidas conservan
        la firma con la que se estamparon.
      </InfoNote>

      {sesion && !entrando ? (
        <>
          <Card title="Quién está en la tableta" icon="person-circle">
            <View style={styles.sesionFila}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.sesionTexto}>
                {`${sesion.nombre} · ${sesion.etiquetaArea ?? sesion.area}`}
              </Text>
            </View>
            {firma?.cargada ? (
              <InfoNote tone="success" icon="create-outline">
                {`Su firma ya está cargada${firma.en ? ` desde el ${formatFechaHora(firma.en)}` : ""}. Si vuelve a trazarla, sustituye a la anterior.`}
              </InfoNote>
            ) : (
              <InfoNote tone="neutral" icon="create-outline">
                Todavía no ha cargado su firma. Hasta que lo haga, su constancia se imprime solo con
                su nombre.
              </InfoNote>
            )}
            <Button
              label="Es otro funcionario"
              icon="swap-horizontal-outline"
              variant="ghost"
              onPress={() => {
                setEntrando(true);
                setUsuario("");
                setTrazo(null);
              }}
              disabled={ocupado !== null}
              fullWidth
            />
          </Card>

          {prestada ? (
            <InfoNote tone="warning" icon="cloud-offline">
              {`La tableta está con la sesión de ${sesion.nombre}, que no es la del Área de Socios: mientras siga abierta, las afiliaciones registradas no se envían al servidor. Al terminar, devuélvala.`}
            </InfoNote>
          ) : null}

          <Card
            title="Trace su firma"
            subtitle="La misma que consta en los documentos del Club."
            icon="create"
          >
            <LienzoFirma
              valor={trazo}
              onChange={setTrazo}
              onDibujando={(dibujando) => setScrollHabilitado(!dibujando)}
              instruccion="Trace su firma en el recuadro. Se guarda automáticamente al levantar el dedo."
            />
            <Button
              label={firma?.cargada ? "Sustituir mi firma" : "Cargar mi firma"}
              icon="cloud-upload-outline"
              onPress={guardar}
              loading={ocupado === "guardar"}
              disabled={!trazo || ocupado !== null}
              fullWidth
              style={styles.boton}
            />
          </Card>

          {prestada ? (
            <Card
              title="Devolver la tableta al Área de Socios"
              subtitle="Cierra esta sesión prestada para que la tableta vuelva a enviar lo que registra."
              icon="log-out"
            >
              <Button
                label="Cerrar esta sesión"
                icon="log-out-outline"
                variant="secondary"
                onPress={devolver}
                loading={ocupado === "sesion"}
                fullWidth
              />
            </Card>
          ) : null}
        </>
      ) : (
        <Card
          title="Entre con su usuario"
          subtitle="El mismo con el que abre la bandeja de tareas en el navegador."
          icon="key"
        >
          <InfoNote tone="warning" icon="alert-circle-outline">
            La tableta queda con la sesión que abra aquí. Si no es la del Área de Socios, las
            afiliaciones dejan de enviarse hasta que se cierre y se vuelva a iniciar la de la
            tableta{usuarioTableta ? ` («${usuarioTableta}»)` : ""}; esta misma pantalla lo recuerda
            y permite hacerlo.
          </InfoNote>

          <TextField
            label="Usuario"
            autoCapitalize="none"
            icon="person-outline"
            value={usuario}
            onChangeText={setUsuario}
            placeholder="socios, contabilidad o gerencia"
          />
          <TextField
            label="Contraseña"
            autoCapitalize="none"
            secureTextEntry
            icon="lock-closed-outline"
            value={clave}
            onChangeText={setClave}
            helper="No se guarda en la tableta: el servidor emite una sesión."
          />
          <Button
            label="Iniciar sesión"
            icon="log-in-outline"
            onPress={entrar}
            loading={ocupado === "sesion"}
            fullWidth
          />
          {sesion ? (
            <Button
              label="Volver"
              variant="ghost"
              onPress={() => {
                setEntrando(false);
                setClave("");
              }}
              disabled={ocupado !== null}
              fullWidth
            />
          ) : null}
        </Card>
      )}
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
  sesionTexto: { flex: 1, ...typography.cardTitle, fontSize: 15 },
  boton: { marginTop: spacing.sm },
});
