import { config } from "../config";
import { archivosDeSolicitud, marcarSafi, pendientesDeSafi } from "../db/archivos";
import { registrarBitacora } from "../db/indice";
import { actualizarExpediente, obtenerSolicitud } from "../db/solicitudes";
import { adaptadorSafi } from "./adaptador";

/**
 * Cola de publicación en el CRM de SAFI.
 *
 * Los documentos se archivan primero en el repositorio del Club y solo después
 * se publican en SAFI. Si SAFI no está disponible, el expediente ya está a
 * salvo y la publicación se reintenta; el trámite del socio nunca se detiene
 * por un problema del sistema de destino.
 */

let temporizador: NodeJS.Timeout | null = null;
let enCurso = false;

export function iniciarColaSafi(): void {
  if (temporizador) return;

  const intervalo = config.intervaloSafiSeg * 1000;
  temporizador = setInterval(() => void procesarCola(), intervalo);
  setTimeout(() => void procesarCola(), 5000);

  console.log(
    `[safi] Cola de publicación en modo ${config.safiModo}, revisión cada ${config.intervaloSafiSeg} s.`
  );
}

export function detenerColaSafi(): void {
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
}

export type ResumenCola = { publicados: number; pendientes: number; errores: number };

export async function procesarCola(): Promise<ResumenCola> {
  if (enCurso) return { publicados: 0, pendientes: 0, errores: 0 };
  enCurso = true;

  const resumen: ResumenCola = { publicados: 0, pendientes: 0, errores: 0 };
  const adaptador = adaptadorSafi();

  try {
    for (const archivo of pendientesDeSafi()) {
      const resultado = await adaptador.publicar(archivo);

      if (resultado.ok) {
        marcarSafi(archivo.id, "CARGADO", resultado.referencia);
        resumen.publicados += 1;
        registrarBitacora({
          area: "SOCIOS",
          accion: "PUBLICAR_SAFI",
          entidad: archivo.numeroSocio,
          detalle: archivo.nombreArchivo,
        });
      } else if (resultado.reintentable) {
        marcarSafi(archivo.id, "ERROR", resultado.mensaje);
        resumen.errores += 1;
      } else {
        // Modo manual: no es un fallo, es el estado normal mientras no se
        // habilite la integración. Se deja pendiente sin gastar reintentos.
        marcarSafi(archivo.id, "PENDIENTE", resultado.mensaje);
        resumen.pendientes += 1;
      }

      if (archivo.solicitudId) {
        sincronizarExpediente(archivo.solicitudId);
      }
    }
  } catch (error) {
    console.error("[safi] Error procesando la cola:", error);
  } finally {
    enCurso = false;
  }

  return resumen;
}

/** Refleja en la solicitud el estado agregado de sus documentos en SAFI. */
function sincronizarExpediente(solicitudId: string): void {
  const solicitud = obtenerSolicitud(solicitudId);
  if (!solicitud) return;

  const archivos = archivosDeSolicitud(solicitudId);
  if (archivos.length === 0) return;

  const hayError = archivos.some((a) => a.safiEstado === "ERROR");
  const todosCargados = archivos.every((a) => a.safiEstado === "CARGADO");

  actualizarExpediente(solicitudId, {
    safi: hayError ? "ERROR" : todosCargados ? "CARGADO" : "PENDIENTE",
    safiMensaje: archivos.find((a) => a.safiMensaje)?.safiMensaje ?? undefined,
    safiActualizadoEn: new Date().toISOString(),
  });
}
