import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { persistirFirma } from "../src/data/archivos";
import { leerOperador } from "../src/data/operador";
import {
  crearSolicitud,
  descartarBorrador,
  guardarBorrador,
  leerBorrador,
  nuevaSolicitudId,
} from "../src/data/solicitudes";
import {
  ajustarBloques,
  estadoInicial,
  pasosPara,
  validarPaso,
  validarTodo,
  type ClavePaso,
  type Errores,
  type EstadoFormulario,
} from "../src/domain/formularioAfiliacion";
import type { ClaveConsentimiento } from "../src/domain/privacidad";
import type { ValoresDesdeSnic } from "../src/domain/snic";
import type { ArchivoAdjunto, DatosAfiliacion, RegistroIdentidad } from "../src/domain/solicitud";
import { PasoCompromiso } from "../src/features/afiliacion/PasoCompromiso";
import { PasoConsentimiento } from "../src/features/afiliacion/PasoConsentimiento";
import { PasoContacto } from "../src/features/afiliacion/PasoContacto";
import { PasoFotografia } from "../src/features/afiliacion/PasoFotografia";
import { PasoFamilia } from "../src/features/afiliacion/PasoFamilia";
import { PasoGarantes } from "../src/features/afiliacion/PasoGarantes";
import { PasoIdentificacion } from "../src/features/afiliacion/PasoIdentificacion";
import { PasoLaboral } from "../src/features/afiliacion/PasoLaboral";
import { PasoPersonales } from "../src/features/afiliacion/PasoPersonales";
import { PasoRevision } from "../src/features/afiliacion/PasoRevision";
import { PasoTipo } from "../src/features/afiliacion/PasoTipo";
import { colors, radius, shadow, spacing, typography } from "../src/theme";
import { Button, Stepper } from "../src/ui";

