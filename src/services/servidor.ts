import { archivoDisponible, leerBase64 } from "../data/archivos";
import { CLAVES, eliminar, escribirJSON, leerJSON } from "../data/almacenamiento";
import {
  borrarRegistrosLocales,
  incorporarAvance,
  listarSolicitudes,
  rutaDelAdjunto,
  type AvanceDelServidor,
} from "../data/solicitudes";
import {
  ROL_ADJUNTO_META,
  adjuntosFaltantes,
  type RolAdjunto,
  type SolicitudAfiliacion,
} from "../domain/solicitud";

/**
 * Cliente del servidor institucional.
 *
 * La tableta del Área de Socios funciona sin conexión: la afiliación se
 * registra y se firma aunque la red falle, y queda en la cola local. Este
 * módulo es el que la entrega al servidor —sola, en cuanto hay conexión y
 * sesión— y el que trae de vuelta su avance: el número de socio, las
 * constancias de Contabilidad y de la Gerencia, y el estado del expediente.
 *
 * Entregar una afiliación son dos cosas, y el trámite no está completo en el
 * servidor hasta que llegan las dos:
 *
 *   1. los datos del formulario, y
 *   2. las firmas trazadas en pantalla, sin las cuales el formulario no se
 *      puede componer.
 *
 * (La fotografía tipo carnet era la tercera hasta el 15/09/2026; ver
 * `docs/RETIRADO-fotografia-carnet.md`.)
 *
 * Lo que un reintento no puede arreglar no se reintenta: una firma que ya no
 * está en la tableta, un trámite que el servidor dejó de conocer o un archivo
 * que rechazó por su contenido. Se avisa en la tableta y se espera a que el
 * operador decida. Insistir cada dos minutos no lo resolvía, y además
 * escondía el problema detrás de un «envío pendiente».
 *
 * La sesión se mantiene con la cookie que emite el servidor; React Native la
 * conserva en el almacén de cookies del sistema, de modo que aquí no se guarda
 * ningún token ni contraseña.
 */

export type ConfiguracionServidor = {
  /**
   * URL base del servidor, sin barra final. El servidor institucional es
   * interno y hoy no tiene certificado TLS, así que suele ser `http://`, no
   * `https://`. Ej. `http://soporte.clublacampina.com.ec:8080`.
   */
  url: string;
  /** Usuario del Área de Socios con el que la tableta se identifica. */
  usuario: string;
};

const SIN_CONFIGURAR: ConfiguracionServidor = { url: "", usuario: "" };

export async function leerConfiguracion(): Promise<ConfiguracionServidor> {
  const guardada = await leerJSON<ConfiguracionServidor>(CLAVES.servidor, SIN_CONFIGURAR);
  return { url: (guardada.url ?? "").replace(/\/+$/, ""), usuario: guardada.usuario ?? "" };
}

export async function guardarConfiguracion(config: ConfiguracionServidor): Promise<void> {
  await escribirJSON(CLAVES.servidor, {
    url: config.url.trim().replace(/\/+$/, ""),
    usuario: config.usuario.trim().toLowerCase(),
  });
}

export async function hayServidorConfigurado(): Promise<boolean> {
  return Boolean((await leerConfiguracion()).url);
}

/* ------------------------------------------------------------------ */
/* Cola de envío                                                       */
/* ------------------------------------------------------------------ */

async function sincronizadas(): Promise<string[]> {
  return leerJSON<string[]>(CLAVES.sincronizadas, []);
}

async function guardarSincronizadas(ids: string[]): Promise<void> {
  await escribirJSON(CLAVES.sincronizadas, Array.from(new Set(ids)));
}

/**
 * Por qué se dejó de enviar un trámite.
 *
 *   NO_EXISTE_EN_SERVIDOR  El servidor lo aceptó en su día y hoy responde que
 *                          no lo tiene: su base se vació o se restauró.
 *   RECHAZADO              El servidor lo rechazó con un motivo que un
 *                          reintento no cambia (un archivo que no es la imagen
 *                          que dice ser, por ejemplo).
 */
