import { escaneosEsperados } from "../domain/documentos";
import { MODO_FIRMA } from "../domain/firmaElectronica";
import { VERSION_AVISO } from "../domain/privacidad";
import {
  ESQUEMA_SOLICITUD,
  datosVacios,
  expedienteVacio,
  migrarSolicitud,
  tramiteVacio,
  type SolicitudAfiliacion,
  type TramiteInterno,
} from "../domain/solicitud";
import type { EstadoFormulario } from "../domain/formularioAfiliacion";
import { CLAVES, escribirJSON, leerJSON, nuevoId } from "./almacenamiento";
import { eliminarExpediente, persistirFirma } from "./archivos";

/**
 * Repositorio local de solicitudes de afiliación.
 *
 * Es la copia que vive en la tableta del Área de Socios. El servidor
 * (`server/`) es la fuente de verdad institucional; aquí se conserva lo
 * registrado para que el trámite pueda completarse sin conexión y enviarse en
 * cuanto la haya (ver `services/servidor.ts`), y para mostrar en la tableta el
 * avance que el servidor le devuelve.
 */

export async function listarSolicitudes(): Promise<SolicitudAfiliacion[]> {
  const lista = await leerJSON<SolicitudAfiliacion[]>(CLAVES.solicitudes, []);
  return lista
    .filter((s) => s && typeof s === "object" && s.id)
    // Los borradores y registros sobreviven a las actualizaciones de la
    // aplicación: se ponen al día con el mismo código que usa el servidor.
    .map((s) => migrarSolicitud({ ...s, datos: { ...datosVacios(), ...s.datos } }))
    .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
}

export async function obtenerSolicitud(id: string): Promise<SolicitudAfiliacion | null> {
  const lista = await listarSolicitudes();
  return lista.find((s) => s.id === id) ?? null;
}

async function guardarLista(lista: SolicitudAfiliacion[]): Promise<boolean> {
  return escribirJSON(CLAVES.solicitudes, lista);
}

/** Código legible del trámite: `AF-2026-0007`. */
function generarCodigo(existentes: SolicitudAfiliacion[]): string {
  const anio = new Date().getFullYear();
  const prefijo = `AF-${anio}-`;
  const ultimo = existentes
    .filter((s) => s.codigo?.startsWith(prefijo))
    .map((s) => Number(s.codigo.slice(prefijo.length)))
    .filter((n) => Number.isFinite(n))
    .reduce((max, n) => Math.max(max, n), 0);
  return `${prefijo}${String(ultimo + 1).padStart(4, "0")}`;
}

/** Reserva un identificador antes de guardar, para nombrar el expediente. */
export function nuevaSolicitudId(): string {
  return nuevoId();
}

export async function crearSolicitud(
  id: string,
  estado: EstadoFormulario,
  responsable: string
): Promise<SolicitudAfiliacion> {
  const lista = await listarSolicitudes();

  // Si la aplicación se cerró justo después de registrar y antes de cerrar el
  // borrador, al volver a enviarlo llegaría el mismo identificador. Se devuelve
  // lo ya registrado: duplicarlo dejaría dos trámites con los mismos archivos.
  const yaRegistrada = lista.find((s) => s.id === id);
  if (yaRegistrada) return yaRegistrada;

  const ahora = new Date().toISOString();
  const hoy = ahora.slice(0, 10);

  // Las firmas normalmente ya están en disco: el asistente las escribe al
  // trazarlas. Esta llamada es la red de seguridad para un borrador guardado
  // por una versión anterior, en el que aún viajaban como data URI.
  const firmaUri = persistirFirma(id, estado.firmaUri, { prefijo: "firma" });

  const garantes = estado.datos.garantes.map((garante, indice) => ({
    ...garante,
    firmaUri: persistirFirma(id, garante.firmaUri, {
      prefijo: `firma-garante-${indice + 1}`,
    }),
  }));

  const tramite: TramiteInterno = {
    ...tramiteVacio(),
    fechaRegistro: hoy,
    registro: {
      area: "SOCIOS",
      responsable,
      en: ahora,
      observacion: "",
    },
  };

  const solicitud: SolicitudAfiliacion = {
    id,
    codigo: generarCodigo(lista),
    esquema: ESQUEMA_SOLICITUD,
    estado: "REGISTRADA",
    creadaEn: ahora,
    actualizadaEn: ahora,
    datos: {
      ...estado.datos,
      garantes,
      // «Fecha de ingreso al Club» del R-PGS1-1: la del registro.
      fechaIngresoClub: estado.datos.fechaIngresoClub || hoy,
      // La carta se firma junto con el formulario: queda la constancia.
      carta: estado.datos.carta ? { ...estado.datos.carta, aceptadaEn: ahora } : null,
    },
    documentos: estado.documentos,
    firmaUri,
    modoFirma: MODO_FIRMA,
    identidad: estado.identidad,
    consentimiento: {
      versionAviso: VERSION_AVISO,
      aceptadoEn: ahora,
      valores: estado.consentimientos,
    },
    tramite,
    expediente: {
      ...expedienteVacio(),
      escaneosPendientes: escaneosEsperados(estado.datos.tipoMiembro),
    },
    historial: [
      {
        en: ahora,
        estado: "REGISTRADA",
        area: "SOCIOS",
        responsable,
        nota: "Afiliación registrada desde la aplicación.",
      },
    ],
  };

  await guardarLista([solicitud, ...lista]);
  return solicitud;
}

