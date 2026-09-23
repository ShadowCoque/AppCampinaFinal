import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";

import { TIPOS_DOCUMENTO, nombreDocumento, requisitosPara } from "../../../src/domain/documentos";
import { INSTRUCTIVO_ESCANEO, analizarNombreArchivo } from "../../../src/domain/expediente";
import {
  AREA_META,
  ROL_ADJUNTO_META,
  adjuntosFaltantes,
  nombreCompleto,
  nombreTitular,
  type Area,
  type EstadoSolicitud,
  type SolicitudAfiliacion,
} from "../../../src/domain/solicitud";
import { verificacionDe } from "../../../src/domain/sociosSafi";
import {
  atendidasPor,
  calcularTareas,
  contadoresDeTareas,
  creadoEnSafi,
  enCaminoHacia,
  numeroEnExpediente,
  tareasDeArea,
  tareasDeSolicitud,
} from "../../../src/domain/tareas";
import {
  TIPOS_DISPONIBLES,
  documentosDelTramite,
  nombreTipo,
  tieneCuentaPropia,
} from "../../../src/domain/tiposMiembro";
import { periodicidadesDe } from "../../../src/domain/cuotas";
import { config } from "../config";
import {
  adjuntoDe,
  adjuntosDe,
  guardarAdjunto,
  rolesRecibidos,
} from "../db/adjuntos";
import {
  archivosDeSolicitud,
  incidenciasAbiertas,
  marcarCargadosAMano,
  porId,
  resolverIncidencia,
} from "../db/archivos";
import {
  estamparFirma,
  extensionDeFirma,
  firmaDeFuncionario,
  guardarFirmaFuncionario,
  MAXIMO_BYTES_FIRMA,
} from "../db/firmasFuncionarios";
import { registrarBitacora } from "../db/indice";
import {
  actualizarExpediente,
  anular,
  aprobar,
  borrarSolicitud,
  corregirSolicitud,
  fijarVerificaciones,
  cuentaSafiDelTitular,
  devolver,
  guardarAltaSafi,
  listarSolicitudes,
  motivoParaNoBorrar,
  obtenerSolicitud,
  oficialDeUnDependienteB,
  omitirAdjunto,
  omitirEscaneo,
  personaEnExpediente,
  registrarAdjuntosRecibidos,
  registrarSolicitud,
  registrarTarjeta,
  reenviar,
  revisar,
  siguienteOrdinalDependiente,
  solicitudesConTareas,
  solicitudesRecientes,
} from "../db/solicitudes";
import {
  abrirSesion,
  autenticar,
  cerrarSesion,
  usuarioDeSesion,
  type Usuario,
} from "../db/usuarios";
import { archivarFormularioFinal, htmlDeSolicitud, pdfDeSolicitud } from "../formularios/expediente";
import { pdfDisponible } from "../formularios/pdf";
import { archivarContenido, rutaSegura } from "../expediente/repositorio";
import { apartarEscaneo, asignarEscaneo, recorrer, vigilanciaActiva } from "../expediente/vigilante";
import { adaptadorSafi, type ListasSafi, type VerificacionSafi } from "../safi/adaptador";
import { comprobarReferencias } from "../safi/referencias";
import { normalizarNumeroSocio } from "../../../src/domain/texto";
import {
  CUOTAS_ANUALES_SAFI,
  CUOTAS_MENSUALES_SAFI,
  FORMAS_PAGO_SAFI,
  GRUPOS_FACTURACION,
  MEMBRESIAS_SAFI,
  SUSCRIPCIONES_SAFI,
  TIPOS_CONTRIBUYENTE,
  VALORES_DE_RELLENO,
} from "../safi/campos";
import { diagnosticarSafi } from "../safi/cliente";
import { procesarCola } from "../safi/cola";
import {
  avisosDeConfirmacion,
  faltantesDeConfirmacion,
  sugerirConfirmacion,
  valorCuotaDe,
  type AvisoSafi,
} from "../safi/registro";
import { anotarExito, anotarFallo, puedeIntentar } from "./intentos";
import { COOKIE_SESION, OPCIONES_COOKIE, exigirArea, exigirSesion, usuarioDe } from "./sesion";
import {
  recortarObservacion,
  tipoContenidoDe,
  validarConfirmacionSafi,
  validarContenido,
  validarExtension,
  validarFirmas,
  validarObservacion,
  validarRolAdjunto,
  validarSolicitudEntrante,
  validarTipoDocumento,
} from "./validacion";

/**
 * API del servidor.
 *
 * La consumen dos clientes: la aplicación móvil del Área de Socios, que
 * registra las afiliaciones con sus firmas y su fotografía, y la bandeja de
 * tareas web, desde la que el Área de Socios crea el socio en SAFI,
 * Contabilidad revisa y la Gerencia aprueba.
 */

function incidenciasParaBandeja() {
  return incidenciasAbiertas().map((i) => ({
    id: i.id,
    archivo: i.archivo,
    motivo: i.motivo as never,
    detalle: i.detalle,
    detectadaEn: i.detectadaEn,
    tipo: i.tipo,
    numeroSocio: i.numeroSocio ?? undefined,
  }));
}

/**
 * Opciones que el panel del Área de Socios ofrece en cada lista.
 *
 * Manda lo que el CRM diga en vivo; el catálogo de `campos.ts` solo entra
 * cuando SAFI no responde o cuando la integración está en modo manual. Así una
 * lista que el Club amplíe en el CRM aparece sin tocar el código, y a la vez la
 * bandeja sigue siendo utilizable con el CRM caído.
 */
function listasParaPanel(delCrm: ListasSafi | null) {
  const elegir = (vivas: string[] | undefined, respaldo: readonly string[]): string[] =>
    depurar(vivas && vivas.length > 0 ? vivas : [...respaldo]);

  return {
    grupoFacturacion: elegir(delCrm?.grupoFacturacion, GRUPOS_FACTURACION),
    formaPago: elegir(delCrm?.formaPago, FORMAS_PAGO_SAFI),
    tipoContribuyente: elegir(delCrm?.tipoContribuyente, TIPOS_CONTRIBUYENTE),
    suscripcion: elegir(delCrm?.suscripcion, SUSCRIPCIONES_SAFI),
    cuotaAnual: elegir(delCrm?.cuotaAnual, CUOTAS_ANUALES_SAFI),
    cuotaMensual: elegir(delCrm?.cuotaMensual, CUOTAS_MENSUALES_SAFI),
    valorMembresia: elegir(delCrm?.valorMembresia, MEMBRESIAS_SAFI),
  };
}

/**
 * Deja fuera lo que nadie debería llegar a elegir.
 *
 * Las listas del CRM arrastran restos de la carga histórica: marcadores como
 * `????` o `Complete Aqui`, y duplicados del mismo importe escritos de dos
 * maneras (`7000` y `7000,00`). Se siguen aceptando si una ficha antigua los
 * trae —por eso están en el catálogo de `campos.ts`— pero ofrecerlos en un
 * desplegable sería invitar a repetir el error.
 */
function depurar(valores: string[]): string[] {
  const vistos = new Set<string>();
  const limpios: string[] = [];

  for (const valor of valores) {
    if (VALORES_DE_RELLENO.has(valor)) continue;

    const numero = Number(valor.replace(",", "."));
    const clave = Number.isFinite(numero) && valor.trim() !== "" ? String(numero) : valor;
    if (vistos.has(clave)) continue;

    vistos.add(clave);
    limpios.push(valor);
  }

  return limpios;
}

/** Resumen de una solicitud para las listas: no viaja el expediente completo. */
function resumir(solicitud: SolicitudAfiliacion) {
  return {
    id: solicitud.id,
    codigo: solicitud.codigo,
    estado: solicitud.estado,
    numeroSocio: numeroEnExpediente(solicitud),
    cedula: solicitud.datos.cedula,
    nombre: nombreCompleto(solicitud.datos),
    tipoMiembro: nombreTipo(solicitud.datos.tipoMiembro),
    creadaEn: solicitud.creadaEn,
    actualizadaEn: solicitud.actualizadaEn,
    revision: solicitud.tramite.revision,
    aprobacion: solicitud.tramite.aprobacion,
    creadoEnSafi: creadoEnSafi(solicitud),
  };
}

