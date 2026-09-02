import { leerBase64 } from "../data/archivos";
import { CLAVES, escribirJSON, leerJSON } from "../data/almacenamiento";
import { listarSolicitudes, reemplazarSolicitud } from "../data/solicitudes";
import { nombreDocumento } from "../domain/documentos";
import type { SolicitudAfiliacion } from "../domain/solicitud";

/**
 * Cliente del servidor institucional.
 *
 * La tableta del Área de Socios funciona sin conexión: la afiliación se
 * registra y se firma aunque la red falle, y queda en la cola local. Este
 * módulo es el que la vacía cuando hay conexión, y el único punto por el que la
 * aplicación habla con el servidor.
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

async function sincronizadas(): Promise<string[]> {
  return leerJSON<string[]>(CLAVE_SINCRONIZADAS, []);
}

async function marcarSincronizada(id: string): Promise<void> {
  const actuales = await sincronizadas();
  if (!actuales.includes(id)) await escribirJSON(CLAVE_SINCRONIZADAS, [...actuales, id]);
}

export async function estaSincronizada(id: string): Promise<boolean> {
  return (await sincronizadas()).includes(id);
}

/** Solicitudes registradas en el dispositivo que el servidor todavía no tiene. */
export async function pendientesDeEnvio(): Promise<SolicitudAfiliacion[]> {
  const [lista, enviadas] = await Promise.all([listarSolicitudes(), sincronizadas()]);
  return lista.filter((s) => s.estado !== "BORRADOR" && !enviadas.includes(s.id));
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

async function peticion<T>(
  ruta: string,
  opciones: { metodo?: string; cuerpo?: unknown; formulario?: FormData } = {}
): Promise<T> {
  const { url } = await leerConfiguracion();
  if (!url) throw new ErrorServidor("No se ha configurado la dirección del servidor.", 0);

  let respuesta: Response;
  try {
    respuesta = await fetch(`${url}${ruta}`, {
      method: opciones.metodo ?? "GET",
      headers: opciones.cuerpo ? { "Content-Type": "application/json" } : undefined,
      body: opciones.formulario ?? (opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined),
    });
  } catch {
    throw new ErrorServidor("No se pudo contactar al servidor. Verifique la conexión.", 0);
  }

  const texto = await respuesta.text();
  const datos = texto ? (JSON.parse(texto) as T & { error?: string }) : (null as T);

  if (!respuesta.ok) {
    const mensaje =
      (datos as { error?: string } | null)?.error ?? `El servidor respondió ${respuesta.status}.`;
    throw new ErrorServidor(mensaje, respuesta.status);
  }

  return datos;
}

export type SesionServidor = { usuario: string; nombre: string; area: string };

/**
 * Inicia sesión en el servidor. La contraseña se usa solo para esta petición y
 * no se almacena en el dispositivo: el servidor devuelve una cookie de sesión.
 */
export async function iniciarSesion(usuario: string, clave: string): Promise<SesionServidor> {
  const sesion = await peticion<SesionServidor>("/api/sesion", {
    metodo: "POST",
    cuerpo: { usuario, clave },
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

export type ResumenSincronizacion = {
  enviadas: number;
  documentos: number;
  fallidas: number;
  /** Mensaje del primer fallo, para mostrárselo al operador. */
  detalle?: string;
};

/**
 * Envía al servidor las afiliaciones registradas en el dispositivo y sube sus
 * documentos. Cada solicitud se envía por separado: un fallo en una no impide
 * que las demás se sincronicen.
 */
export async function sincronizar(): Promise<ResumenSincronizacion> {
  const resumen: ResumenSincronizacion = { enviadas: 0, documentos: 0, fallidas: 0 };

  for (const solicitud of await pendientesDeEnvio()) {
    try {
      const registrada = await peticion<SolicitudAfiliacion>("/api/solicitudes", {
        metodo: "POST",
        cuerpo: { solicitud },
      });

      // El servidor puede haber reasignado el código del trámite si ya existía.
      await reemplazarSolicitud(registrada);
      await marcarSincronizada(registrada.id);
      resumen.enviadas += 1;

      resumen.documentos += await subirDocumentos(registrada);
    } catch (error) {
      resumen.fallidas += 1;
      if (!resumen.detalle) {
        resumen.detalle = error instanceof Error ? error.message : String(error);
      }
    }
  }

  return resumen;
}

/**
 * Sube al expediente los documentos capturados con la tableta. Requiere que el
 * número de socio ya esté asignado: es la carpeta bajo la que se archivan.
 */
export async function subirDocumentos(solicitud: SolicitudAfiliacion): Promise<number> {
  if (!solicitud.tramite.numeroSocio) return 0;

  let subidos = 0;
  for (const documento of solicitud.documentos) {
    try {
      const base64 = await leerBase64(documento.uri);
      if (!base64) continue;

      const formulario = new FormData();
      formulario.append("tipoDocumento", documento.tipo);
      // React Native admite este descriptor de archivo en FormData.
      formulario.append("archivo", {
        uri: documento.uri,
        name: documento.nombreArchivo,
        type: documento.mimeType,
      } as unknown as Blob);

      await peticion(`/api/expediente/${solicitud.id}/documentos`, {
        metodo: "POST",
        formulario,
      });
      subidos += 1;
    } catch (error) {
      console.warn(
        `[servidor] No se pudo subir ${nombreDocumento(documento.tipo)}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return subidos;
}

/** Registra en el servidor el número de socio asignado en el CRM. */
export async function enviarNumeros(
  solicitudId: string,
  numeros: { numeroSocio?: string; numeroTarjeta?: string }
): Promise<void> {
  await peticion(`/api/solicitudes/${solicitudId}/numeros`, { metodo: "POST", cuerpo: numeros });
}