export type EnvioDetenido =
  | { motivo: "NO_EXISTE_EN_SERVIDOR"; en: string }
  | { motivo: "RECHAZADO"; en: string; mensaje: string; rol?: RolAdjunto };

async function enviosDetenidos(): Promise<Record<string, EnvioDetenido>> {
  const guardados = await leerJSON<Record<string, EnvioDetenido> | null>(
    CLAVES.enviosDetenidos,
    {}
  );
  return guardados && typeof guardados === "object" ? guardados : {};
}

/**
 * Cómo está el envío de un trámite, visto desde la tableta: lo que el servidor
 * ya tiene, lo que le falta y si la tableta todavía puede entregárselo.
 */
export type SituacionEntrega = {
  solicitud: SolicitudAfiliacion;
  /** El servidor aceptó el trámite. */
  enviada: boolean;
  /**
   * Firmas que el servidor todavía no tiene y que nadie declaró resueltas de
   * otro modo desde la bandeja.
   */
  faltantes: RolAdjunto[];
  /** De las que faltan, las que tampoco están ya en la tableta: no llegarán solas. */
  perdidas: RolAdjunto[];
  /** Por qué se dejó de enviar, si se dejó. */
  detenido: EnvioDetenido | null;
};

function situacionDe(
  solicitud: SolicitudAfiliacion,
  enviadas: string[],
  detenidos: Record<string, EnvioDetenido>
): SituacionEntrega {
  // Un trámite anulado ya no reclama nada: lo que le falte da igual.
  const faltantes = solicitud.estado === "RECHAZADA" ? [] : adjuntosFaltantes(solicitud);
  return {
    solicitud,
    enviada: enviadas.includes(solicitud.id),
    faltantes,
    perdidas: faltantes.filter((rol) => !archivoDisponible(rutaDelAdjunto(solicitud, rol))),
    detenido: detenidos[solicitud.id] ?? null,
  };
}

export async function situacionesDeEntrega(): Promise<SituacionEntrega[]> {
  const [lista, enviadas, detenidos] = await Promise.all([
    listarSolicitudes(),
    sincronizadas(),
    enviosDetenidos(),
  ]);
  return lista
    .filter((s) => s.estado !== "BORRADOR")
    .map((s) => situacionDe(s, enviadas, detenidos));
}

export async function situacionDeEntrega(id: string): Promise<SituacionEntrega | null> {
  const [lista, enviadas, detenidos] = await Promise.all([
    listarSolicitudes(),
    sincronizadas(),
    enviosDetenidos(),
  ]);
  const solicitud = lista.find((s) => s.id === id);
  return solicitud ? situacionDe(solicitud, enviadas, detenidos) : null;
}

/** La entrega está incompleta y la sincronización todavía puede avanzarla sola. */
export function seEnviaSola(situacion: SituacionEntrega): boolean {
  if (situacion.detenido) return false;
  return (
    !situacion.enviada || situacion.faltantes.some((rol) => !situacion.perdidas.includes(rol))
  );
}

/** Hace falta que alguien intervenga: la tableta no puede completar la entrega por su cuenta. */
export function requiereAtencion(situacion: SituacionEntrega): boolean {
  if (situacion.solicitud.estado === "RECHAZADA") return false;
  return situacion.detenido !== null || situacion.perdidas.length > 0;
}

/** Afiliaciones cuya entrega sigue incompleta y la tableta completará sola. */
export async function pendientesDeEnvio(): Promise<SolicitudAfiliacion[]> {
  return (await situacionesDeEntrega()).filter(seEnviaSola).map((s) => s.solicitud);
}