/** Lo que la tableta necesita saber de un trámite que ya envió. */
function avanceParaTableta(solicitud: SolicitudAfiliacion) {
  return {
    id: solicitud.id,
    codigo: solicitud.codigo,
    estado: solicitud.estado,
    actualizadaEn: solicitud.actualizadaEn,
    tramite: solicitud.tramite,
    expediente: solicitud.expediente,
    historial: solicitud.historial,
  };
}

/**
 * Lo que se asume cuando no se pudo consultar el CRM: ninguna comprobación
 * hecha y ningún aviso. El panel lo advierte con `consultadoEnSafi`.
 */
function sinVerificar(): VerificacionSafi {
  return { consultado: false, avisos: [], cuentaTitular: null, ordinalSugerido: null, fichas: [] };
}

/** Estado del sistema que la bandeja muestra en su pie. */
function estadoDelSistema() {
  const adaptador = adaptadorSafi();
  return {
    safiModo: adaptador.modo,
    safiEscritura: adaptador.escritura,
    pdfDisponible: pdfDisponible(),
    vigilanciaActiva: vigilanciaActiva(),
  };
}

export async function registrarApi(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------------- */
  /* Sesión                                                            */
  /* ---------------------------------------------------------------- */

  app.post("/api/sesion", async (peticion, respuesta) => {
    const cuerpo = peticion.body as
      | { usuario?: string; clave?: string; dispositivo?: string }
      | undefined;
    if (!cuerpo?.usuario || !cuerpo?.clave) {
      return respuesta.code(400).send({ error: "Indique usuario y contraseña." });
    }

    const espera = puedeIntentar(cuerpo.usuario, peticion.ip);
    if (!espera.permitido) {
      return respuesta.code(429).send({
        error: `Demasiados intentos fallidos. Vuelva a intentarlo en ${espera.segundos} segundos.`,
      });
    }

    const usuario = autenticar(cuerpo.usuario, cuerpo.clave);
    if (!usuario) {
      anotarFallo(cuerpo.usuario, peticion.ip);
      registrarBitacora({
        usuario: cuerpo.usuario,
        accion: "SESION_RECHAZADA",
        detalle: peticion.ip,
      });
      return respuesta.code(401).send({ error: "Usuario o contraseña incorrectos." });
    }

    anotarExito(cuerpo.usuario, peticion.ip);

    // La tableta del Área de Socios recibe una sesión larga: envía sola lo que
    // registra, y con una sesión de jornada dejaba de hacerlo cada mañana.
    const esTableta = cuerpo.dispositivo === "tableta" && usuario.area === "SOCIOS";
    const horas = esTableta ? config.horasSesionTableta : config.horasSesion;
    const sesion = abrirSesion(usuario.id, horas);
    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "SESION_INICIADA",
      detalle: esTableta ? "tableta" : undefined,
    });

    return respuesta
      .setCookie(COOKIE_SESION, sesion, { ...OPCIONES_COOKIE, maxAge: horas * 3600 })
      .send({
        usuario: usuario.usuario,
        nombre: usuario.nombre,
        area: usuario.area,
        // Igual que `GET /api/sesion`: la tableta no necesita una segunda
        // petición para saber si este funcionario ya cargó su firma.
        firmaCargada: Boolean(firmaDeFuncionario(usuario.usuario)),
      });
  });

  app.delete("/api/sesion", async (peticion, respuesta) => {
    const bruta = peticion.cookies[COOKIE_SESION];
    if (bruta) {
      const verificada = peticion.unsignCookie(bruta);
      if (verificada.valid && verificada.value) cerrarSesion(verificada.value);
    }
    return respuesta.clearCookie(COOKIE_SESION, { path: "/" }).send({ ok: true });
  });

  app.get("/api/sesion", async (peticion, respuesta) => {
    const usuario = usuarioDe(peticion);
    if (!usuario) return respuesta.code(401).send({ error: "Sin sesión." });
    return respuesta.send({
      usuario: usuario.usuario,
      nombre: usuario.nombre,
      area: usuario.area,
      etiquetaArea: AREA_META[usuario.area].etiqueta,
      firmaCargada: Boolean(firmaDeFuncionario(usuario.usuario)),
    });
  });

  /**
   * Firma del funcionario, la que se estampa en su constancia del reverso.
   *
   * La carga **cada funcionario desde la tableta**, autenticado con su propio
   * usuario y una sola vez: es la decisión del Coordinador del 15/09/2026.
   * Quien no la cargue sigue trabajando igual; su constancia se imprime solo
   * con su nombre.
   */
  app.get("/api/mi-firma", async (peticion, respuesta) => {
    const usuario = exigirSesion(peticion, respuesta);
    if (!usuario) return respuesta;

    const firma = firmaDeFuncionario(usuario.usuario);
    if (!firma) return respuesta.send({ cargada: false, en: null });
    return respuesta.send({ cargada: true, en: usuario.firmaEn });
  });

  /**
   * La firma del funcionario llega de dos maneras, y las dos son legítimas:
   *
   *   · **En el JSON, como base64** (`{ firma }`). Es la de la tableta, y es el
   *     camino que funciona: la aplicación **no consigue enviar
   *     `multipart/form-data`** —el envío falla en el dispositivo antes de salir
   *     a la red y aquí no llega ni una petición—, que es lo que le pasaba
   *     también a la fotografía tipo carnet. Las firmas del solicitante y de los
   *     garantes viajan así desde el principio, y nunca fallaron.
   *   · **Como archivo adjunto**, para un navegador o una herramienta que suba
   *     un PNG o un JPG ya existente.
   */
  app.post("/api/mi-firma", async (peticion, respuesta) => {
    const usuario = exigirSesion(peticion, respuesta);
    if (!usuario) return respuesta;

    let contenido: Buffer;
    let extension: string | null;

    if (peticion.isMultipart()) {
      const parte = await peticion.file();
      if (!parte) return respuesta.code(400).send({ error: "No se recibió ninguna firma." });
      contenido = await parte.toBuffer();
      extension = extensionDeFirma(parte.mimetype ?? "");
    } else {
      const firma = (peticion.body as { firma?: unknown } | undefined)?.firma;
      if (typeof firma !== "string" || !firma.trim()) {
        return respuesta.code(400).send({ error: "No se recibió ninguna firma." });
      }
      if (firma.length > MAXIMO_BYTES_FIRMA * 2) {
        return respuesta
          .code(413)
          .send({ error: "La firma es demasiado grande: envíe una imagen de menos de 2 MB." });
      }
      contenido = Buffer.from(firma.replace(/^data:[^;]+;base64,/, ""), "base64");
      // El lienzo de la tableta produce siempre un PNG; que el contenido lo sea
      // se comprueba abajo, con la misma lectura de cabecera que el expediente.
      extension = ".png";
    }

    if (contenido.length === 0) {
      return respuesta.code(400).send({ error: "La firma llegó vacía." });
    }
    if (contenido.length > MAXIMO_BYTES_FIRMA) {
      return respuesta
        .code(413)
        .send({ error: "La firma es demasiado grande: envíe una imagen de menos de 2 MB." });
    }
    if (!extension) {
      return respuesta
        .code(415)
        .send({ error: "La firma debe ser una imagen PNG o JPG trazada en la tableta." });
    }

    const formato = validarContenido(contenido, extension);
    if (!formato.ok) return respuesta.code(415).send({ error: formato.error });

    const en = guardarFirmaFuncionario({ usuario: usuario.usuario, contenido, extension });

    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "CARGAR_FIRMA_FUNCIONARIO",
      detalle: `${usuario.nombre} cargó su firma desde la tableta.`,
    });

    return respuesta.code(201).send({ cargada: true, en });
  });

  /* ---------------------------------------------------------------- */
  /* Bandeja de tareas                                                 */
  /* ---------------------------------------------------------------- */

  app.get("/api/bandeja", async (peticion, respuesta) => {
    const usuario = exigirSesion(peticion, respuesta);
    if (!usuario) return respuesta;

    // Solo se recorren las solicitudes que aún generan tareas y las últimas
    // actualizadas: el coste depende de lo pendiente, no del histórico.
    const incidencias = incidenciasParaBandeja();
    const pendientesConTareas = solicitudesConTareas();
    const tareas = calcularTareas(pendientesConTareas, incidencias);

    return respuesta.send({
      area: usuario.area,
      etiquetaArea: AREA_META[usuario.area].etiqueta,
      accion: AREA_META[usuario.area].accion,
      pendientes: tareasDeArea(usuario.area, tareas),
      // Lo que viene hacia esta área pero todavía está en manos de otra: sin
      // esta lista, una bandeja vacía no distingue «no hay nada» de «algo se
      // quedó atascado antes de llegarme».
      enCamino: enCaminoHacia(usuario.area, pendientesConTareas).map(resumir),
      atendidas: atendidasPor(usuario.area, solicitudesRecientes()).slice(0, 100).map(resumir),
      contadores: contadoresDeTareas(tareas),
      instructivoEscaneo: usuario.area === "SOCIOS" ? INSTRUCTIVO_ESCANEO : [],
      // Para asignar a mano un escaneo que el vigilante no pudo identificar.
      catalogoDocumentos:
        usuario.area === "SOCIOS"
          ? TIPOS_DOCUMENTO.map((tipo) => ({ tipo, nombre: nombreDocumento(tipo) }))
          : [],
      /**
       * Documentos que caben en cada trámite abierto, por su tipo de socio.
       *
       * Sin esto el diálogo de asignación ofrecía todos los tipos y se podía
       * archivar «Cédula del oficial FAE del que depende» en el expediente de un
       * Socio Activo, que no depende de nadie. Pasó en la prueba del 15/09/2026.
       */
      documentosPorTramite:
        usuario.area === "SOCIOS"
          ? Object.fromEntries(
              pendientesConTareas.map((solicitud) => [
                solicitud.id,
                requisitosPara(solicitud.datos.tipoMiembro).map((requisito) => requisito.tipo),
              ])
            )
          : {},
      sistema: estadoDelSistema(),
    });
  });

  /* ---------------------------------------------------------------- */
  /* Solicitudes                                                       */
  /* ---------------------------------------------------------------- */

  app.get("/api/solicitudes", async (peticion, respuesta) => {
    const usuario = exigirSesion(peticion, respuesta);
    if (!usuario) return respuesta;

    const filtro = peticion.query as { estado?: EstadoSolicitud } | undefined;
    return respuesta.send(
      listarSolicitudes(filtro?.estado ? { estado: filtro.estado } : undefined).map(resumir)
    );
  });

  app.get("/api/solicitudes/:id", async (peticion, respuesta) => {
    const usuario = exigirSesion(peticion, respuesta);
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const solicitud = obtenerSolicitud(id);
    if (!solicitud) return respuesta.code(404).send({ error: "Solicitud no encontrada." });

    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "CONSULTAR_EXPEDIENTE",
      entidad: solicitud.codigo,
    });

    return respuesta.send({
      solicitud,
      documentosDelTramite: documentosDelTramite(
        solicitud.datos.tipoMiembro,
        solicitud.datos.estadoCivil
      ),
      tareas: tareasDeSolicitud(solicitud),
      adjuntosFaltantes: adjuntosFaltantes(solicitud).map((rol) => ({
        rol,
        etiqueta: ROL_ADJUNTO_META[rol].etiqueta,
      })),
      adjuntos: adjuntosDe(solicitud.id).map((a) => ({
        rol: a.rol,
        etiqueta: ROL_ADJUNTO_META[a.rol].etiqueta,
        bytes: a.bytes,
        tipoContenido: a.tipoContenido,
        recibidoEn: a.recibidoEn,
      })),
      archivos: archivosDeSolicitud(solicitud.id).map((a) => ({
        id: a.id,
        tipoDocumento: a.tipoDocumento,
        nombre: nombreDocumento(a.tipoDocumento),
        nombreArchivo: a.nombreArchivo,
        nombreOrigen: a.nombreOrigen,
        bytes: a.bytes,
        origen: a.origen,
        registradoEn: a.registradoEn,
        safiEstado: a.safiEstado,
      })),
      sistema: estadoDelSistema(),
    });
  });

  /**
   * Borra un trámite: su fila, sus adjuntos y su carpeta. Con él desaparecen
   * sus tareas, así que deja de estar en la bandeja.
   *
   * Lo pide la tableta cuando el operador borra los datos de prueba o elimina
   * una solicitud. Antes, lo que se borraba allá seguía aquí: la Jefatura veía
   * en su bandeja trámites de prueba que en la tableta ya no existían, y nadie
   * podía quitarlos.
   *
   * Solo se borra lo que todavía es un dato de prueba (`motivoParaNoBorrar`).
   * Un socio con número, con ficha en SAFI o con documentos archivados no se
   * borra: se **anula** desde la bandeja, con su observación. La bitácora
   * guarda siempre el rastro de lo borrado.
   */
  app.delete("/api/solicitudes/:id", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const solicitud = obtenerSolicitud(id);
    if (!solicitud) return respuesta.code(404).send({ error: "Solicitud no encontrada." });

    const motivo = motivoParaNoBorrar(solicitud, archivosDeSolicitud(id).length);
    if (motivo) return respuesta.code(409).send({ error: motivo });

    borrarSolicitud(id);

    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "BORRAR_AFILIACION",
      entidad: solicitud.codigo,
      detalle: `${nombreCompleto(solicitud.datos)} · ${solicitud.datos.cedula} · borrado desde la tableta`,
    });

    return respuesta.send({ ok: true, codigo: solicitud.codigo });
  });

  /**
   * Un socio del CRM, por su número o por su cédula: para que la tableta traiga
   * los datos de un garante, del titular de un dependiente o del socio del que
   * depende un D-A, D-B o D-C, en lugar de que el operador los escriba
   * (23/09/2026). Devuelve la ficha tal como está en SAFI; qué categoría vale
   * para cada papel lo decide el dominio (`sociosSafi.ts`), igual en los dos
   * lados. Solo lectura.
   */
  app.get("/api/safi/socios", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { numero = "", cedula = "" } = (peticion.query ?? {}) as {
      numero?: string;
      cedula?: string;
    };
    if (!numero && !cedula) {
      return respuesta.code(400).send({ error: "Indique el número de socio o la cédula." });
    }
    if (numero && !/^\d{1,8}$/.test(numero)) {
      return respuesta.code(400).send({ error: "El número de socio solo lleva dígitos." });
    }
    if (!numero && !/^\d{10}$/.test(cedula)) {
      return respuesta.code(400).send({ error: "La cédula lleva diez dígitos." });
    }

    const consulta = await adaptadorSafi()
      .consultarSocio({ numeroSocio: numero, cedula: numero ? "" : cedula })
      .catch((error: unknown) => ({
        consultado: false as const,
        motivo: error instanceof Error ? error.message : String(error),
      }));
    return respuesta.send(consulta);
  });

  /**
   * La consulta del oficial de un D-A o D-B, como la hacía la tableta hasta el
   * 23/09/2026. Se conserva para las tabletas con esa compilación, hasta que se
   * instale la nueva: responde lo mismo que antes, a partir de la consulta
   * general.
   */
  app.get("/api/safi/oficiales/:numero", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { numero } = peticion.params as { numero: string };
    if (!/^\d{1,8}$/.test(numero)) {
      return respuesta.code(400).send({ error: "El número de socio solo lleva dígitos." });
    }

    const consulta = await adaptadorSafi()
      .consultarSocio({ numeroSocio: numero })
      .catch((error: unknown) => ({
        consultado: false as const,
        motivo: error instanceof Error ? error.message : String(error),
      }));
    return respuesta.send(
      consulta.consultado
        ? { consultado: true, oficial: verificacionDe("ACTIVO_O_FUNDADOR", numero, consulta.socio) }
        : consulta
    );
  });

  /**
   * Corrección de una afiliación desde la tableta: los datos de la persona y,
   * si cambió algún garante, su firma.
   *
   * La firma del solicitante no se vuelve a pedir (decisión del Coordinador,
   * 19/09/2026): la corrección queda en el historial, campo por campo. Las de
   * los garantes sí llegan cuando el garante cambió, y sustituyen a las que
   * había, que eran de otra persona.
   */
  app.put("/api/solicitudes/:id", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const comprobacion = validarSolicitudEntrante(peticion.body);
    if (!comprobacion.ok) return respuesta.code(400).send({ error: comprobacion.error });

    const firmas = validarFirmas((peticion.body as { firmas?: unknown }).firmas);
    if (!firmas.ok) return respuesta.code(400).send({ error: firmas.error });

    const entrante = (peticion.body as { solicitud: SolicitudAfiliacion }).solicitud;
    if (entrante.id !== id) {
      return respuesta.code(400).send({ error: "El trámite corregido no es el de la dirección." });
    }

    const resultado = corregirSolicitud(id, entrante, {
      usuario: usuario.usuario,
      area: usuario.area,
      nombre: usuario.nombre,
    });
    if (!resultado.ok) return respuesta.code(resultado.codigo).send({ error: resultado.error });

    const recibidos = new Set(rolesRecibidos(id));
    firmas.valor.garantes.forEach((contenido, indice) => {
      if (!contenido) return;
      const rol = indice === 0 ? "FIRMA_GARANTE_1" : "FIRMA_GARANTE_2";
      guardarAdjunto({
        solicitudId: id,
        rol,
        contenido,
        extension: ".png",
        tipoContenido: "image/png",
      });
      recibidos.add(rol);
    });

    const actualizada = registrarAdjuntosRecibidos(id, [...recibidos]) ?? resultado.solicitud;
    return respuesta.send({ solicitud: actualizada, cambios: resultado.cambios ?? [] });
  });

  /**
   * Registro de una afiliación desde la aplicación móvil, con sus firmas.
   *
   * Es idempotente y también repara: si el trámite ya existe, se devuelve tal
   * como está y se guardan las firmas que aún faltaran. La tableta reintenta
   * cuando pierde una respuesta, y sin esto un trámite podía quedarse para
   * siempre sin la firma con la que se compone el formulario.
   */
  app.post("/api/solicitudes", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const comprobacion = validarSolicitudEntrante(peticion.body);
    if (!comprobacion.ok) return respuesta.code(400).send({ error: comprobacion.error });

    const firmas = validarFirmas((peticion.body as { firmas?: unknown }).firmas);
    if (!firmas.ok) return respuesta.code(400).send({ error: firmas.error });

    const entrante = (peticion.body as { solicitud: SolicitudAfiliacion }).solicitud;
    const { solicitud, nueva } = registrarSolicitud(entrante, {
      usuario: usuario.usuario,
      area: usuario.area,
      nombre: usuario.nombre,
    });

    // Las firmas que falten se guardan siempre, sea el primer envío o un
    // reintento.
    const recibidos = new Set(rolesRecibidos(solicitud.id));
    const guardar = (rol: Parameters<typeof guardarAdjunto>[0]["rol"], contenido: Buffer | null) => {
      if (!contenido || recibidos.has(rol)) return;
      guardarAdjunto({
        solicitudId: solicitud.id,
        rol,
        contenido,
        extension: ".png",
        tipoContenido: "image/png",
      });
      recibidos.add(rol);
    };

    guardar("FIRMA_SOLICITANTE", firmas.valor.solicitante);
    guardar("FIRMA_GARANTE_1", firmas.valor.garantes[0] ?? null);
    guardar("FIRMA_GARANTE_2", firmas.valor.garantes[1] ?? null);

    const actualizada = registrarAdjuntosRecibidos(solicitud.id, [...recibidos]) ?? solicitud;
    return respuesta.code(nueva ? 201 : 200).send(actualizada);
  });

  /**
   * Fotografía (o una firma que se reintenta) que envía la tableta.
   *
   * Se guarda aparte del expediente: en este momento el trámite todavía no
   * tiene número de socio, y sin número no hay carpeta donde archivarla. Al
   * aprobarse el ingreso, la fotografía entra al expediente con el nombre que
   * le corresponde.
   */
  app.post("/api/solicitudes/:id/adjuntos", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const solicitud = obtenerSolicitud(id);
    if (!solicitud) return respuesta.code(404).send({ error: "Solicitud no encontrada." });

    const parte = await peticion.file();
    if (!parte) return respuesta.code(400).send({ error: "No se recibió ningún archivo." });

    const campos = parte.fields as Record<string, { value?: string } | undefined>;
    const rol = validarRolAdjunto(campos.rol?.value);
    if (!rol.ok) return respuesta.code(400).send({ error: rol.error });

    const extension = validarExtension(parte.filename ?? "");
    if (!extension.ok) return respuesta.code(415).send({ error: extension.error });

    const contenido = await parte.toBuffer();
    const formato = validarContenido(contenido, extension.valor);
    if (!formato.ok) return respuesta.code(415).send({ error: formato.error });

    guardarAdjunto({
      solicitudId: solicitud.id,
      rol: rol.valor,
      contenido,
      extension: extension.valor,
      tipoContenido: formato.valor,
    });

    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "RECIBIR_ADJUNTO",
      entidad: solicitud.codigo,
      detalle: ROL_ADJUNTO_META[rol.valor].etiqueta,
    });

    const actualizada = registrarAdjuntosRecibidos(solicitud.id, rolesRecibidos(solicitud.id));
    return respuesta.code(201).send(actualizada ?? solicitud);
  });

  /** Firma o fotografía, para verlas en la bandeja. */
  app.get("/api/solicitudes/:id/adjuntos/:rol", async (peticion, respuesta) => {
    const usuario = exigirSesion(peticion, respuesta);
    if (!usuario) return respuesta;

    const { id, rol } = peticion.params as { id: string; rol: string };
    const comprobado = validarRolAdjunto(rol);
    if (!comprobado.ok) return respuesta.code(400).send({ error: comprobado.error });

    const adjunto = adjuntoDe(id, comprobado.valor);
    if (!adjunto) return respuesta.code(404).send({ error: "Ese archivo no se ha recibido." });

    const ruta = rutaSegura(adjunto.ruta, config.tramitesDir);
    if (!ruta) return respuesta.code(404).send({ error: "El archivo ya no está en el servidor." });

    return respuesta
      .header("Content-Type", adjunto.tipoContenido)
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "private, max-age=60")
      .send(fs.createReadStream(ruta));
  });

  /**
   * Declara que una firma o la fotografía ya no llegarán de la tableta.
   *
   * La firma vive en el almacenamiento privado de la tableta: si el dispositivo
   * se reinstaló o la captura se perdió, ningún reintento la recupera y la
   * tarea de la bandeja se quedaba sin salida. Con esto la Jefatura declara
   * dónde consta —el formulario en papel, normalmente— y el trámite continúa.
   */
  app.post("/api/solicitudes/:id/adjuntos/:rol/omitir", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { id, rol } = peticion.params as { id: string; rol: string };
    const solicitud = obtenerSolicitud(id);
    if (!solicitud) return respuesta.code(404).send({ error: "Solicitud no encontrada." });

    const comprobado = validarRolAdjunto(rol);
    if (!comprobado.ok) return respuesta.code(400).send({ error: comprobado.error });

    const motivo = validarObservacion((peticion.body as { motivo?: unknown })?.motivo);
    if (!motivo.ok) return respuesta.code(400).send({ error: motivo.error });

    const actualizada = omitirAdjunto(id, comprobado.valor, {
      motivo: motivo.valor,
      responsable: usuario.nombre,
    });

    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "OMITIR_ADJUNTO",
      entidad: solicitud.codigo,
      detalle: `${ROL_ADJUNTO_META[comprobado.valor].etiqueta}: ${motivo.valor}`,
    });

    return respuesta.send(actualizada ?? solicitud);
  });

  /**
   * Escaneo que la Jefatura sube desde el navegador, sin pasar por la carpeta
   * compartida.
   *
   * Es la salida de la tarea «falta escanear» cuando Samba no está a mano o el
   * nombre del archivo se resiste: se archiva en el expediente con el nombre
   * que le corresponde, exactamente como si lo hubiera recogido el vigilante.
   */
  app.post("/api/solicitudes/:id/escaneos/:tipo", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { id, tipo } = peticion.params as { id: string; tipo: string };
    const solicitud = obtenerSolicitud(id);
    if (!solicitud) return respuesta.code(404).send({ error: "Solicitud no encontrada." });

    const comprobado = validarTipoDocumento(tipo);
    if (!comprobado.ok) return respuesta.code(400).send({ error: comprobado.error });

    if (!numeroEnExpediente(solicitud)) {
      return respuesta.code(409).send({
        error:
          "El trámite todavía no tiene número de socio, y sin número no hay carpeta donde archivar. Cree primero al socio en SAFI.",
      });
    }

    const parte = await peticion.file();
    if (!parte) return respuesta.code(400).send({ error: "No se recibió ningún archivo." });

    const extension = validarExtension(parte.filename ?? "");
    if (!extension.ok) return respuesta.code(415).send({ error: extension.error });

    const contenido = await parte.toBuffer();
    const formato = validarContenido(contenido, extension.valor);
    if (!formato.ok) return respuesta.code(415).send({ error: formato.error });

    try {
      const resultado = archivarContenido({
        contenido,
        extension: extension.valor,
        solicitud,
        tipoDocumento: comprobado.valor,
        origen: "ESCANEO",
      });

      registrarBitacora({
        usuario: usuario.usuario,
        area: usuario.area,
        accion: "ARCHIVAR_ESCANEO",
        entidad: numeroEnExpediente(solicitud),
        detalle: `${comprobado.valor} · ${resultado.archivo.nombreArchivo} (subido desde la bandeja)`,
      });

      return respuesta.code(201).send({
        ok: true,
        nombreArchivo: resultado.archivo.nombreArchivo,
        reemplazado: resultado.reemplazado,
      });
    } catch (error) {
      return respuesta
        .code(500)
        .send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /** Documento por escanear que este trámite no necesita, con su justificación. */
  app.post("/api/solicitudes/:id/escaneos/:tipo/omitir", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { id, tipo } = peticion.params as { id: string; tipo: string };
    const solicitud = obtenerSolicitud(id);
    if (!solicitud) return respuesta.code(404).send({ error: "Solicitud no encontrada." });

    const comprobado = validarTipoDocumento(tipo);
    if (!comprobado.ok) return respuesta.code(400).send({ error: comprobado.error });

    const motivo = validarObservacion((peticion.body as { motivo?: unknown })?.motivo);
    if (!motivo.ok) return respuesta.code(400).send({ error: motivo.error });

    const actualizada = omitirEscaneo(id, comprobado.valor, {
      motivo: motivo.valor,
      responsable: usuario.nombre,
    });

    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "OMITIR_ESCANEO",
      entidad: solicitud.codigo,
      detalle: `${nombreDocumento(comprobado.valor)}: ${motivo.valor}`,
    });

    return respuesta.send(actualizada ?? solicitud);
  });

  /**
   * Avance de los trámites que la tableta ya envió: su estado, las constancias
   * y el número de socio que se les asignó. Es lo que permite que la tableta
   * muestre lo mismo que la bandeja.
   */
  app.post("/api/tableta/avance", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const cuerpo = (peticion.body ?? {}) as { ids?: unknown };
    const ids = Array.isArray(cuerpo.ids)
      ? cuerpo.ids.filter((id): id is string => typeof id === "string").slice(0, 300)
      : [];

    const avances = [];
    const desconocidos: string[] = [];
    for (const id of ids) {
      const solicitud = obtenerSolicitud(id);
      if (solicitud) avances.push(avanceParaTableta(solicitud));
      else desconocidos.push(id);
    }

    return respuesta.send({ avances, desconocidos });
  });

  /* ---------------------------------------------------------------- */
  /* El formulario del trámite                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Formulario completo en pantalla: R-PGS1-1, hoja de solicitud, carta y
   * reverso con las constancias que haya hasta ahora, con las firmas de la
   * tableta. Contabilidad y la Gerencia revisan y aprueban con el documento
   * delante; antes solo veían el nombre y la cédula.
   */
  app.get("/api/solicitudes/:id/formulario", async (peticion, respuesta) => {
    const usuario = exigirSesion(peticion, respuesta);
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const solicitud = obtenerSolicitud(id);
    if (!solicitud) return respuesta.code(404).send({ error: "Solicitud no encontrada." });

    const html = htmlDeSolicitud(solicitud);
    if (!html) {
      return respuesta.code(409).send({ error: "El trámite no tiene tipo de socio." });
    }

    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "VER_FORMULARIO",
      entidad: solicitud.codigo,
    });

    // El formulario lleva su hoja de estilos y sus imágenes incrustadas: se
    // permite el estilo en línea, y nada más que eso.
    return respuesta
      .header("Content-Type", "text/html; charset=utf-8")
      .header(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"
      )
      .send(html);
  });

  /** El mismo formulario, impreso en PDF por el servidor. */
  app.get("/api/solicitudes/:id/formulario.pdf", async (peticion, respuesta) => {
    const usuario = exigirSesion(peticion, respuesta);
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const solicitud = obtenerSolicitud(id);
    if (!solicitud) return respuesta.code(404).send({ error: "Solicitud no encontrada." });

    if (!pdfDisponible()) {
      return respuesta.code(503).send({
        error:
          "Este servidor no tiene navegador para imprimir el PDF. Abra el formulario en pantalla y guárdelo como PDF desde su navegador.",
      });
    }

    try {
      const pdf = await pdfDeSolicitud(solicitud);
      registrarBitacora({
        usuario: usuario.usuario,
        area: usuario.area,
        accion: "DESCARGAR_FORMULARIO",
        entidad: solicitud.codigo,
      });
      return respuesta
        .header("Content-Type", "application/pdf")
        .header("X-Content-Type-Options", "nosniff")
        .header(
          "Content-Disposition",
          `inline; filename="${encodeURIComponent(`${solicitud.codigo}.pdf`)}"`
        )
        .send(pdf);
    } catch (error) {
      return respuesta
        .code(500)
        .send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /** Reintento del archivado del formulario final, si falló al aprobarse. */
  app.post("/api/solicitudes/:id/formulario-final", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const resultado = await archivarFormularioFinal(id);
    if (!resultado.ok) return respuesta.code(409).send({ error: resultado.mensaje });

    void procesarCola();
    return respuesta.send({
      ok: true,
      mensaje: `Formulario archivado como «${resultado.nombreArchivo}».`,
    });
  });

  /* ---------------------------------------------------------------- */
  /* Constancias del reverso: revisar, aprobar, devolver, reenviar      */
  /* ---------------------------------------------------------------- */

  type CuerpoAccion = { observacion?: string; numeroFactura?: string; numeroTarjeta?: string };

  const responderAvance = (
    respuesta: FastifyReply,
    resultado: { ok: true; solicitud: SolicitudAfiliacion } | { ok: false; codigo: number; error: string }
  ) => (resultado.ok ? respuesta.send(resultado.solicitud) : respuesta.code(resultado.codigo).send({ error: resultado.error }));

  /**
 * El actor de una acción, con su firma ya copiada a la carpeta del trámite.
 *
 * Se llama solo en las acciones que pasan el trámite al área siguiente —el
 * registro de la Jefatura, la revisión de Contabilidad y la aprobación de la
 * Gerencia—, que son las tres constancias firmadas del reverso. Si el
 * funcionario no ha cargado su firma desde la tableta, devuelve `null` y la
 * constancia se imprime solo con su nombre, como se venía haciendo.
 */
/**
 * Un D-C con el número del oficial FAE del que desciende —su abuelo, el de su
 * Parentesco— ya resuelto, y de dónde salió:
 *
 *   1. el que escribe la Jefatura en el panel, si escribe uno;
 *   2. el que trajo la tableta;
 *   3. el del trámite de su socio D-B, si ese D-B se afilió por este sistema.
 *
 * Sea cual sea el origen, el servidor lo comprueba en SAFI antes del alta
 * (`comprobarReferencias`). Los demás tipos pasan sin cambios.
 */
function conOficialDelDC(
  solicitud: SolicitudAfiliacion,
  delPanel: string
): { solicitud: SolicitudAfiliacion; origen: string | null } {
  if (solicitud.datos.tipoMiembro !== "DC") return { solicitud, origen: null };
  const panel = normalizarNumeroSocio(delPanel);
  const tableta = normalizarNumeroSocio(solicitud.datos.numeroOficialFae ?? "");
  const deSuDependienteB =
    panel || tableta ? null : oficialDeUnDependienteB(solicitud.datos.numeroSocioActivo);
  const numero = panel || tableta || deSuDependienteB?.numero || "";
  const origen = panel
    ? "escrito en el panel"
    : tableta
      ? "declarado en la tableta"
      : deSuDependienteB
        ? `tomado del trámite ${deSuDependienteB.codigo} de su socio D-B`
        : null;
  return { solicitud: { ...solicitud, datos: { ...solicitud.datos, numeroOficialFae: numero } }, origen };
}

function actorConFirma(usuario: Usuario, solicitudId: string) {
  return {
    usuario: usuario.usuario,
    area: usuario.area,
    nombre: usuario.nombre,
    firmaArchivo: estamparFirma({
      usuario: usuario.usuario,
      solicitudId,
      area: usuario.area,
    }),
  };
}

  /** Contabilidad marca REVISADO y registra la casilla FC del formulario. */
  app.post("/api/solicitudes/:id/revisar", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "CONTABILIDAD");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const cuerpo = (peticion.body ?? {}) as CuerpoAccion;

    return responderAvance(
      respuesta,
      revisar(
        id,
        {
          observacion: recortarObservacion(cuerpo.observacion),
          numeroFactura: recortarObservacion(cuerpo.numeroFactura, 60),
        },
        actorConFirma(usuario, id)
      )
    );
  });

  /**
   * La Gerencia aprueba el ingreso. Al aprobarse se archiva el formulario
   * final en el expediente y, con él, el expediente pasa a publicarse en SAFI.
   */
  app.post("/api/solicitudes/:id/aprobar", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "GERENCIA");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const cuerpo = (peticion.body ?? {}) as CuerpoAccion;

    const resultado = aprobar(
      id,
      { observacion: recortarObservacion(cuerpo.observacion) },
      actorConFirma(usuario, id)
    );
    if (!resultado.ok) return respuesta.code(resultado.codigo).send({ error: resultado.error });

    // Imprimir el formulario lleva unos segundos: no se hace esperar a la
    // Gerencia. Si falla, queda la tarea «Falta archivar el formulario final»
    // con el motivo escrito.
    void archivarFormularioFinal(id)
      .then((archivado) => {
        if (archivado.ok) void procesarCola();
        else console.warn(`[formulario] ${archivado.mensaje}`);
      })
      .catch((error) => console.warn("[formulario] Error archivando el formulario final:", error));

    return respuesta.send(resultado.solicitud);
  });

  /** Contabilidad o la Gerencia devuelven el trámite con observaciones. */
  app.post("/api/solicitudes/:id/observar", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "CONTABILIDAD", "GERENCIA");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const cuerpo = (peticion.body ?? {}) as CuerpoAccion & { destino?: unknown };
    const observacion = validarObservacion(cuerpo.observacion);
    if (!observacion.ok) return respuesta.code(400).send({ error: observacion.error });

    // Solo la Gerencia elige a quién devolver; Contabilidad devuelve siempre al
    // Área de Socios, diga lo que diga el cuerpo.
    const destino =
      usuario.area === "GERENCIA" && cuerpo.destino === "CONTABILIDAD" ? "CONTABILIDAD" : "SOCIOS";

    return responderAvance(
      respuesta,
      devolver(
        id,
        { observacion: observacion.valor, destino },
        // Una devolución no estampa firma: solo se firma al pasar el trámite al
        // área siguiente. Quien devuelve, no da su visto bueno.
        { usuario: usuario.usuario, area: usuario.area, nombre: usuario.nombre }
      )
    );
  });

  /** El Área de Socios atiende la observación y reenvía el trámite. */
  app.post("/api/solicitudes/:id/reenviar", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const cuerpo = (peticion.body ?? {}) as CuerpoAccion;
    const observacion = validarObservacion(cuerpo.observacion);
    if (!observacion.ok) return respuesta.code(400).send({ error: observacion.error });

    return responderAvance(
      respuesta,
      reenviar(
        id,
        { observacion: observacion.valor },
        { usuario: usuario.usuario, area: usuario.area, nombre: usuario.nombre }
      )
    );
  });

  /** El Área de Socios anula un trámite que no procede. */
  app.post("/api/solicitudes/:id/anular", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const cuerpo = (peticion.body ?? {}) as CuerpoAccion;
    const observacion = validarObservacion(cuerpo.observacion);
    if (!observacion.ok) return respuesta.code(400).send({ error: observacion.error });

    return responderAvance(
      respuesta,
      anular(
        id,
        { observacion: observacion.valor },
        { usuario: usuario.usuario, area: usuario.area, nombre: usuario.nombre }
      )
    );
  });

  /** «Número de tarjeta» del reverso: la credencial que imprime Card Five. */
  app.post("/api/solicitudes/:id/tarjeta", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const cuerpo = (peticion.body ?? {}) as CuerpoAccion;

    return responderAvance(
      respuesta,
      registrarTarjeta(id, recortarObservacion(cuerpo.numeroTarjeta, 40), {
        usuario: usuario.usuario,
        area: usuario.area,
        nombre: usuario.nombre,
      })
    );
  });

  /* ---------------------------------------------------------------- */
  /* Alta en el CRM de SAFI                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Lo que el Área de Socios necesita para confirmar el alta: la propuesta del
   * sistema, las listas de valores que SAFI admite, lo que el CRM ya tiene con
   * ese número o esa cédula, y los avisos de lo que no podrá guardar.
   */
  app.get("/api/solicitudes/:id/safi", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const solicitud = obtenerSolicitud(id);
    if (!solicitud) return respuesta.code(404).send({ error: "Solicitud no encontrada." });

    const adaptador = adaptadorSafi();
    // Las listas vivas del CRM mandan sobre el catálogo de respaldo: si el Club
    // añadió un valor esta semana, debe aparecer aquí sin tocar el código.
    const delCrm = await adaptador.listas().catch(() => null);

    const propuesta = solicitud.expediente.confirmacionSafi ?? sugerirConfirmacion(solicitud);
    const esTitular = tieneCuentaPropia(solicitud.datos.tipoMiembro);
    const numeroTitular = solicitud.datos.titularNumeroSocio;
    const numeroSocio = esTitular ? solicitud.tramite.numeroSocio : numeroTitular;

    const ordinalLocal = esTitular
      ? null
      : solicitud.tramite.ordinalDependiente ?? siguienteOrdinalDependiente(numeroTitular);

    // Comprobación de solo lectura en el CRM: números y cédulas ya usados, y la
    // Cuenta del titular de un dependiente.
    const verificacion = numeroSocio
      ? await adaptador
          .verificar({ solicitud, numeroSocio, ordinalDependiente: ordinalLocal })
          .catch(sinVerificar)
      : sinVerificar();

    const ordinalDependiente = esTitular
      ? null
      : solicitud.tramite.ordinalDependiente ?? verificacion.ordinalSugerido ?? ordinalLocal;

    // Los socios a los que se refiere el trámite: el oficial de un D-A o D-B,
    // el D-B de un D-C y el oficial del que desciende (su abuelo), el titular
    // de un dependiente y los garantes.
    const delDC = conOficialDelDC(solicitud, "");
    const referencias = await comprobarReferencias(adaptador, delDC.solicitud);

    const cuentaTitular = esTitular
      ? null
      : verificacion.cuentaTitular?.id ?? cuentaSafiDelTitular(numeroTitular);

    return respuesta.send({
      codigo: solicitud.codigo,
      nombreSocio: nombreCompleto(solicitud.datos),
      cedula: solicitud.datos.cedula,
      tipoMiembro: nombreTipo(solicitud.datos.tipoMiembro),
      modo: adaptador.modo,
      escritura: adaptador.escritura,
      /** Con la escritura apagada, el alta la hace una persona en el CRM. */
      altaManual: !adaptador.escritura,
      esTitular,
      // En un dependiente el número y la Cuenta son los del titular: no se
      // piden de nuevo ni se pueden cambiar aquí.
      numeroSocio,
      ordinalDependiente,
      cuentaTitular,
      nombreTitular: nombreTitular(solicitud.datos),
      // El cónyuge, los padres y el juvenil no pagan cuota propia: quedan
      // cubiertos por la del titular, y el panel no debe pedírsela.
      pagaCuota:
        periodicidadesDe(solicitud.datos.tipoMiembro, solicitud.datos.estadoCivil).length > 0,
      propuesta,
      listas: listasParaPanel(delCrm),
      listasEnVivo: delCrm !== null,
      consultadoEnSafi: verificacion.consultado,
      fichasEnSafi: verificacion.fichas ?? [],
      avisos: [
        ...verificacion.avisos,
        ...referencias.avisos,
        ...avisosDeConfirmacion(solicitud, propuesta, delCrm ?? undefined),
      ],
      oficialDependencia: referencias.dependencia.verificacion,
      // D-C: el oficial FAE del que desciende. El panel lo muestra en un campo
      // que la Jefatura puede completar o corregir; su grado y su nombre van al
      // Parentesco.
      oficialFae: referencias.oficialFae.aplica
        ? {
            numero: delDC.solicitud.datos.numeroOficialFae ?? "",
            origen: delDC.origen,
            verificacion: referencias.oficialFae.verificacion,
          }
        : null,
      yaCreado: creadoEnSafi(solicitud),
    });
  });

  /** Confirmación de la Jefatura de Socios y alta efectiva en el CRM. */
  app.post("/api/solicitudes/:id/safi", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const solicitud = obtenerSolicitud(id);
    if (!solicitud) return respuesta.code(404).send({ error: "Solicitud no encontrada." });
    if (creadoEnSafi(solicitud)) {
      return respuesta
        .code(409)
        .send({ error: "Esta persona ya fue creada en SAFI. No se vuelve a crear." });
    }
    if (solicitud.estado === "RECHAZADA") {
      return respuesta.code(409).send({ error: "El trámite está anulado: no se crea nada en SAFI." });
    }

    const comprobacion = validarConfirmacionSafi(peticion.body);
    if (!comprobacion.ok) return respuesta.code(400).send({ error: comprobacion.error });

    const { numeroSocio, ordinalDependiente } = comprobacion;
    const confirmacion = {
      ...comprobacion.confirmacion,
      // El Valor Cuota de la Cuenta es la cuota que la Jefatura eligió —la
      // mensual o la anual—, no un valor aparte (decisión del Coordinador,
      // 23/09/2026). Se calcula aquí aunque el panel ya lo muestre.
      valorCuota: valorCuotaDe(comprobacion.confirmacion),
      confirmadaPor: usuario.nombre,
      confirmadaEn: new Date().toISOString(),
    };

    const faltan = faltantesDeConfirmacion(solicitud, confirmacion);
    if (faltan.length > 0) {
      return respuesta
        .code(400)
        .send({ error: `Complete antes de crear en SAFI: ${faltan.join(", ")}.` });
    }

    const esTitular = tieneCuentaPropia(solicitud.datos.tipoMiembro);

    // Dos personas no pueden ocupar el mismo sitio del repositorio: el mismo
    // número con la misma secuencia sería el mismo nombre de archivo.
    const ocupante = personaEnExpediente(numeroSocio, esTitular ? null : ordinalDependiente);
    if (ocupante && ocupante.id !== solicitud.id) {
      return respuesta.code(409).send({
        error: `El número ${numeroSocio}${
          esTitular ? "" : `-${ordinalDependiente}`
        } ya lo ocupa el trámite ${ocupante.codigo} (${nombreCompleto(ocupante.datos)}). Use otro número o anule ese trámite.`,
      });
    }

    // La solicitud debe llevar ya el número de socio para poder componer los
    // campos del CRM y el nombre de la carpeta del expediente.
    const adaptador = adaptadorSafi();

    // Los socios a los que se refiere el trámite deben ser de la categoría que
    // su papel exige, y el grado y el nombre del socio del que depende, tal
    // como constan en SAFI, van a su Parentesco.
    const numeroOficialDelPanel = String(
      (peticion.body as { numeroOficialFae?: unknown } | undefined)?.numeroOficialFae ?? ""
    ).trim();
    if (numeroOficialDelPanel && !/^\d{1,8}$/.test(numeroOficialDelPanel)) {
      return respuesta
        .code(400)
        .send({ error: "El número de socio del oficial FAE solo lleva dígitos." });
    }
    const delDC = conOficialDelDC(solicitud, numeroOficialDelPanel);
    const referencias = await comprobarReferencias(adaptador, delDC.solicitud);
    const conNumeros = {
      ...delDC.solicitud,
      // El socio con que se compone el Parentesco es el que el servidor acaba
      // de comprobar en SAFI, o ninguno: nunca el que trajo la tableta sin que
      // el servidor pudiera confirmarlo.
      datos: {
        ...delDC.solicitud.datos,
        ...(referencias.dependencia.aplica
          ? { oficialDependencia: referencias.dependencia.verificacion }
          : {}),
        ...(referencias.oficialFae.aplica
          ? { oficialFaeVerificado: referencias.oficialFae.verificacion }
          : {}),
        ...(referencias.titular.aplica ? { titularVerificado: referencias.titular.verificacion } : {}),
      },
      tramite: { ...solicitud.tramite, numeroSocio, ordinalDependiente },
    };
    const verificacion = await adaptador
      .verificar({ solicitud: conNumeros, numeroSocio, ordinalDependiente })
      .catch(sinVerificar);

    const cuentaTitularSafi = verificacion.cuentaTitular?.id ?? null;
    const cuentaId = esTitular
      ? solicitud.expediente.cuentaSafiId ?? null
      : cuentaTitularSafi ?? cuentaSafiDelTitular(solicitud.datos.titularNumeroSocio);

    // Un valor que SAFI no puede guardar hace fallar el alta, así que se detiene
    // antes de intentarla. Con el alta manual escribe una persona, que puede
    // haber añadido ya el valor en el CRM: ahí un aviso de catálogo informa y no
    // detiene. Los de coherencia detienen siempre, porque una ficha con dos
    // cuotas a la vez, o un número de socio ya usado, es igual de falso se
    // escriba a mano o por la API.
    const avisos = [
      ...verificacion.avisos,
      ...referencias.avisos,
      ...avisosDeConfirmacion(conNumeros, confirmacion, (await adaptador.listas().catch(() => null)) ?? undefined),
    ];
    const bloqueantes = avisos.filter(
      (aviso) => aviso.bloquea && (aviso.origen === "COHERENCIA" || adaptador.escritura)
    );

    if (bloqueantes.length > 0) {
      return respuesta.code(409).send({
        error: bloqueantes.map((aviso) => aviso.mensaje).join(" "),
        avisos: bloqueantes,
      });
    }

    // Lo que SAFI dijo queda en el trámite: es con lo que se compuso el
    // Parentesco y lo que imprime la línea «de …» del formulario final.
    fijarVerificaciones(id, {
      oficialDependencia: referencias.dependencia.verificacion ?? undefined,
      titularVerificado: referencias.titular.verificacion ?? undefined,
      ...(referencias.oficialFae.aplica
        ? {
            oficialFaeVerificado: referencias.oficialFae.verificacion ?? undefined,
            numeroOficialFae: delDC.solicitud.datos.numeroOficialFae,
          }
        : {}),
    });

    const alta = await adaptador.darDeAlta({ solicitud: conNumeros, confirmacion, cuentaId });

    // Con el alta manual, quien escribe en el CRM es una persona y transcribe
    // aquí los identificadores que SAFI le asignó. Sin ellos el expediente no
    // puede publicar después sus documentos contra la Cuenta correcta.
    const manual = !alta.ok && Boolean(alta.requiereAltaManual);
    if (manual) {
      const problemas = await adaptador.comprobarIdentificadores({
        solicitud: conNumeros,
        numeroSocio,
        cuentaSafiId: comprobacion.cuentaSafiId,
        socioSafiId: comprobacion.socioSafiId,
      });
      const graves = problemas.filter((aviso) => aviso.bloquea);
      if (graves.length > 0) {
        return respuesta
          .code(409)
          .send({ error: graves.map((aviso) => aviso.mensaje).join(" "), avisos: graves });
      }
      avisos.push(...problemas);
    }

    const cuentaFinal = alta.ok
      ? alta.cuentaId
      : (manual ? comprobacion.cuentaSafiId : null) ?? alta.cuentaId ?? cuentaId;
    const socioFinal = alta.ok ? alta.socioId : manual ? comprobacion.socioSafiId : null;

    const actualizada = guardarAltaSafi(
      id,
      {
        numeroSocio,
        ordinalDependiente,
        confirmacion,
        cuentaSafiId: cuentaFinal,
        socioSafiId: socioFinal,
        mensaje: alta.ok || socioFinal ? undefined : alta.mensaje,
        observacion: recortarObservacion((peticion.body as CuerpoAccion | undefined)?.observacion),
      },
      actorConFirma(usuario, id)
    );

    const creado = alta.ok || Boolean(socioFinal);
    return respuesta.code(creado ? 200 : 202).send({
      creado,
      mensaje: alta.ok
        ? `Creado en SAFI: Cuenta ${alta.cuentaId}, Socio ${alta.socioId}. Contabilidad ya puede revisarlo.`
        : socioFinal
          ? `Registrado el alta hecha a mano en SAFI: Cuenta ${cuentaFinal ?? "—"}, Socio ${socioFinal}. Contabilidad ya puede revisarlo.`
          : alta.mensaje,
      avisos,
      solicitud: actualizada,
    });
  });

  /**
   * Diagnóstico de la conexión con SAFI, paso a paso.
   *
   * Un `getchallenge` que no responde admite media docena de causas y desde
   * fuera todas se parecen. Esto dice en cuál falla.
   */
  app.get("/api/safi/diagnostico", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "SAFI_DIAGNOSTICO",
    });

    return respuesta.send({
      modo: config.safiModo,
      escritura: config.safiEscritura,
      pasos: await diagnosticarSafi(),
    });
  });

  /** Reintenta la publicación de los expedientes aprobados en el CRM. */
  app.post("/api/safi/reintentar", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;
    return respuesta.send(await procesarCola());
  });

  /** Constancia de que el expediente se cargó a mano en el CRM. */
  app.post("/api/solicitudes/:id/safi/documentos-a-mano", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const solicitud = obtenerSolicitud(id);
    if (!solicitud) return respuesta.code(404).send({ error: "Solicitud no encontrada." });

    const marcados = marcarCargadosAMano(id, usuario.nombre);
    actualizarExpediente(id, {
      safi: "CARGADO",
      safiMensaje: `Cargado a mano en SAFI por ${usuario.nombre}.`,
      safiActualizadoEn: new Date().toISOString(),
    });
    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "SAFI_DOCUMENTOS_A_MANO",
      entidad: solicitud.codigo,
      detalle: `${marcados} documento(s)`,
    });

    return respuesta.send({ ok: true, documentos: marcados });
  });

  /* ---------------------------------------------------------------- */
  /* Expediente digital                                                */
  /* ---------------------------------------------------------------- */

  /** Descarga de un documento del expediente. */
  app.get("/api/expediente/documentos/:archivoId", async (peticion, respuesta) => {
    const usuario = exigirSesion(peticion, respuesta);
    if (!usuario) return respuesta;

    const { archivoId } = peticion.params as { archivoId: string };
    const archivo = porId(archivoId);
    if (!archivo) return respuesta.code(404).send({ error: "Documento no encontrado." });

    const ruta = rutaSegura(archivo.ruta);
    if (!ruta) return respuesta.code(404).send({ error: "El archivo ya no está en el repositorio." });

    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "DESCARGAR_DOCUMENTO",
      entidad: archivo.nombreArchivo,
    });

    // El tipo se deduce de la extensión, que ya fue validada al archivar, y
    // se acompaña de `nosniff` para que el navegador no intente adivinar otro.
    return respuesta
      .header("Content-Type", tipoContenidoDe(path.extname(archivo.nombreArchivo)))
      .header("X-Content-Type-Options", "nosniff")
      .header(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(archivo.nombreArchivo)}"`
      )
      .send(fs.createReadStream(ruta));
  });

  /* ---------------------------------------------------------------- */
  /* Escaneos                                                          */
  /* ---------------------------------------------------------------- */

  /** Fuerza una pasada del vigilante sin esperar al temporizador. */
  app.post("/api/escaneos/revisar", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;
    return respuesta.send(await recorrer());
  });

  /** Comprueba un nombre de archivo sin depositarlo: ayuda para la Jefatura. */
  app.get("/api/escaneos/comprobar", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { nombre } = peticion.query as { nombre?: string };
    if (!nombre) return respuesta.code(400).send({ error: "Indique el nombre del archivo." });

    const analisis = analizarNombreArchivo(nombre);
    if (!analisis.ok) return respuesta.send(analisis);

    // Además de la forma del nombre se dice a quién corresponde: es lo que
    // evita descubrir en el archivado que el número era de otra persona.
    const persona = personaEnExpediente(
      analisis.clave.numeroSocio,
      analisis.clave.ordinalDependiente
    );
    return respuesta.send({
      ...analisis,
      persona: persona
        ? {
            codigo: persona.codigo,
            nombre: nombreCompleto(persona.datos),
            coincide:
              nombreCompleto(persona.datos).toLocaleLowerCase("es") ===
              analisis.clave.apellidosNombres.toLocaleLowerCase("es"),
          }
        : null,
    });
  });

  /** Cierra manualmente una incidencia de escaneo ya corregida. */
  app.post("/api/escaneos/incidencias/:archivo/resolver", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { archivo } = peticion.params as { archivo: string };
    resolverIncidencia(decodeURIComponent(archivo));
    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "RESOLVER_INCIDENCIA",
      entidad: archivo,
    });
    return respuesta.send({ ok: true });
  });

  /**
   * Aparta a `_REVISAR/` un archivo que llegó por error, y cierra su tarea.
   * No se borra nada: queda en la carpeta compartida, a la vista.
   */
  app.post("/api/escaneos/incidencias/:archivo/apartar", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const archivo = decodeURIComponent((peticion.params as { archivo: string }).archivo);
    const resultado = apartarEscaneo(archivo);
    if (!resultado.ok) return respuesta.code(409).send({ error: resultado.error });

    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "APARTAR_ESCANEO",
      entidad: archivo,
      detalle: "Apartado a _REVISAR desde la bandeja.",
    });
    return respuesta.send({ ok: true });
  });

  /**
   * Archiva a mano un escaneo en el trámite que indica la Jefatura.
   *
   * Es la salida de «archivo en espera» y de «archivo no reconocido»: cuando el
   * nombre no permite deducir a quién pertenece, lo decide una persona y queda
   * constancia de quién lo hizo.
   */
  app.post("/api/escaneos/incidencias/:archivo/asignar", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const archivo = decodeURIComponent((peticion.params as { archivo: string }).archivo);
    const cuerpo = (peticion.body ?? {}) as { solicitudId?: unknown; tipoDocumento?: unknown };

    const solicitud =
      typeof cuerpo.solicitudId === "string" ? obtenerSolicitud(cuerpo.solicitudId) : null;
    if (!solicitud) return respuesta.code(404).send({ error: "Elija el trámite al que pertenece." });

    if (!numeroEnExpediente(solicitud)) {
      return respuesta.code(409).send({
        error: `El trámite ${solicitud.codigo} todavía no tiene número de socio, y sin número no hay carpeta donde archivar.`,
      });
    }

    const tipo = validarTipoDocumento(cuerpo.tipoDocumento);
    if (!tipo.ok) return respuesta.code(400).send({ error: tipo.error });

    const resultado = asignarEscaneo(archivo, solicitud, tipo.valor);
    if (!resultado.ok) return respuesta.code(409).send({ error: resultado.error });

    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "ASIGNAR_ESCANEO",
      entidad: solicitud.codigo,
      detalle: `${archivo} → ${nombreDocumento(tipo.valor)}`,
    });

    return respuesta.send({
      ok: true,
      nombreArchivo: resultado.resultado.archivo.nombreArchivo,
    });
  });

  /* ---------------------------------------------------------------- */
  /* Catálogos y estado                                                */
  /* ---------------------------------------------------------------- */

  /**
   * Catálogo de tipos de socio. La aplicación móvil lo consulta al arrancar
   * para no quedar desfasada si el Club modifica un formulario.
   */
  app.get("/api/catalogo/tipos", async (_peticion, respuesta) =>
    respuesta.send(
      TIPOS_DISPONIBLES.map((tipo) => ({
        codigo: tipo.codigo,
        nombre: tipo.nombre,
        categoria: tipo.categoria,
        descripcion: tipo.descripcion,
        hojasSolicitud: tipo.hojasSolicitud.map((h) => ({ codigo: h.codigo, titulo: h.titulo })),
        cartaCompromiso: tipo.cartaCompromiso,
      }))
    )
  );

  app.get("/api/salud", async (_peticion, respuesta) =>
    respuesta.send({
      ok: true,
      version: 2,
      ...estadoDelSistema(),
      escaneosDir: config.escaneosDir,
      en: new Date().toISOString(),
    })
  );
}

/** Áreas válidas, expuestas para la utilidad de línea de comandos. */
export const AREAS_VALIDAS: Area[] = ["SOCIOS", "CONTABILIDAD", "GERENCIA"];

/** Reexportado para las pruebas. */
export { usuarioDeSesion };