/**
 * Lo que el servidor sabe de un trámite y la tableta no: el código definitivo,
 * el estado, las constancias del reverso, el número de socio y el estado del
 * expediente.
 */
export type AvanceDelServidor = Pick<
  SolicitudAfiliacion,
  "id" | "codigo" | "estado" | "actualizadaEn" | "tramite" | "expediente" | "historial"
>;

/**
 * Incorpora a la copia de la tableta el avance que devolvió el servidor.
 *
 * Solo se toma lo que el servidor gobierna. Los datos del solicitante, sus
 * documentos y las rutas de sus firmas son los de la tableta: las rutas que
 * conoce el servidor no significan nada en el dispositivo, y sustituirlas
 * dejaría el formulario de la tableta sin firmas —que es justo lo que ocurría
 * antes de esta corrección.
 */
export async function incorporarAvance(avances: AvanceDelServidor[]): Promise<number> {
  if (avances.length === 0) return 0;
  const lista = await listarSolicitudes();
  let cambios = 0;

  for (const avance of avances) {
    const indice = lista.findIndex((s) => s.id === avance.id);
    if (indice === -1) continue;
    const local = lista[indice];
    if (local.actualizadaEn === avance.actualizadaEn && local.estado === avance.estado) continue;

    lista[indice] = {
      ...local,
      codigo: avance.codigo || local.codigo,
      estado: avance.estado,
      actualizadaEn: avance.actualizadaEn,
      tramite: { ...tramiteVacio(), ...avance.tramite },
      expediente: { ...expedienteVacio(), ...avance.expediente },
      historial: avance.historial ?? local.historial,
    };
    cambios += 1;
  }

  if (cambios > 0) await guardarLista(lista);
  return cambios;
}

export async function actualizarExpediente(
  id: string,
  cambios: Partial<SolicitudAfiliacion["expediente"]>
): Promise<SolicitudAfiliacion | null> {
  const lista = await listarSolicitudes();
  const indice = lista.findIndex((s) => s.id === id);
  if (indice === -1) return null;

  const actualizada: SolicitudAfiliacion = {
    ...lista[indice],
    actualizadaEn: new Date().toISOString(),
    expediente: { ...lista[indice].expediente, ...cambios },
  };

  lista[indice] = actualizada;
  await guardarLista(lista);
  return actualizada;
}

export async function eliminarSolicitud(id: string): Promise<void> {
  const lista = await listarSolicitudes();
  await guardarLista(lista.filter((s) => s.id !== id));
  eliminarExpediente(id);
}

/* ------------------------------------------------------------------ */
/* Borrador en curso                                                   */
/* ------------------------------------------------------------------ */

export type Borrador = {
  solicitudId: string;
  paso: number;
  estado: EstadoFormulario;
  guardadoEn: string;
};

export async function guardarBorrador(
  solicitudId: string,
  paso: number,
  estado: EstadoFormulario
): Promise<void> {
  await escribirJSON(CLAVES.borradorAfiliacion, {
    solicitudId,
    paso,
    estado,
    guardadoEn: new Date().toISOString(),
  } satisfies Borrador);
}

export async function leerBorrador(): Promise<Borrador | null> {
  return leerJSON<Borrador | null>(CLAVES.borradorAfiliacion, null);
}

/**
 * Cierra el borrador de una afiliación que acaba de registrarse.
 *
 * Solo olvida el borrador: **no toca los archivos**. La afiliación registrada
 * y su borrador comparten identificador —y por tanto carpeta—, así que borrar
 * aquí la carpeta se llevaba la firma del solicitante, las de sus garantes y su
 * fotografía justo después de registrarlas. Era la causa de que el formulario
 * generado saliera sin firma.
 */
export async function cerrarBorrador(): Promise<void> {
  await escribirJSON(CLAVES.borradorAfiliacion, null);
}

/**
 * Descarta un borrador abandonado y los archivos que alcanzó a capturar.
 *
 * Nunca borra la carpeta de una afiliación ya registrada: si el borrador
 * apunta a una, es que la aplicación se cerró entre el registro y el cierre
 * del borrador, y esos archivos son los del trámite.
 */
export async function descartarBorrador(): Promise<void> {
  const borrador = await leerBorrador();
  await escribirJSON(CLAVES.borradorAfiliacion, null);
  if (!borrador?.solicitudId) return;

  const registrada = (await listarSolicitudes()).some((s) => s.id === borrador.solicitudId);
  if (!registrada) eliminarExpediente(borrador.solicitudId);
}

/** Si el borrador corresponde a una afiliación que ya se registró. */
export async function borradorYaRegistrado(borrador: Borrador): Promise<boolean> {
  return (await listarSolicitudes()).some((s) => s.id === borrador.solicitudId);
}
