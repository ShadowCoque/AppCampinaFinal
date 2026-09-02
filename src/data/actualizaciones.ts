import { VERSION_AVISO } from "../domain/privacidad";
import {
  ESQUEMA_SOLICITUD,
  type CambioRegistrado,
  type EstadoActualizacion,
  type SolicitudActualizacion,
} from "../domain/solicitud";
import { CLAVES, escribirJSON, leerJSON, nuevoId } from "./almacenamiento";

/**
 * Repositorio de actualizaciones de la ficha del socio.
 *
 * Registra únicamente los campos que efectivamente cambiaron, con su valor
 * anterior y el nuevo, para poder acreditar qué se modificó y cuándo. No genera
 * facturación: solo produce cobro si el socio además solicita una credencial.
 */

export type EntradaActualizacion = {
  numeroSocio: string;
  nombreSocio: string;
  cedula: string;
  cambios: CambioRegistrado[];
  fotoUri: string | null;
  observacion: string;
  requiereNuevaCredencial: boolean;
  aceptaTratamiento: boolean;
};

export async function listarActualizaciones(): Promise<SolicitudActualizacion[]> {
  const lista = await leerJSON<SolicitudActualizacion[]>(CLAVES.actualizaciones, []);
  return lista
    .filter((s) => s && typeof s === "object" && s.id)
    .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
}

function generarCodigo(existentes: SolicitudActualizacion[]): string {
  const anio = new Date().getFullYear();
  const prefijo = `AC-${anio}-`;
  const ultimo = existentes
    .filter((s) => s.codigo?.startsWith(prefijo))
    .map((s) => Number(s.codigo.slice(prefijo.length)))
    .filter((n) => Number.isFinite(n))
    .reduce((max, n) => Math.max(max, n), 0);
  return `${prefijo}${String(ultimo + 1).padStart(4, "0")}`;
}

export function nuevaActualizacionId(): string {
  return nuevoId();
}

export async function crearActualizacion(
  id: string,
  entrada: EntradaActualizacion
): Promise<SolicitudActualizacion> {
  const lista = await listarActualizaciones();
  const ahora = new Date().toISOString();

  const solicitud: SolicitudActualizacion = {
    id,
    codigo: generarCodigo(lista),
    esquema: ESQUEMA_SOLICITUD,
    estado: "REGISTRADA",
    creadaEn: ahora,
    actualizadaEn: ahora,
    numeroSocio: entrada.numeroSocio.trim(),
    nombreSocio: entrada.nombreSocio.trim(),
    cedula: entrada.cedula.trim(),
    cambios: entrada.cambios,
    fotoUri: entrada.fotoUri,
    observacion: entrada.observacion.trim(),
    requiereNuevaCredencial: entrada.requiereNuevaCredencial,
    consentimiento: entrada.aceptaTratamiento
      ? {
          versionAviso: VERSION_AVISO,
          aceptadoEn: ahora,
          valores: {
            tratamientoDatos: true,
            imagenCredencial: !!entrada.fotoUri,
            veracidad: true,
            comunicaciones: false,
          },
        }
      : null,
    historial: [
      { en: ahora, estado: "REGISTRADA", nota: "Actualización registrada por el Área de Socios." },
    ],
  };

  await escribirJSON(CLAVES.actualizaciones, [solicitud, ...lista]);
  return solicitud;
}

export async function cambiarEstadoActualizacion(
  id: string,
  estado: EstadoActualizacion,
  nota?: string
): Promise<SolicitudActualizacion | null> {
  const lista = await listarActualizaciones();
  const indice = lista.findIndex((s) => s.id === id);
  if (indice === -1) return null;

  const ahora = new Date().toISOString();
  const actualizada: SolicitudActualizacion = {
    ...lista[indice],
    estado,
    actualizadaEn: ahora,
    historial: [...lista[indice].historial, { en: ahora, estado, nota }],
  };

  lista[indice] = actualizada;
  await escribirJSON(CLAVES.actualizaciones, lista);
  return actualizada;
}