export default function AfiliacionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [solicitudId, setSolicitudId] = useState(nuevaSolicitudId);
  const [estado, setEstado] = useState<EstadoFormulario>(estadoInicial);
  const [indice, setIndice] = useState(0);
  const [errores, setErrores] = useState<Errores>({});
  const [completados, setCompletados] = useState<Set<number>>(new Set());
  const [scrollHabilitado, setScrollHabilitado] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [cargando, setCargando] = useState(true);
  // Nombre del funcionario que registra: es la constancia «Registrado» del
  // reverso del formulario.
  const [operador, setOperador] = useState("ÁREA DE SOCIOS");

  useEffect(() => {
    void leerOperador().then(setOperador);
  }, []);

  const pasos = useMemo(() => pasosPara(estado.datos), [estado.datos]);
  const pasoActual = pasos[Math.min(indice, pasos.length - 1)];
  const esUltimo = indice >= pasos.length - 1;

  // Cambiar el tipo de socio puede eliminar un paso (p. ej. el laboral);
  // en ese caso el índice debe reajustarse al último paso disponible.
  useEffect(() => {
    setIndice((actual) => Math.min(actual, pasos.length - 1));
  }, [pasos.length]);

  /* ---------------- Borrador ---------------- */

  useEffect(() => {
    let activo = true;
    void (async () => {
      const borrador = await leerBorrador();
      if (!activo) return;

      if (!borrador?.estado?.datos?.tipoMiembro) {
        setCargando(false);
        return;
      }

      Alert.alert(
        "Solicitud en curso",
        "Existe una solicitud sin enviar en este dispositivo. ¿Desea continuar donde la dejó?",
        [
          {
            text: "Empezar de nuevo",
            style: "destructive",
            onPress: () => {
              void descartarBorrador();
              setCargando(false);
            },
          },
          {
            text: "Continuar",
            onPress: () => {
              setSolicitudId(borrador.solicitudId);
              setEstado(borrador.estado);
              setIndice(borrador.paso);
              setCompletados(new Set(Array.from({ length: borrador.paso }, (_, i) => i)));
              setCargando(false);
            },
          },
        ],
        { cancelable: false }
      );
    })();

    return () => {
      activo = false;
    };
  }, []);

  // Autoguardado: evita perder el avance si la app se cierra a mitad del trámite.
  useEffect(() => {
    if (cargando || !estado.datos.tipoMiembro) return;
    const temporizador = setTimeout(() => {
      void guardarBorrador(solicitudId, indice, estado);
    }, 700);
    return () => clearTimeout(temporizador);
  }, [cargando, estado, indice, solicitudId]);

  /* ---------------- Actualización de campos ---------------- */

  const setDato = useCallback(
    <K extends keyof DatosAfiliacion>(campo: K, valor: DatosAfiliacion[K]) => {
      setEstado((previo) => {
        const datos = { ...previo.datos, [campo]: valor };
        // Cambiar el tipo de socio o el estado civil cambia qué recuadros tiene
        // el formulario: se preparan (o se descartan) los bloques afectados.
        const requiereAjuste = campo === "tipoMiembro" || campo === "estadoCivil";
        return { ...previo, datos: requiereAjuste ? ajustarBloques(datos) : datos };
      });
      setErrores((previos) => (previos[campo] ? { ...previos, [campo]: undefined } : previos));
    },
    []
  );

  const setConsentimiento = useCallback((clave: ClaveConsentimiento, valor: boolean) => {
    setEstado((previo) => ({
      ...previo,
      consentimientos: { ...previo.consentimientos, [clave]: valor },
    }));
    setErrores((previos) => (previos[clave] ? { ...previos, [clave]: undefined } : previos));
  }, []);

  /**
   * La firma se lleva a disco en cuanto se traza y en el estado queda su ruta.
   * El autoguardado del borrador corre cada pocos segundos: conservar la imagen
   * codificada en el estado obligaría a reescribirla entera cada vez.
   */
  const setFirma = useCallback(
    (uri: string | null) => {
      setEstado((previo) => ({
        ...previo,
        firmaUri: persistirFirma(solicitudId, uri, {
          prefijo: "firma",
          anterior: previo.firmaUri,
        }),
      }));
      setErrores((previos) => (previos.firma ? { ...previos, firma: undefined } : previos));
    },
    [solicitudId]
  );

  const setFirmaGarante = useCallback(
    (indice: number, uri: string | null) => {
      setEstado((previo) => {
        const garantes = previo.datos.garantes.map((garante, i) =>
          i === indice
            ? {
                ...garante,
                firmaUri: persistirFirma(solicitudId, uri, {
                  prefijo: `firma-garante-${indice + 1}`,
                  anterior: garante.firmaUri,
                }),
              }
            : garante
        );
        return { ...previo, datos: { ...previo.datos, garantes } };
      });
      setErrores((previos) =>
        previos[`garante-${indice}-firma`]
          ? { ...previos, [`garante-${indice}-firma`]: undefined }
          : previos
      );
    },
    [solicitudId]
  );

  const agregarDocumento = useCallback((documento: ArchivoAdjunto) => {
    setEstado((previo) => ({ ...previo, documentos: [...previo.documentos, documento] }));
    setErrores((previos) =>
      previos[documento.tipo] ? { ...previos, [documento.tipo]: undefined } : previos
    );
  }, []);

  const eliminarDocumento = useCallback((id: string) => {
    setEstado((previo) => ({
      ...previo,
      documentos: previo.documentos.filter((d) => d.id !== id),
    }));
  }, []);

  const setIdentidad = useCallback((identidad: RegistroIdentidad) => {
    setEstado((previo) => ({ ...previo, identidad }));
    setErrores((previos) =>
      previos.identidadConfirmada ? { ...previos, identidadConfirmada: undefined } : previos
    );
  }, []);

  /** Vuelca de una sola vez los valores devueltos por el Registro Civil. */
  const aplicarDatosDelRegistro = useCallback(
    (valores: ValoresDesdeSnic) => {
      setEstado((previo) => ({ ...previo, datos: { ...previo.datos, ...valores } }));
      setErrores({});
    },
    []
  );

  /* ---------------- Navegación entre pasos ---------------- */

  const irArriba = () => scrollRef.current?.scrollTo({ y: 0, animated: true });

  const enviar = async () => {
    const resultado = validarTodo(estado);
    if (!resultado.ok) {
      const destino = pasos.findIndex((p) => p.key === resultado.primerPasoConError);
      setErrores(resultado.errores);
      if (destino >= 0) setIndice(destino);
      irArriba();
      Alert.alert(
        "Faltan datos por completar",
        "Se le llevó al paso donde falta información. Revise los campos marcados en rojo."
      );
      return;
    }

    setEnviando(true);
    try {
      const solicitud = await crearSolicitud(solicitudId, estado, operador);
      await descartarBorrador();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert(
        "Afiliación registrada",
        `El trámite ${solicitud.codigo} quedó registrado. Contabilidad lo verá en su bandeja para revisarlo.`,
        [
          {
            text: "Ver solicitud",
            onPress: () =>
              router.replace({ pathname: "/solicitud/[id]", params: { id: solicitud.id } }),
          },
        ]
      );
    } catch (error) {
      console.warn("[afiliacion] Error al enviar:", error);
      Alert.alert(
        "No se pudo enviar",
        "Ocurrió un problema al guardar la solicitud. Intente nuevamente."
      );
    } finally {
      setEnviando(false);
    }
  };

  const avanzar = () => {
    const problemas = validarPaso(pasoActual.key, estado);
    if (Object.keys(problemas).length > 0) {
      setErrores(problemas);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      irArriba();
      return;
    }

    setErrores({});
    setCompletados((previos) => new Set(previos).add(indice));

    if (esUltimo) {
      void enviar();
      return;
    }

    void Haptics.selectionAsync();
    setIndice((i) => i + 1);
    irArriba();
  };

  const retroceder = () => {
    if (indice === 0) {
      router.back();
      return;
    }
    setErrores({});
    setIndice((i) => i - 1);
    irArriba();
  };

  const saltarA = (destino: number) => {
    if (destino === indice) return;

    if (destino > indice) {
      const problemas = validarPaso(pasoActual.key, estado);
      if (Object.keys(problemas).length > 0) {
        setErrores(problemas);
        irArriba();
        return;
      }
      setCompletados((previos) => new Set(previos).add(indice));
    }

    setErrores({});
    setIndice(destino);
    irArriba();
  };

  const confirmarSalida = () => {
    Alert.alert(
      "Salir del formulario",
      "Su avance queda guardado como borrador en este dispositivo.",
      [
        { text: "Seguir aquí", style: "cancel" },
        { text: "Salir", onPress: () => router.back() },
      ]
    );
  };

  /* ---------------- Render ---------------- */

  if (cargando) {
    return (
      <View style={styles.cargando}>
        <ActivityIndicator color={colors.navy} size="large" />
      </View>
    );
  }

  const contenido = (clave: ClavePaso) => {
    switch (clave) {
      case "identificacion":
        return (
          <PasoIdentificacion
            datos={estado.datos}
            identidad={estado.identidad}
            errores={errores}
            setDato={setDato}
            onIdentidad={setIdentidad}
            onDatosDelRegistro={aplicarDatosDelRegistro}
          />
        );
      case "tipo":
        return <PasoTipo datos={estado.datos} errores={errores} setDato={setDato} />;
      case "personales":
        return (
          <PasoPersonales
            datos={estado.datos}
            identidad={estado.identidad}
            errores={errores}
            setDato={setDato}
          />
        );
      case "contacto":
        return <PasoContacto datos={estado.datos} errores={errores} setDato={setDato} />;
      case "laboral":
        return <PasoLaboral datos={estado.datos} errores={errores} setDato={setDato} />;
      case "familia":
        return <PasoFamilia datos={estado.datos} errores={errores} setDato={setDato} />;
      case "garantes":
        return (
          <PasoGarantes
            datos={estado.datos}
            errores={errores}
            setDato={setDato}
            onFirma={setFirmaGarante}
            onDibujando={(dibujando) => setScrollHabilitado(!dibujando)}
          />
        );
      case "compromiso":
        return <PasoCompromiso datos={estado.datos} errores={errores} setDato={setDato} />;
      case "fotografia":
        return (
          <PasoFotografia
            solicitudId={solicitudId}
            datos={estado.datos}
            documentos={estado.documentos}
            errores={errores}
            onAgregar={agregarDocumento}
            onEliminar={eliminarDocumento}
          />
        );
      case "consentimiento":
        return (
          <PasoConsentimiento
            consentimientos={estado.consentimientos}
            firmaUri={estado.firmaUri}
            errores={errores}
            onConsentimiento={setConsentimiento}
            onFirma={setFirma}
            onDibujando={(dibujando) => setScrollHabilitado(!dibujando)}
          />
        );
      case "revision":
        return <PasoRevision estado={estado} />;
      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.pantalla}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stepper steps={pasos} currentIndex={indice} completed={completados} onSelect={saltarA} />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.contenido}
        scrollEnabled={scrollHabilitado}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {contenido(pasoActual.key)}

        <Pressable
          onPress={confirmarSalida}
          accessibilityRole="button"
          style={({ pressed }) => [styles.salir, pressed && styles.presionado]}
        >
          <Ionicons name="save-outline" size={16} color={colors.textMuted} />
          <Text style={styles.salirTexto}>Guardar y continuar más tarde</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.pie, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Button
          label={indice === 0 ? "Cancelar" : "Atrás"}
          variant="secondary"
          icon={indice === 0 ? "close" : "chevron-back"}
          onPress={retroceder}
          disabled={enviando}
        />
        <Button
          label={esUltimo ? "Enviar solicitud" : "Continuar"}
          icon={esUltimo ? "send" : "chevron-forward"}
          iconPosition="right"
          onPress={avanzar}
          loading={enviando}
          style={styles.botonPrincipal}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.bg },
  cargando: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  scroll: { flex: 1 },
  contenido: { padding: spacing.lg, paddingBottom: spacing.xxl },

  salir: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
  },
  salirTexto: { ...typography.caption, fontWeight: "700" },
  presionado: { opacity: 0.7 },

  pie: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    ...shadow.sticky,
  },
  botonPrincipal: { flex: 1 },
});
