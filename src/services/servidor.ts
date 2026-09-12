import { leerBase64 } from "../data/archivos";
import { CLAVES, escribirJSON, leerJSON } from "../data/almacenamiento";
import { incorporarAvance, listarSolicitudes, type AvanceDelServidor } from "../data/solicitudes";
import { adjuntosFaltantes, type SolicitudAfiliacion } from "../domain/solicitud";

/**
 * Cliente del servidor institucional.
 *
 * La tableta del Área de Socios funciona sin conexión: la afiliación se
 * registra y se firma aunque la red falle, y queda en la cola local. Este
 * módulo es el que la entrega al servidor —sola, en cuanto hay conexión y
 * sesión— y el que trae de vuelta su avance: el número de socio, las
 * constancias de Contabilidad y de la Gerencia, y el estado del expediente.
 *
 * Entregar una afiliación son tres cosas, y el trámite no está completo en el
 * servidor hasta que llegan las tres:
 *
 *   1. los datos del formulario,
 *   2. las firmas trazadas en pantalla (sin ellas el formulario no se puede
 *      componer), y
 *   3. la fotografía tipo carnet.
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

/**
 * Identificadores ya aceptados por el servidor. Se lleva aparte del documento
 * de la solicitud para que la estructura que viaja al servidor sea exactamente
 * la del dominio compartido, sin campos propios del dispositivo.
 */
const CLAVE_SINCRONIZADAS = "campina.sincronizadas.v1";

/** Resultado del último intento, para mostrarlo en el portal y en Configuración. */
const CLAVE_ESTADO = "campina.sincronizacion.estado.v1";

async function sincronizadas(): Promise<string[]> {
  return leerJSON<string[]>(CLAVE_SINCRONIZADAS, []);
}

async function guardarSincronizadas(ids: string[]): Promise<void> {
  await escribirJSON(CLAVE_SINCRONIZADAS, Array.from(new Set(ids)));
}

export async function estaSincronizada(id: string): Promise<boolean> {
  return (await sincronizadas()).includes(id);
}

/** Identificadores que el servidor ya tiene, para marcar en la lista lo que falta enviar. */
export async function idsSincronizados(): Promise<string[]> {
  return sincronizadas();
}

/**
 * Afiliaciones cuya entrega no está completa: las que el servidor aún no tiene
 * y las que tiene sin alguna de sus firmas o sin la fotografía.
 */
export async function pendientesDeEnvio(): Promise<SolicitudAfiliacion[]> {
  const [lista, enviadas] = await Promise.all([listarSolicitudes(), sincronizadas()]);
  return lista.filter(
    (s) =>
      s.estado !== "BORRADOR" &&
      (!enviadas.includes(s.id) || (s.estado !== "RECHAZADA" && adjuntosFaltantes(s).length > 0))
  );
}

/* ------------------------------------------------------------------ */
/* Peticiones                                                          */
/* ------------------------------------------------------------------ */

export class ErrorServidor extends Error {
  constructor(
    mensaje: string,
    readonly codigo: number
  ) {
    super(mensaje);
    this.name = "ErrorServidor";
  }
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
    throw new ErrorServidor(mensaje, respuesta.status);
  }

  return datos as T;
}

export type SesionServidor = { usuario: string; nombre: string; area: string };

/**
 * Inicia sesión en el servidor. La contraseña se usa solo para esta petición y
 * no se almacena en el dispositivo: el servidor devuelve una cookie de sesión.
 *
 * La tableta se identifica como tal y el servidor le da una sesión larga (30
 * días por defecto, `HORAS_SESION_TABLETA`): una sesión de jornada, como la de
 * los navegadores, dejaba de enviar las afiliaciones cada mañana hasta que
 * alguien se acordaba de volver a iniciarla.
 */