/** «la firma del solicitante y la firma del socio garante». */
export function enumerarAdjuntos(roles: RolAdjunto[]): string {
  const nombres = roles.map((rol) => `la ${ROL_ADJUNTO_META[rol].etiqueta.toLowerCase()}`);
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/**
 * Qué le pasa al envío de un trámite, en una frase: para la lista de
 * «Configuración y envío» y el aviso del portal. `null` si no hay nada que el
 * operador deba hacer.
 */
export function describirSituacion(situacion: SituacionEntrega): string | null {
  if (!requiereAtencion(situacion)) return null;
  const { codigo } = situacion.solicitud;
  const { detenido, perdidas } = situacion;

  if (detenido?.motivo === "NO_EXISTE_EN_SERVIDOR") {
    return `${codigo}: el servidor ya no tiene este trámite y la tableta dejó de enviarlo.`;
  }
  if (detenido?.motivo === "RECHAZADO") {
    return `${codigo}: el servidor rechazó el envío («${detenido.mensaje.replace(/\.$/, "")}») y la tableta dejó de insistir.`;
  }
  const una = perdidas.length === 1;
  return `${codigo}: ${enumerarAdjuntos(perdidas)} ya no ${una ? "está" : "están"} en esta tableta y no ${
    una ? "llegará sola" : "llegarán solas"
  } al servidor.`;
}

/* ------------------------------------------------------------------ */
/* Peticiones                                                          */
/* ------------------------------------------------------------------ */

export class ErrorServidor extends Error {
  constructor(
    mensaje: string,
    readonly codigo: number,
    /**
     * El servidor respondió con su propio mensaje de error. Si no —sin red, o
     * una respuesta que no es de este servidor—, el código no dice nada del
     * trámite: puede ser la dirección mal escrita.
     */
    readonly delServidor = false
  ) {
    super(mensaje);
    this.name = "ErrorServidor";
  }
}

/**
 * Rechazos con motivo que un reintento no cambia: datos que no pasan la
 * validación, un archivo demasiado grande o de otro tipo. Los demás —sin
 * sesión, sin conexión, el servidor caído— se resuelven solos o con una acción
 * que no depende del trámite.
 */
const RECHAZOS_DEFINITIVOS = [400, 409, 413, 415, 422];

function esRechazoDefinitivo(error: unknown): error is ErrorServidor {
  return (
    error instanceof ErrorServidor &&
    error.delServidor &&
    RECHAZOS_DEFINITIVOS.includes(error.codigo)
  );
}

/**
 * Tiempo máximo de una petición. En React Native `fetch` no tiene límite
 * propio: con la red caída, un envío podía quedarse esperando minutos mientras
 * el operador veía la pantalla detenida.
 */
const LIMITE_MS = 20_000;
const LIMITE_SUBIDA_MS = 90_000;

async function peticion<T>(
  ruta: string,
  opciones: { metodo?: string; cuerpo?: unknown; formulario?: FormData } = {}
): Promise<T> {
  const { url } = await leerConfiguracion();
  if (!url) throw new ErrorServidor("No se ha configurado la dirección del servidor.", 0);

  const control = new AbortController();
  const temporizador = setTimeout(
    () => control.abort(),
    opciones.formulario ? LIMITE_SUBIDA_MS : LIMITE_MS
  );

  let respuesta: Response;
  try {
    respuesta = await fetch(`${url}${ruta}`, {
      method: opciones.metodo ?? "GET",
      headers: opciones.cuerpo ? { "Content-Type": "application/json" } : undefined,
      body: opciones.formulario ?? (opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined),
      signal: control.signal,
    });
  } catch {
    throw new ErrorServidor(
      control.signal.aborted
        ? "El servidor no respondió a tiempo. Verifique la conexión con la red del Club."
        : "No se pudo contactar al servidor. Verifique la conexión.",
      0
    );
  } finally {
    clearTimeout(temporizador);
  }

  const texto = await respuesta.text();
  let datos: (T & { error?: string }) | null = null;
  try {
    datos = texto ? (JSON.parse(texto) as T & { error?: string }) : null;
  } catch {
    throw new ErrorServidor(
      `El servidor respondió algo inesperado (HTTP ${respuesta.status}). Revise la dirección configurada.`,
      respuesta.status
    );
  }

  if (!respuesta.ok) {
    const mensaje = datos?.error ?? `El servidor respondió ${respuesta.status}.`;
    throw new ErrorServidor(mensaje, respuesta.status, typeof datos?.error === "string");
  }

  return datos as T;
}

export type SesionServidor = {
  usuario: string;
  nombre: string;
  area: string;
  etiquetaArea?: string;
  /** El funcionario ya cargó su firma para las constancias del reverso. */
  firmaCargada?: boolean;
};

/**
 * Inicia sesión en el servidor. La contraseña se usa solo para esta petición y
 * no se almacena en el dispositivo: el servidor devuelve una cookie de sesión.
 *
 * La tableta se identifica como tal y el servidor le da una sesión larga (30
 * días por defecto, `HORAS_SESION_TABLETA`): una sesión de jornada, como la de
 * los navegadores, dejaba de enviar las afiliaciones cada mañana hasta que
 * alguien se acordaba de volver a iniciarla.
 */
export async function iniciarSesion(
  usuario: string,
  clave: string,
  opciones: {
    /**
     * Deja anotado el usuario como el de la tableta. Lo desactiva «Mi firma»,
     * donde un funcionario de otra área entra un momento a cargar su firma: esa
     * sesión es prestada y no debe cambiar con qué usuario trabaja la tableta.
     */
    recordar?: boolean;
  } = {}
): Promise<SesionServidor> {
  const sesion = await peticion<SesionServidor>("/api/sesion", {
    metodo: "POST",
    cuerpo: { usuario, clave, dispositivo: "tableta" },
  });
  if (opciones.recordar !== false) {
    const config = await leerConfiguracion();
    await guardarConfiguracion({ ...config, usuario: sesion.usuario });
  }
  return sesion;
}

export async function sesionActiva(): Promise<SesionServidor | null> {
  try {
    return await peticion<SesionServidor>("/api/sesion");
  } catch {
    return null;
  }
}

export async function cerrarSesionServidor(): Promise<void> {
  try {
    await peticion("/api/sesion", { metodo: "DELETE" });
  } catch {
    // Cerrar sesión sin conexión no es un error: la cookie caduca sola.
  }
}

/* ------------------------------------------------------------------ */
/* La firma del funcionario                                            */
/* ------------------------------------------------------------------ */

/**
 * Firma del funcionario que tiene la sesión abierta: la que se estampa en su
 * constancia del reverso —REGISTRADO, REVISADO o APROBADO—.
 *
 * La carga cada uno desde la tableta, una sola vez y con su propio usuario.
 * Quien no la cargue sigue trabajando igual: su recuadro se imprime solo con
 * su nombre.
 */
export type EstadoMiFirma = { cargada: boolean; en: string | null };

export async function miFirma(): Promise<EstadoMiFirma> {
  return peticion<EstadoMiFirma>("/api/mi-firma");
}

/**
 * Sustituye la firma del funcionario de la sesión por la recién trazada.
 *
 * Las constancias ya emitidas conservan la firma que se estampó en su momento:
 * el servidor copia el archivo al trámite al sellarlas, igual que congela el
 * nombre.
 */
export async function guardarMiFirma(uri: string): Promise<EstadoMiFirma> {
  const formulario = new FormData();
  // React Native admite este descriptor de archivo en FormData.
  formulario.append("archivo", {
    uri,
    name: "mi-firma.png",
    type: "image/png",
  } as unknown as Blob);

  return peticion<EstadoMiFirma>("/api/mi-firma", { metodo: "POST", formulario });
}

export async function comprobarServidor(): Promise<{ ok: boolean; safiModo?: string }> {
  try {
    return await peticion<{ ok: boolean; safiModo: string }>("/api/salud");
  } catch {
    return { ok: false };
  }
}

/* ------------------------------------------------------------------ */
/* Sincronización                                                      */
/* ------------------------------------------------------------------ */

export type EstadoSincronizacion =
  | "AL_DIA"
  | "PENDIENTE"
  | "ATENCION"
  | "SIN_SERVIDOR"
  | "SIN_SESION"
  | "SIN_CONEXION"
  | "ERROR";

export type ResumenSincronizacion = {
  estado: EstadoSincronizacion;
  /** Afiliaciones que el servidor recibió en este intento. */
  enviadas: number;
  /** Firmas entregadas en este intento. */
  archivos: number;
  /** Trámites cuyo avance cambió en la tableta. */
  actualizadas: number;
  /** Entregas que siguen incompletas y la tableta completará sola. */
  pendientes: number;
  /** Trámites que la tableta no puede completar sin que alguien intervenga. */
  atencion: number;
  /** Mensaje para el operador, cuando algo impidió completar el envío. */
  detalle?: string;
  en: string;
};

/** Último resultado guardado, para el aviso del portal. */
export async function ultimoResumen(): Promise<ResumenSincronizacion | null> {
  const guardado = await leerJSON<ResumenSincronizacion | null>(CLAVES.estadoSincronizacion, null);
  // Los resúmenes que guardó una versión anterior no traen `atencion`.
  return guardado ? { ...guardado, atencion: guardado.atencion ?? 0 } : null;
}

/** Firma de un archivo del expediente como base64, o `null` si no está. */
async function firmaBase64(uri: string | null): Promise<string | null> {
  if (!uri) return null;
  return leerBase64(uri);
}

/**
 * Copia de la solicitud apta para viajar: sin las rutas de los archivos del
 * dispositivo, que en el servidor no significan nada y describen su
 * almacenamiento interno.
 */
function sinRutasLocales(solicitud: SolicitudAfiliacion): SolicitudAfiliacion {
  return {
    ...solicitud,
    firmaUri: null,
    datos: {
      ...solicitud.datos,
      garantes: solicitud.datos.garantes.map((g) => ({ ...g, firmaUri: null })),
    },
    documentos: solicitud.documentos.map((d) => ({ ...d, uri: "" })),
    identidad: { ...solicitud.identidad, fotoRegistroCivilUri: null },
  };
}

/**
 * Registra la afiliación en el servidor junto con sus firmas.
 *
 * Es idempotente: si el servidor ya la tiene, devuelve lo que guarda y, de
 * paso, completa las firmas que le falten. Por eso sirve igual para el primer
 * envío que para reparar uno que se quedó a medias — pero solo sobre un
 * trámite que el servidor acaba de confirmar que tiene: con un identificador
 * que no conoce, lo registra como nuevo.
 */
async function registrarEnServidor(solicitud: SolicitudAfiliacion): Promise<SolicitudAfiliacion> {
  const [solicitante, ...garantes] = await Promise.all([
    firmaBase64(solicitud.firmaUri),
    ...solicitud.datos.garantes.map((g) => firmaBase64(g.firmaUri)),
  ]);

  return peticion<SolicitudAfiliacion>("/api/solicitudes", {
    metodo: "POST",
    cuerpo: { solicitud: sinRutasLocales(solicitud), firmas: { solicitante, garantes } },
  });
}

function aAvance(solicitud: SolicitudAfiliacion): AvanceDelServidor {
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

let enCurso: Promise<ResumenSincronizacion> | null = null;
let cambioEnCurso: Promise<unknown> | null = null;

/**
 * Entrega al servidor lo registrado en la tableta y trae el avance de cada
 * trámite. Cada afiliación se procesa por separado: un fallo en una no impide
 * que las demás se entreguen.
 *
 * Si ya hay una sincronización en marcha, se devuelve esa misma: la llaman el
 * asistente al registrar, el portal al volver al primer plano y un
 * temporizador, y no deben pisarse.
 */
export function sincronizar(): Promise<ResumenSincronizacion> {
  if (!enCurso) {
    // Si hay un cambio de la cola en marcha (un borrado, un reenvío), se espera
    // a que termine antes de leerla.
    const cambio = cambioEnCurso;
    const pasada = cambio
      ? cambio.then(ejecutarSincronizacion, ejecutarSincronizacion)
      : ejecutarSincronizacion();
    enCurso = pasada.finally(() => {
      enCurso = null;
    });
  }
  return enCurso;
}

/**
 * Aplica un cambio a la cola de envío sin que una sincronización lo pise:
 * espera a la que esté en marcha, y la que se pida mientras tanto espera a que
 * el cambio termine. Sin esto, una sincronización que leyó la lista antes de
 * borrarla podía volver a escribirla entera después.
 */
async function sinSincronizar<T>(cambio: () => Promise<T>): Promise<T> {
  const previos = [enCurso, cambioEnCurso];
  const aplicado = (async () => {
    for (const previo of previos) if (previo) await previo.catch(() => undefined);
    return cambio();
  })();
  cambioEnCurso = aplicado;
  try {
    return await aplicado;
  } finally {
    if (cambioEnCurso === aplicado) cambioEnCurso = null;
  }
}

async function ejecutarSincronizacion(): Promise<ResumenSincronizacion> {
  const ahora = () => new Date().toISOString();
  const resumen: ResumenSincronizacion = {
    estado: "AL_DIA",
    enviadas: 0,
    archivos: 0,
    actualizadas: 0,
    pendientes: 0,
    atencion: 0,
    en: ahora(),
  };

  // Toda pasada termina revisando la tableta, haya servidor o no: un archivo
  // que ya no está se avisa el mismo día en que se abre la aplicación, no el
  // de la aprobación.
  const cerrar = async (): Promise<ResumenSincronizacion> => {
    const situaciones = await situacionesDeEntrega();
    const conAviso = situaciones.filter(requiereAtencion);
    resumen.pendientes = situaciones.filter(seEnviaSola).length;
    resumen.atencion = conAviso.length;
    if (resumen.estado === "AL_DIA" && conAviso.length > 0) {
      resumen.estado = "ATENCION";
      resumen.detalle = [
        describirSituacion(conAviso[0]),
        conAviso.length > 1 ? `Y ${conAviso.length - 1} más en «Configuración y envío».` : null,
      ]
        .filter(Boolean)
        .join(" ");
    } else if (resumen.estado === "AL_DIA" && resumen.pendientes > 0) {
      resumen.estado = "PENDIENTE";
    }
    await escribirJSON(CLAVES.estadoSincronizacion, resumen);
    return resumen;
  };

  if (!(await hayServidorConfigurado())) {
    resumen.estado = "SIN_SERVIDOR";
    resumen.detalle = "Configure la dirección del servidor en «Configuración y envío».";
    return cerrar();
  }

  /**
   * Anota un fallo y dice si hay que suspender la pasada: sin conexión o sin
   * una sesión válida, nada de lo que sigue puede salir.
   */
  const interrumpe = (error: unknown): boolean => {
    const codigo = error instanceof ErrorServidor ? error.codigo : -1;
    const mensaje = error instanceof Error ? error.message : String(error);
    if (codigo === 401) {
      resumen.estado = "SIN_SESION";
      resumen.detalle =
        "La sesión de la tableta con el servidor venció. Iníciela de nuevo en «Configuración y envío».";
      return true;
    }
    if (codigo === 403) {
      // Todo lo que pide la tableta es del Área de Socios: si el servidor niega
      // una cosa por el área del usuario, las niega todas.
      resumen.estado = "SIN_SESION";
      resumen.detalle = `La tableta inició sesión con un usuario que no es del Área de Socios: ${mensaje} Cierre la sesión e iníciela con el usuario del Área de Socios.`;
      return true;
    }
    if (codigo === 0) {
      resumen.estado = "SIN_CONEXION";
      resumen.detalle = mensaje;
      return true;
    }
    resumen.estado = "ERROR";
    if (!resumen.detalle) resumen.detalle = mensaje;
    return false;
  };

  let registradas = await sincronizadas();
  const detenidos = await enviosDetenidos();

  /**
   * Aparta un trámite de la cola hasta que el operador decida: lo que el
   * servidor rechazó con motivo o dejó de conocer no se vuelve a pedir en cada
   * pasada.
   */
  const apartar = async (id: string, detenido: EnvioDetenido) => {
    detenidos[id] = detenido;
    await escribirJSON(CLAVES.enviosDetenidos, detenidos);
  };

  /**
   * Trámites que el servidor confirmó tener en esta misma pasada. Solo a esos
   * se les completan las firmas, porque el registro, con un identificador que
   * el servidor no conoce, crea un trámite nuevo.
   */
  const confirmadas = new Set<string>();

  // 1. Registrar lo que el servidor todavía no tiene, con las firmas que haya.
  for (const solicitud of await listarSolicitudes()) {
    if (
      solicitud.estado === "BORRADOR" ||
      registradas.includes(solicitud.id) ||
      detenidos[solicitud.id]
    ) {
      continue;
    }
    try {
      const guardada = await registrarEnServidor(solicitud);
      await incorporarAvance([aAvance(guardada)]);
      registradas = [...registradas, solicitud.id];
      await guardarSincronizadas(registradas);
      confirmadas.add(solicitud.id);
      resumen.enviadas += 1;
    } catch (error) {
      if (esRechazoDefinitivo(error)) {
        await apartar(solicitud.id, { motivo: "RECHAZADO", en: ahora(), mensaje: error.message });
        continue;
      }
      if (interrumpe(error)) return cerrar();
    }
  }

  // 2. Traer el avance de lo ya enviado: número de socio, constancias y estado
  //    del expediente, para que la tableta muestre lo mismo que la bandeja.
  //
  //    Va antes de completar las entregas a medias por dos razones: se repara
  //    con lo que el servidor tiene hoy —lo que la Jefatura ya subió o declaró
  //    en papel desde la bandeja no se vuelve a enviar—, y un trámite que el
  //    servidor ya no conoce se descubre antes de mandarle nada.
  try {
    const consultables = (await listarSolicitudes()).filter(
      (s) => registradas.includes(s.id) && s.estado !== "BORRADOR" && !detenidos[s.id]
    );
    if (consultables.length > 0) {
      const respuesta = await peticion<{ avances: AvanceDelServidor[]; desconocidos: string[] }>(
        "/api/tableta/avance",
        { metodo: "POST", cuerpo: { ids: consultables.map((s) => s.id) } }
      );
      resumen.actualizadas = await incorporarAvance(respuesta.avances);
      for (const avance of respuesta.avances) confirmadas.add(avance.id);

      // Un trámite que el servidor aceptó y ahora no conoce es una base que se
      // vació o se restauró. Antes se volvía a registrar solo en la pasada
      // siguiente, y tras vaciar la base para una prueba en limpio la tableta
      // resucitaba cada trámite viejo como uno nuevo. Ahora lo decide el
      // operador (ver `reanudarEnvio`).
      for (const id of respuesta.desconocidos) {
        await apartar(id, { motivo: "NO_EXISTE_EN_SERVIDOR", en: ahora() });
      }
    }
  } catch (error) {
    if (interrumpe(error)) return cerrar();
  }

  // 3. Completar las entregas a medias con lo que siga en la tableta. Lo que ya
  //    no está no se pide —reenviar no lo trae de vuelta—: el trámite queda a
  //    la vista como pendiente de atención.
  for (const solicitud of await listarSolicitudes()) {
    if (
      !registradas.includes(solicitud.id) ||
      solicitud.estado === "RECHAZADA" ||
      detenidos[solicitud.id]
    ) {
      continue;
    }
    const faltan = adjuntosFaltantes(solicitud);
    if (faltan.length === 0) continue;

    /** La pieza que se estaba enviando, para decir cuál rechazó el servidor. */
    let subiendo: RolAdjunto | undefined;
    try {
      const firmasQueFaltan = faltan.filter((rol) => ROL_ADJUNTO_META[rol].esFirma);
      const contenidos = await Promise.all(
        firmasQueFaltan.map((rol) => firmaBase64(rutaDelAdjunto(solicitud, rol)))
      );
      const firmas = firmasQueFaltan.filter((_, indice) => contenidos[indice]);
      if (firmas.length > 0 && confirmadas.has(solicitud.id)) {
        subiendo = firmas.length === 1 ? firmas[0] : undefined;
        const antes = new Set(solicitud.expediente.adjuntosRecibidos ?? []);
        const reparada = await registrarEnServidor(solicitud);
        await incorporarAvance([aAvance(reparada)]);
        resumen.archivos += (reparada.expediente.adjuntosRecibidos ?? []).filter(
          (rol) => !antes.has(rol)
        ).length;
      }
    } catch (error) {
      if (error instanceof ErrorServidor && error.delServidor && error.codigo === 404) {
        await apartar(solicitud.id, { motivo: "NO_EXISTE_EN_SERVIDOR", en: ahora() });
        continue;
      }
      if (esRechazoDefinitivo(error)) {
        await apartar(solicitud.id, {
          motivo: "RECHAZADO",
          en: ahora(),
          mensaje: error.message,
          rol: subiendo,
        });
        continue;
      }
      if (interrumpe(error)) return cerrar();
    }
  }

  return cerrar();
}

/**
 * Vuelve a poner en la cola un trámite cuyo envío se detuvo, y lo intenta de
 * inmediato.
 *
 * Si se detuvo porque el servidor ya no lo tenía, se registra de nuevo: el
 * servidor le asigna otro código y el trámite empieza otra vez por la creación
 * en SAFI. Por eso lo decide el operador y no la sincronización.
 */
export async function reanudarEnvio(id: string): Promise<ResumenSincronizacion> {
  await sinSincronizar(async () => {
    const detenidos = await enviosDetenidos();
    if (detenidos[id]?.motivo === "NO_EXISTE_EN_SERVIDOR") {
      await guardarSincronizadas((await sincronizadas()).filter((otro) => otro !== id));
    }
    delete detenidos[id];
    await escribirJSON(CLAVES.enviosDetenidos, detenidos);
  });
  return sincronizar();
}

/**
 * Borra de la tableta todo lo registrado, con sus firmas, y el estado de los
 * envíos. No toca el servidor, ni la configuración de la
 * tableta, ni su sesión.
 */
export async function borrarDatosDePrueba(): Promise<{
  afiliaciones: number;
  actualizaciones: number;
}> {
  return sinSincronizar(async () => {
    const borrados = await borrarRegistrosLocales();
    await eliminar(CLAVES.sincronizadas, CLAVES.estadoSincronizacion, CLAVES.enviosDetenidos);
    return borrados;
  });
}

/** Texto corto del estado, para el portal y «Configuración y envío». */
export function describirResumen(resumen: ResumenSincronizacion | null): {
  titulo: string;
  tono: "success" | "warning" | "danger" | "info";
  /** Lo que conviene leer además del título, si hay algo. */
  detalle?: string;
} {
  if (!resumen) return { titulo: "Aún no se ha sincronizado con el servidor.", tono: "info" };

  // Lo que la tableta no puede completar sola se menciona siempre, aunque el
  // título hable de la conexión: si no, quedaría escondido detrás de ese aviso.
  const { atencion } = resumen;
  const tambien =
    atencion === 0
      ? undefined
      : atencion === 1
        ? "Además, 1 trámite necesita su atención."
        : `Además, ${atencion} trámites necesitan su atención.`;
  const juntar = (...partes: (string | undefined)[]) =>
    partes.filter(Boolean).join("\n") || undefined;

  switch (resumen.estado) {
    case "AL_DIA":
      return { titulo: "Todo lo registrado está en el servidor.", tono: "success" };
    case "ATENCION":
      return {
        titulo:
          atencion === 1 ? "1 trámite necesita su atención." : `${atencion} trámites necesitan su atención.`,
        tono: "danger",
        detalle: resumen.detalle,
      };
    case "PENDIENTE":
      return {
        titulo:
          resumen.pendientes === 1
            ? "1 afiliación con envío pendiente."
            : `${resumen.pendientes} afiliaciones con envío pendiente.`,
        tono: "warning",
        detalle: juntar(resumen.detalle, tambien),
      };
    case "SIN_SERVIDOR":
      return {
        titulo: "Falta configurar el servidor.",
        tono: "danger",
        detalle: juntar(resumen.detalle, tambien),
      };
    case "SIN_SESION":
      return {
        titulo: "Sin una sesión válida: no se están enviando las afiliaciones.",
        tono: "danger",
        detalle: juntar(resumen.detalle, tambien),
      };
    case "SIN_CONEXION":
      return {
        titulo: "Sin conexión con el servidor: se enviará al volver la red.",
        tono: "warning",
        detalle: juntar(resumen.detalle, tambien),
      };
    case "ERROR":
      return {
        titulo: resumen.detalle ?? "El servidor rechazó un envío.",
        tono: "danger",
        detalle: tambien,
      };
  }
}
