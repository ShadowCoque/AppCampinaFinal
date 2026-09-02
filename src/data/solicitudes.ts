import { escaneosEsperados } from "../domain/documentos";
import { MODO_FIRMA } from "../domain/firmaElectronica";
import { VERSION_AVISO } from "../domain/privacidad";
import {
  ESQUEMA_SOLICITUD,
  datosVacios,
  expedienteVacio,
  tramiteVacio,
  type Area,
  type ConstanciaTramite,
  type DatosAfiliacion,
  type EstadoSolicitud,
  type SolicitudAfiliacion,
  type TramiteInterno,
} from "../domain/solicitud";
import type { EstadoFormulario } from "../domain/formularioAfiliacion";
import { normalizarNumeroSocio } from "../domain/texto";
import { CLAVES, escribirJSON, leerJSON, nuevoId } from "./almacenamiento";
import { eliminarExpediente, persistirFirma } from "./archivos";

/**
 * Repositorio local de solicitudes de afiliación.
 *
 * Es la copia que vive en la tableta del Área de Socios. El servidor
 * (`server/`) es la fuente de verdad institucional; aquí se conserva lo
 * registrado para que el trámite pueda completarse sin conexión y sincronizarse
 * después (ver `services/sincronizacion.ts`).
 */

export async function listarSolicitudes(): Promise<SolicitudAfiliacion[]> {
  const lista = await leerJSON<SolicitudAfiliacion[]>(CLAVES.solicitudes, []);
  return lista
    .filter((s) => s && typeof s === "object" && s.id)
    .map(migrar)
    .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
}

/**
 * Adapta un registro guardado con un esquema anterior.
 *
 * Los borradores viven en la tableta y sobreviven a las actualizaciones de la
 * aplicación, así que un formulario a medio llenar puede reabrirse meses
 * después con una versión que ya pide campos que entonces no existían.
 *
 *   Esquema 5 → 6  Se separó el nombre del socio titular en apellidos y
 *                  nombres, y se añadieron la provincia del domicilio, el
 *                  ordinal del dependiente y la confirmación de SAFI.
 *
 * El nombre del titular se conserva entero en el campo de apellidos en lugar de
 * partirlo por la mitad: adivinar cuántos apellidos tiene una persona acabaría
 * escribiendo un nombre equivocado en el CRM. Al reabrir el borrador la
 * validación pedirá completar el desglose, que es lo correcto.
 */
function migrar(solicitud: SolicitudAfiliacion): SolicitudAfiliacion {
  if (solicitud.esquema >= ESQUEMA_SOLICITUD) return solicitud;

  const antiguo = solicitud.datos as Partial<DatosAfiliacion> & { titularNombre?: string };
  const tramite = solicitud.tramite ?? tramiteVacio();
  const expediente = solicitud.expediente ?? expedienteVacio();

  return {
    ...solicitud,
    esquema: ESQUEMA_SOLICITUD,
    datos: {
      ...datosVacios(),
      ...solicitud.datos,
      titularApellidos: antiguo.titularApellidos ?? antiguo.titularNombre ?? "",
      titularNombres: antiguo.titularNombres ?? "",
      provincia: antiguo.provincia ?? "",
    },
    tramite: { ...tramiteVacio(), ...tramite },
    expediente: { ...expedienteVacio(), ...expediente },
    historial: solicitud.historial ?? [],
  };
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
  responsable: string,
  estadoInicial: EstadoSolicitud = "REGISTRADA"
): Promise<SolicitudAfiliacion> {
  const lista = await listarSolicitudes();
  const ahora = new Date().toISOString();

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
    fechaRegistro: ahora.slice(0, 10),
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
    estado: estadoInicial,
    creadaEn: ahora,
    actualizadaEn: ahora,
    datos: { ...estado.datos, garantes },
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
        estado: estadoInicial,
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
 * Registra los números que el Área de Socios asigna al crear al socio en el
 * CRM. Sin el número de socio no puede nombrarse la carpeta del expediente.
 */
export async function registrarNumeros(
  id: string,
  numeros: { numeroSocio?: string; numeroTarjeta?: string }
): Promise<SolicitudAfiliacion | null> {
  const lista = await listarSolicitudes();
  const indice = lista.findIndex((s) => s.id === id);
  if (indice === -1) return null;

  const actual = lista[indice];
  const actualizada: SolicitudAfiliacion = {
    ...actual,
    actualizadaEn: new Date().toISOString(),
    tramite: {
      ...actual.tramite,
      numeroSocio:
        numeros.numeroSocio !== undefined
          ? normalizarNumeroSocio(numeros.numeroSocio)
          : actual.tramite.numeroSocio,
      numeroTarjeta: numeros.numeroTarjeta?.trim() ?? actual.tramite.numeroTarjeta,
    },
  };

  lista[indice] = actualizada;
  await guardarLista(lista);
  return actualizada;
}

/** Aplica una constancia del reverso (revisión, aprobación u observación). */
export async function registrarConstancia(
  id: string,
  estado: EstadoSolicitud,
  constancia: ConstanciaTramite & { numeroFactura?: string }
): Promise<SolicitudAfiliacion | null> {
  const lista = await listarSolicitudes();
  const indice = lista.findIndex((s) => s.id === id);
  if (indice === -1) return null;

  const actual = lista[indice];
  const tramite = { ...actual.tramite };

  switch (constancia.area) {
    case "CONTABILIDAD":
      tramite.revision = { ...constancia, numeroFactura: constancia.numeroFactura ?? "" };
      break;
    case "GERENCIA":
      tramite.aprobacion = constancia;
      break;
    case "SOCIOS":
      tramite.registro = constancia;
      break;
  }

  const actualizada: SolicitudAfiliacion = {
    ...actual,
    estado,
    actualizadaEn: constancia.en,
    tramite,
    historial: [
      ...actual.historial,
      {
        en: constancia.en,
        estado,
        area: constancia.area,
        responsable: constancia.responsable,
        nota: constancia.observacion || undefined,
      },
    ],
  };

  lista[indice] = actualizada;
  await guardarLista(lista);
  return actualizada;
}

/** Sustituye una solicitud completa con la versión que devolvió el servidor. */
export async function reemplazarSolicitud(solicitud: SolicitudAfiliacion): Promise<void> {
  const lista = await listarSolicitudes();
  const indice = lista.findIndex((s) => s.id === solicitud.id);
  if (indice === -1) lista.unshift(solicitud);
  else lista[indice] = solicitud;
  await guardarLista(lista);
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

/** Área a la que le toca actuar, para los contadores del portal. */
export function areasPendientes(solicitudes: SolicitudAfiliacion[]): Record<Area, number> {
  return solicitudes.reduce(
    (acc, solicitud) => {
      if (solicitud.estado === "REGISTRADA") acc.CONTABILIDAD += 1;
      if (solicitud.estado === "REVISADA") acc.GERENCIA += 1;
      if (solicitud.estado === "OBSERVADA" || !solicitud.tramite.numeroSocio) acc.SOCIOS += 1;
      return acc;
    },
    { SOCIOS: 0, CONTABILIDAD: 0, GERENCIA: 0 } as Record<Area, number>
  );
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

export async function descartarBorrador(): Promise<void> {
  const borrador = await leerBorrador();
  await escribirJSON(CLAVES.borradorAfiliacion, null);
  if (borrador?.solicitudId) eliminarExpediente(borrador.solicitudId);
}
