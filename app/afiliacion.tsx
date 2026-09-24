import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
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
  borradorYaRegistrado,
  cerrarBorrador,
  crearSolicitud,
  descartarBorrador,
  estadoParaCorregir,
  guardarBorrador,
  leerBorrador,
  nuevaSolicitudId,
  obtenerSolicitud,
  solicitudProvisional,
} from "../src/data/solicitudes";
import { cambiosEntre, describirCambios, puedeCorregirse } from "../src/domain/correccion";
import {
  corregirAfiliacion,
  enumerarAdjuntos,
  sincronizar,
  situacionDeEntrega,
} from "../src/services/servidor";
import {
  CLAVES_PASO,
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
import { fuerzaFijaPara } from "../src/domain/tiposMiembro";
import type { ValoresDesdeSnic } from "../src/domain/snic";
import type {
  DatosAfiliacion,
  DatosGarante,
  RegistroIdentidad,
  SolicitudAfiliacion,
} from "../src/domain/solicitud";
import { PasoCompromiso } from "../src/features/afiliacion/PasoCompromiso";
import { PasoConsentimiento } from "../src/features/afiliacion/PasoConsentimiento";
import { PasoContacto } from "../src/features/afiliacion/PasoContacto";
import { PasoFamilia } from "../src/features/afiliacion/PasoFamilia";
import { PasoGarantes } from "../src/features/afiliacion/PasoGarantes";
import { PasoIdentificacion } from "../src/features/afiliacion/PasoIdentificacion";
import { PasoLaboral } from "../src/features/afiliacion/PasoLaboral";
import { PasoPersonales } from "../src/features/afiliacion/PasoPersonales";
import { PasoRevision } from "../src/features/afiliacion/PasoRevision";
import { PasoTipo } from "../src/features/afiliacion/PasoTipo";
import { VistaPreviaFormulario } from "../src/features/afiliacion/VistaPreviaFormulario";
import { colors, radius, shadow, spacing, typography } from "../src/theme";
import { Button, InfoNote, Stepper } from "../src/ui";

export default function AfiliacionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  // `?corregir=<id>`: el mismo asistente, sobre una afiliación ya registrada.
  // Nació de la prueba del 19/09/2026: una cédula repetida obligaba a anular el
  // trámite y capturarlo entero otra vez para cambiar diez dígitos.
  const { corregir } = useLocalSearchParams<{ corregir?: string }>();
  const modoCorreccion = typeof corregir === "string" && corregir.length > 0;
  const [original, setOriginal] = useState<SolicitudAfiliacion | null>(null);
  const [yaEnSafi, setYaEnSafi] = useState(false);

  const [solicitudId, setSolicitudId] = useState(nuevaSolicitudId);
  const [estado, setEstado] = useState<EstadoFormulario>(estadoInicial);
  const [indice, setIndice] = useState(0);
  const [errores, setErrores] = useState<Errores>({});
  const [completados, setCompletados] = useState<Set<number>>(new Set());
  const [scrollHabilitado, setScrollHabilitado] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [vistaPrevia, setVistaPrevia] = useState(false);
  // Nombre del funcionario que captura la afiliación: queda en el historial
  // del trámite. La constancia «REGISTRADO» del reverso la sella la Jefatura de
  // Socios al registrar al socio en su bandeja, no la tableta.
  const [operador, setOperador] = useState("ÁREA DE SOCIOS");

  useEffect(() => {
    void leerOperador().then(setOperador);
  }, []);

  // Al corregir, el socio no vuelve a firmar (decisión del Coordinador,
  // 19/09/2026): el paso de consentimiento y firma no se muestra, y su firma y
  // sus autorizaciones quedan como se registraron.
  const pasos = useMemo(
    () =>
      pasosPara(estado.datos).filter(
        (paso) => !(modoCorreccion && paso.key === "consentimiento")
      ),
    [estado.datos, modoCorreccion]
  );
  // Cambiar el tipo de socio puede eliminar un paso (p. ej. el de garantes):
  // el índice se acota al dibujar, sin reescribir el estado.
  const indiceActual = Math.min(indice, pasos.length - 1);
  const pasoActual = pasos[indiceActual];
  const esUltimo = indiceActual >= pasos.length - 1;

  /* ---------------- Borrador ---------------- */

  useEffect(() => {
    if (!modoCorreccion) return;
    let activo = true;
    void (async () => {
      const solicitud = await obtenerSolicitud(corregir);
      if (!activo) return;
      const permiso = solicitud ? puedeCorregirse(solicitud) : null;
      if (!solicitud || !permiso?.permitido) {
        Alert.alert(
          "No se puede corregir",
          permiso && !permiso.permitido ? permiso.motivo : "La afiliación ya no está en esta tableta."
        );
        router.back();
        return;
      }
      setOriginal(solicitud);
      setYaEnSafi(permiso.yaEnSafi);
      setSolicitudId(solicitud.id);
      // Con las cuotas del tarifario, como las deja el servidor al guardar.
      const paraCorregir = estadoParaCorregir(solicitud);
      setEstado({ ...paraCorregir, datos: ajustarBloques(paraCorregir.datos) });
      // Todo ya se validó al registrarla: se puede saltar a cualquier paso.
      setCompletados(new Set(Array.from({ length: CLAVES_PASO.length }, (_, i) => i)));
      setCargando(false);
    })();
    return () => {
      activo = false;
    };
  }, [modoCorreccion, corregir, router]);

  useEffect(() => {
    // Al corregir no hay borrador: la afiliación ya existe y se edita sobre ella.
    if (modoCorreccion) return;
    let activo = true;
    void (async () => {
      const borrador = await leerBorrador();
      if (!activo) return;

      if (!borrador?.estado?.datos?.tipoMiembro) {
        setCargando(false);
        return;
      }

      // Un borrador que ya se registró es el rastro de un cierre inesperado de
      // la aplicación justo después de enviar. No se ofrece continuarlo:
      // volver a enviarlo duplicaría el trámite.
      if (await borradorYaRegistrado(borrador)) {
        await cerrarBorrador();
        if (activo) setCargando(false);
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
              // Un borrador de una versión anterior puede traer cuotas escritas
              // a mano: desde el 23/09/2026 salen del tarifario.
              setEstado({ ...borrador.estado, datos: ajustarBloques(borrador.estado.datos) });
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
  }, [modoCorreccion]);

  // Autoguardado: evita perder el avance si la app se cierra a mitad del trámite.
  useEffect(() => {
    if (modoCorreccion || cargando || !estado.datos.tipoMiembro) return;
    const temporizador = setTimeout(() => {
      void guardarBorrador(solicitudId, indiceActual, estado);
    }, 700);
    return () => clearTimeout(temporizador);
  }, [modoCorreccion, cargando, estado, indiceActual, solicitudId]);

  /* ---------------- Actualización de campos ---------------- */

  const setDato = useCallback(
    <K extends keyof DatosAfiliacion>(campo: K, valor: DatosAfiliacion[K]) => {
      setEstado((previo) => {
        const datos = { ...previo.datos, [campo]: valor };
        // Cambiar el tipo de socio o el estado civil cambia qué recuadros tiene
        // el formulario: se preparan (o se descartan) los bloques afectados.
        const requiereAjuste = campo === "tipoMiembro" || campo === "estadoCivil";
        if (campo === "tipoMiembro") {
          // La fuerza del socio activo y del fundador la fija su categoría. Al
          // cambiar de categoría se pone la nueva, o se vacía si la anterior la
          // traía fijada: si no, un corresponsal heredaría la Aérea sin que
          // nadie se la haya preguntado.
          const fija = fuerzaFijaPara(datos.tipoMiembro);
          if (fija) datos.fuerza = fija;
          else if (fuerzaFijaPara(previo.datos.tipoMiembro)) datos.fuerza = null;
          // El oficial FAE del que desciende solo lo tiene el D-C: si deja de
          // serlo, no se arrastra a otra categoría.
          if (previo.datos.tipoMiembro === "DC" && datos.tipoMiembro !== "DC") {
            datos.numeroOficialFae = "";
            datos.oficialFaeVerificado = null;
          }
        }
        return { ...previo, datos: requiereAjuste ? ajustarBloques(datos) : datos };
      });
      setErrores((previos) => (previos[campo] ? { ...previos, [campo]: undefined } : previos));
    },
    []
  );

  /**
   * Varios datos a la vez, calculados sobre el estado vigente. Lo usan las
   * búsquedas en SAFI, que responden un momento después: sobre el estado del
   * dibujo en que se pidieron se perdería lo escrito mientras tanto.
   */
  const actualizar = useCallback(
    (cambio: (datos: DatosAfiliacion) => Partial<DatosAfiliacion> | null) => {
      setEstado((previo) => {
        const parcial = cambio(previo.datos);
        return parcial ? { ...previo, datos: { ...previo.datos, ...parcial } } : previo;
      });
    },
    []
  );

  const actualizarGarante = useCallback(
    (indice: number, cambio: (garante: DatosGarante) => Partial<DatosGarante> | null) => {
      setEstado((previo) => {
        const actual = previo.datos.garantes[indice];
        const parcial = actual ? cambio(actual) : null;
        if (!parcial) return previo;
        const garantes = previo.datos.garantes.map((garante, i) =>
          i === indice ? { ...garante, ...parcial } : garante
        );
        return { ...previo, datos: { ...previo.datos, garantes } };
      });
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
   *
   * La escritura se hace fuera del actualizador de estado: React puede
   * ejecutar un actualizador dos veces, y aquí eso significaba escribir dos
   * archivos y borrar la firma anterior dos veces.
   */
  const estadoActual = useRef(estado);
  useEffect(() => {
    estadoActual.current = estado;
  }, [estado]);

  const setFirma = useCallback(
    (uri: string | null) => {
      const firmaUri = persistirFirma(solicitudId, uri, {
        prefijo: "firma",
        anterior: estadoActual.current.firmaUri,
      });
      setEstado((previo) => ({ ...previo, firmaUri }));
      setErrores((previos) => (previos.firma ? { ...previos, firma: undefined } : previos));
    },
    [solicitudId]
  );

  const setFirmaGarante = useCallback(
    (indice: number, uri: string | null) => {
      // Al corregir, la firma anterior sigue siendo la del trámite registrado
      // hasta que el servidor acepte la corrección: no se borra aquí, sino al
      // guardar (`corregirAfiliacion`).
      const anterior = modoCorreccion
        ? null
        : estadoActual.current.datos.garantes[indice]?.firmaUri ?? null;
      const firmaUri = persistirFirma(solicitudId, uri, {
        prefijo: `firma-garante-${indice + 1}`,
        anterior,
      });
      setEstado((previo) => {
        const garantes = previo.datos.garantes.map((garante, i) =>
          i === indice ? { ...garante, firmaUri } : garante
        );
        return { ...previo, datos: { ...previo.datos, garantes } };
      });
      setErrores((previos) =>
        previos[`garante-${indice}-firma`]
          ? { ...previos, [`garante-${indice}-firma`]: undefined }
          : previos
      );
    },
    [solicitudId, modoCorreccion]
  );

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

    if (modoCorreccion) {
      guardarCorreccion();
      return;
    }

    setEnviando(true);
    try {
      const solicitud = await crearSolicitud(solicitudId, estado, operador);
      // Se cierra el borrador SIN tocar sus archivos: la firma y las de los
      // garantes son ya las de la afiliación registrada.
      await cerrarBorrador();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // La entrega al servidor es inmediata. Si no hay red o sesión, queda en
      // la cola de la tableta y se reintenta sola; lo que no se hace es decir
      // que Contabilidad ya la tiene cuando no es cierto.
      const resumen = await sincronizar();
      const situacion = await situacionDeEntrega(solicitud.id);
      // El código definitivo lo asigna el servidor al recibirla.
      const codigo = situacion?.solicitud.codigo ?? solicitud.codigo;

      const irAlDetalle = () =>
        router.replace({ pathname: "/solicitud/[id]", params: { id: solicitud.id } });

      // Lo que no llegó se dice aquí mismo, con la persona todavía delante:
      // es cuando aún se puede volver a capturar.
      const perdidas = situacion?.perdidas ?? [];
      const sinArchivos =
        perdidas.length > 0
          ? `\n\nAtención: ${enumerarAdjuntos(perdidas)} no ${
              perdidas.length === 1 ? "quedó guardada" : "quedaron guardadas"
            } en la tableta y no ${perdidas.length === 1 ? "llegará" : "llegarán"} al servidor. Vuelva a ${
              perdidas.length === 1 ? "capturarla" : "capturarlas"
            } desde la solicitud antes de que el socio se retire.`
          : "";
      const porLlegar = (situacion?.faltantes ?? []).filter((rol) => !perdidas.includes(rol));

      if (situacion?.detenido?.motivo === "RECHAZADO") {
        Alert.alert(
          "El servidor rechazó la afiliación",
          `El trámite ${codigo} quedó guardado en la tableta, pero el servidor no lo aceptó: «${situacion.detenido.mensaje}».${sinArchivos}`,
          [{ text: "Ver solicitud", onPress: irAlDetalle }]
        );
      } else if (situacion?.enviada) {
        Alert.alert(
          perdidas.length > 0 ? "Afiliación enviada, pero incompleta" : "Afiliación registrada y enviada",
          `El trámite ${codigo} ya está en el servidor del Club. Aparece en la bandeja del Área de Socios para crearlo en SAFI; después lo revisará Contabilidad y lo aprobará la Gerencia.${
            porLlegar.length > 0
              ? `\n\nFalta que llegue ${enumerarAdjuntos(porLlegar)}: la tableta ${
                  porLlegar.length === 1 ? "la envía sola" : "las envía solas"
                } en cuanto pueda.`
              : ""
          }${sinArchivos}`,
          [{ text: "Ver solicitud", onPress: irAlDetalle }]
        );
      } else {
        Alert.alert(
          "Afiliación registrada en la tableta",
          `El trámite ${codigo} quedó guardado, pero todavía no llegó al servidor. Se enviará solo en cuanto sea posible.\n\n${
            resumen.estado === "ATENCION" || !resumen.detalle
              ? "Revise la conexión y la sesión en «Configuración y envío»."
              : resumen.detalle
          }${sinArchivos}`,
          [{ text: "Ver solicitud", onPress: irAlDetalle }]
        );
      }
    } catch (error) {
      console.warn("[afiliacion] Error al registrar:", error);
      Alert.alert(
        "No se pudo registrar",
        "Ocurrió un problema al guardar la solicitud en la tableta. Intente nuevamente."
      );
    } finally {
      setEnviando(false);
    }
  };

  /** Comprueba la corrección, la muestra para confirmar y la guarda. */
  const guardarCorreccion = () => {
    if (!original) return;

    if (yaEnSafi && estado.datos.tipoMiembro !== original.datos.tipoMiembro) {
      Alert.alert(
        "La categoría no se cambia",
        "Este socio ya está creado en SAFI con su categoría: la Cuenta y el número de socio dependen de ella. Para cambiarla, anule el trámite desde la bandeja y registre uno nuevo."
      );
      return;
    }

    // Un garante distinto no puede quedar con la firma del anterior.
    const garanteSinFirma = estado.datos.garantes.findIndex((garante, indice) => {
      const antes = original.datos.garantes[indice];
      if (!antes) return false;
      const otraPersona =
        antes.cedula !== garante.cedula || antes.apellidosNombres !== garante.apellidosNombres;
      return otraPersona && garante.firmaUri === antes.firmaUri;
    });
    if (garanteSinFirma >= 0) {
      const destino = pasos.findIndex((paso) => paso.key === "garantes");
      if (destino >= 0) setIndice(destino);
      setErrores({
        [`garante-${garanteSinFirma}-firma`]:
          "Cambió el garante: capture la firma de la persona nueva.",
      });
      irArriba();
      return;
    }

    const cambios = cambiosEntre(original.datos, estado.datos);
    if (cambios.length === 0) {
      Alert.alert("Sin cambios", "No modificó ningún dato de la afiliación.");
      return;
    }

    Alert.alert(
      "Guardar la corrección",
      `${describirCambios(cambios)}.\n\nEl socio no vuelve a firmar: el cambio queda en el historial del trámite, con su valor anterior.${
        yaEnSafi ? "\n\nEsta persona ya está creada en SAFI: corrija también su ficha en el CRM." : ""
      }`,
      [
        { text: "Seguir corrigiendo", style: "cancel" },
        {
          text: "Guardar",
          onPress: async () => {
            setEnviando(true);
            try {
              const resultado = await corregirAfiliacion(original, estado, operador);
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert(
                "Corrección guardada",
                resultado.enServidor
                  ? `El servidor ya tiene los datos corregidos de ${original.codigo}; la bandeja los muestra en su próxima recarga.`
                  : `La afiliación ${original.codigo} todavía no había llegado al servidor: llegará ya corregida.`
              );
              router.back();
            } catch (error) {
              Alert.alert(
                "No se guardó la corrección",
                `${error instanceof Error ? error.message : "Error."}\n\nLos cambios siguen en pantalla: inténtelo de nuevo cuando haya conexión.`
              );
            } finally {
              setEnviando(false);
            }
          },
        },
      ]
    );
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
    setCompletados((previos) => new Set(previos).add(indiceActual));

    if (esUltimo) {
      void enviar();
      return;
    }

    void Haptics.selectionAsync();
    setIndice(indiceActual + 1);
    irArriba();
  };

  const retroceder = () => {
    if (indiceActual === 0) {
      router.back();
      return;
    }
    setErrores({});
    setIndice(indiceActual - 1);
    irArriba();
  };

  const saltarA = (destino: number) => {
    if (destino === indiceActual) return;

    if (destino > indiceActual) {
      const problemas = validarPaso(pasoActual.key, estado);
      if (Object.keys(problemas).length > 0) {
        setErrores(problemas);
        irArriba();
        return;
      }
      setCompletados((previos) => new Set(previos).add(indiceActual));
    }

    setErrores({});
    setIndice(destino);
    irArriba();
  };

  const confirmarSalida = () => {
    if (modoCorreccion) {
      Alert.alert("Salir sin guardar", "La afiliación queda como estaba. Los cambios se descartan.", [
        { text: "Seguir aquí", style: "cancel" },
        { text: "Salir", style: "destructive", onPress: () => router.back() },
      ]);
      return;
    }
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
        return (
          <PasoTipo
            datos={estado.datos}
            errores={errores}
            setDato={setDato}
            actualizar={actualizar}
          />
        );
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
            actualizarGarante={actualizarGarante}
            onFirma={setFirmaGarante}
            onDibujando={(dibujando) => setScrollHabilitado(!dibujando)}
          />
        );
      case "compromiso":
        return <PasoCompromiso datos={estado.datos} errores={errores} setDato={setDato} />;
      case "consentimiento":
        return (
          <PasoConsentimiento
            consentimientos={estado.consentimientos}
            firmaUri={estado.firmaUri}
            errores={errores}
            onConsentimiento={setConsentimiento}
            onFirma={setFirma}
            onDibujando={(dibujando) => setScrollHabilitado(!dibujando)}
            onVistaPrevia={() => setVistaPrevia(true)}
          />
        );
      case "revision":
        return <PasoRevision estado={estado} onVistaPrevia={() => setVistaPrevia(true)} />;
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
      {modoCorreccion && original ? (
        <Stack.Screen options={{ title: `Corregir ${original.codigo}` }} />
      ) : null}
      <VistaPreviaFormulario
        visible={vistaPrevia}
        solicitud={() => solicitudProvisional(solicitudId, estadoActual.current, original)}
        onCerrar={() => setVistaPrevia(false)}
      />
      <Stepper steps={pasos} currentIndex={indiceActual} completed={completados} onSelect={saltarA} />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.contenido}
        scrollEnabled={scrollHabilitado}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {modoCorreccion ? (
          <InfoNote tone={yaEnSafi ? "warning" : "info"} icon="create-outline">
            {`Está corrigiendo ${original?.codigo ?? "la afiliación"}. Cambie lo necesario en cualquier paso y guarde al final: el socio no vuelve a firmar y cada cambio queda en el historial.${
              yaEnSafi
                ? " Esta persona ya está creada en SAFI: lo que corrija aquí, corríjalo también en su ficha del CRM, que el sistema no toca."
                : ""
            }`}
          </InfoNote>
        ) : null}

        {contenido(pasoActual.key)}

        <Pressable
          onPress={confirmarSalida}
          accessibilityRole="button"
          style={({ pressed }) => [styles.salir, pressed && styles.presionado]}
        >
          <Ionicons
            name={modoCorreccion ? "close-outline" : "save-outline"}
            size={16}
            color={colors.textMuted}
          />
          <Text style={styles.salirTexto}>
            {modoCorreccion ? "Salir sin guardar la corrección" : "Guardar y continuar más tarde"}
          </Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.pie, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Button
          label={indiceActual === 0 ? "Cancelar" : "Atrás"}
          variant="secondary"
          icon={indiceActual === 0 ? "close" : "chevron-back"}
          onPress={retroceder}
          disabled={enviando}
        />
        <Button
          label={esUltimo ? (modoCorreccion ? "Guardar corrección" : "Enviar solicitud") : "Continuar"}
          icon={esUltimo ? (modoCorreccion ? "save" : "send") : "chevron-forward"}
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