export async function iniciarSesion(usuario: string, clave: string): Promise<SesionServidor> {
  const sesion = await peticion<SesionServidor>("/api/sesion", {
    metodo: "POST",
    cuerpo: { usuario, clave, dispositivo: "tableta" },
  });
  const config = await leerConfiguracion();
  await guardarConfiguracion({ ...config, usuario: sesion.usuario });
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
  | "SIN_SERVIDOR"
  | "SIN_SESION"
  | "SIN_CONEXION"
  | "ERROR";

export type ResumenSincronizacion = {
  estado: EstadoSincronizacion;
  /** Afiliaciones que el servidor recibió en este intento. */
  enviadas: number;
  /** Firmas y fotografías entregadas en este intento. */
  archivos: number;
  /** Trámites cuyo avance cambió en la tableta. */
  actualizadas: number;
  /** Entregas que siguen incompletas tras el intento. */
  pendientes: number;
  /** Mensaje para el operador, cuando algo impidió completar el envío. */
  detalle?: string;
  en: string;
};

/** Último resultado guardado, para el aviso del portal. */
export async function ultimoResumen(): Promise<ResumenSincronizacion | null> {
  return leerJSON<ResumenSincronizacion | null>(CLAVE_ESTADO, null);
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
 * envío que para reparar uno que se quedó a medias.
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

/**
 * Sube la fotografía tipo carnet capturada en la tableta. Devuelve la
 * solicitud tal como queda en el servidor, o `null` si no había nada que subir.
 */
async function subirFotografia(solicitud: SolicitudAfiliacion): Promise<SolicitudAfiliacion | null> {
  const foto = solicitud.documentos.find((d) => d.tipo === "FOTO_CARNET");
  if (!foto) return null;

  // Si el archivo ya no está en la tableta no hay nada que subir: se informa
  // en lugar de insistir en cada sincronización.
  const contenido = await leerBase64(foto.uri);
  if (!contenido) return null;

  const formulario = new FormData();
  formulario.append("rol", "FOTO_CARNET");
  // React Native admite este descriptor de archivo en FormData.
  formulario.append("archivo", {
    uri: foto.uri,
    name: foto.nombreArchivo || "fotografia.jpg",
    type: foto.mimeType || "image/jpeg",
  } as unknown as Blob);

  return peticion<SolicitudAfiliacion>(
    `/api/solicitudes/${encodeURIComponent(solicitud.id)}/adjuntos`,
    { metodo: "POST", formulario }
  );
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
    enCurso = ejecutarSincronizacion().finally(() => {
      enCurso = null;
    });
  }
  return enCurso;
}

async function ejecutarSincronizacion(): Promise<ResumenSincronizacion> {
  const resumen: ResumenSincronizacion = {
    estado: "AL_DIA",
    enviadas: 0,
    archivos: 0,
    actualizadas: 0,
    pendientes: 0,
    en: new Date().toISOString(),
  };

  const cerrar = async (): Promise<ResumenSincronizacion> => {
    resumen.pendientes = (await pendientesDeEnvio()).length;
    if (resumen.estado === "AL_DIA" && resumen.pendientes > 0) resumen.estado = "PENDIENTE";
    await escribirJSON(CLAVE_ESTADO, resumen);
    return resumen;
  };

  if (!(await hayServidorConfigurado())) {
    resumen.estado = "SIN_SERVIDOR";
    resumen.detalle = "Configure la dirección del servidor en «Configuración y envío».";
    return cerrar();
  }

  const detener = (error: unknown): boolean => {
    const codigo = error instanceof ErrorServidor ? error.codigo : -1;
    if (codigo === 401) {
      resumen.estado = "SIN_SESION";
      resumen.detalle =
        "La sesión de la tableta con el servidor venció. Iníciela de nuevo en «Configuración y envío».";
      return true;
    }
    if (codigo === 0) {
      resumen.estado = "SIN_CONEXION";
      resumen.detalle = error instanceof Error ? error.message : "Sin conexión con el servidor.";
      return true;
    }
    resumen.estado = "ERROR";
    if (!resumen.detalle) resumen.detalle = error instanceof Error ? error.message : String(error);
    return false;
  };

  let registradas = await sincronizadas();

  // 1. Registrar lo que el servidor todavía no tiene, con sus firmas.
  for (const solicitud of await listarSolicitudes()) {
    if (solicitud.estado === "BORRADOR" || registradas.includes(solicitud.id)) continue;
    try {
      const guardada = await registrarEnServidor(solicitud);
      await incorporarAvance([aAvance(guardada)]);
      registradas = [...registradas, solicitud.id];
      await guardarSincronizadas(registradas);
      resumen.enviadas += 1;
    } catch (error) {
      if (detener(error)) return cerrar();
    }
  }

  // 2. Completar las entregas a medias: firmas o fotografía que no llegaron.
  for (const solicitud of await listarSolicitudes()) {
    if (!registradas.includes(solicitud.id) || solicitud.estado === "RECHAZADA") continue;
    const faltan = adjuntosFaltantes(solicitud);
    if (faltan.length === 0) continue;

    try {
      // Solo se reintenta con las firmas que siguen en la tableta: si el
      // archivo ya no está, reenviar no lo arregla y la bandeja lo avisa.
      const firmasDisponibles = await Promise.all(
        faltan
          .filter((rol) => rol !== "FOTO_CARNET")
          .map((rol) =>
            firmaBase64(
              rol === "FIRMA_SOLICITANTE"
                ? solicitud.firmaUri
                : solicitud.datos.garantes[rol === "FIRMA_GARANTE_1" ? 0 : 1]?.firmaUri ?? null
            )
          )
      );
      const hayFirmas = firmasDisponibles.filter(Boolean).length;
      if (hayFirmas > 0) {
        const reparada = await registrarEnServidor(solicitud);
        await incorporarAvance([aAvance(reparada)]);
        resumen.archivos += hayFirmas;
      } else if (firmasDisponibles.length > 0 && !resumen.detalle) {
        resumen.detalle = `El trámite ${solicitud.codigo} no tiene su firma en esta tableta; no puede completarse desde aquí.`;
      }
      if (faltan.includes("FOTO_CARNET")) {
        const conFoto = await subirFotografia(solicitud);
        if (conFoto) {
          await incorporarAvance([aAvance(conFoto)]);
          resumen.archivos += 1;
        }
      }
    } catch (error) {
      if (detener(error)) return cerrar();
    }
  }

  // 3. Traer el avance de los trámites en curso: número de socio, constancias
  //    y estado del expediente, para que la tableta muestre lo mismo que la
  //    bandeja.
  try {
    const enCursoLocal = (await listarSolicitudes()).filter(
      (s) => registradas.includes(s.id) && s.estado !== "BORRADOR"
    );
    if (enCursoLocal.length > 0) {
      const respuesta = await peticion<{ avances: AvanceDelServidor[]; desconocidos: string[] }>(
        "/api/tableta/avance",
        { metodo: "POST", cuerpo: { ids: enCursoLocal.map((s) => s.id) } }
      );
      resumen.actualizadas = await incorporarAvance(respuesta.avances);

      // Un trámite que el servidor no conoce —una base restaurada, por
      // ejemplo— se vuelve a registrar en la próxima pasada.
      if (respuesta.desconocidos.length > 0) {
        registradas = registradas.filter((id) => !respuesta.desconocidos.includes(id));
        await guardarSincronizadas(registradas);
      }
    }
  } catch (error) {
    if (detener(error)) return cerrar();
  }

  return cerrar();
}

/** Texto corto del estado, para el portal. */
export function describirResumen(resumen: ResumenSincronizacion | null): {
  titulo: string;
  tono: "success" | "warning" | "danger" | "info";
} {
  if (!resumen) return { titulo: "Aún no se ha sincronizado con el servidor.", tono: "info" };
  switch (resumen.estado) {
    case "AL_DIA":
      return { titulo: "Todo lo registrado está en el servidor.", tono: "success" };
    case "PENDIENTE":
      return {
        titulo:
          resumen.pendientes === 1
            ? "1 afiliación con envío pendiente."
            : `${resumen.pendientes} afiliaciones con envío pendiente.`,
        tono: "warning",
      };
    case "SIN_SERVIDOR":
      return { titulo: "Falta configurar el servidor.", tono: "danger" };
    case "SIN_SESION":
      return { titulo: "Sesión vencida: no se están enviando las afiliaciones.", tono: "danger" };
    case "SIN_CONEXION":
      return { titulo: "Sin conexión con el servidor: se enviará al volver la red.", tono: "warning" };
    case "ERROR":
      return { titulo: resumen.detalle ?? "El servidor rechazó un envío.", tono: "danger" };
  }
}
