import { nombreDocumento, type TipoDocumento } from "./documentos";
import { MOTIVO_RECHAZO_META, type MotivoRechazo } from "./expediente";
import {
  AREA_META,
  nombreCompleto,
  type Area,
  type SolicitudAfiliacion,
  type TonoEstado,
} from "./solicitud";
import { nombreTipo } from "./tiposMiembro";

/**
 * Bandeja de tareas de las tres áreas que intervienen en el trámite.
 *
 * Las tareas no se almacenan: se derivan del estado de cada solicitud y del
 * estado de su expediente. Así no puede existir una tarea huérfana ni una
 * solicitud atascada sin tarea que la reclame, que es exactamente el problema
 * que hoy tiene el reverso del formulario impreso cuando se llena de manera
 * irregular.
 *
 * Además de las dos tareas del reverso (Contabilidad REVISA, Gerencia APRUEBA),
 * el Área de Socios ve las suyas: las solicitudes a las que aún les falta
 * escanear un documento de respaldo, las que se depositaron con un nombre que
 * el repositorio no reconoce y las que están pendientes de cargarse al CRM de
 * SAFI (informe CLC-TI-010, numeral 5.2).
 */

export const TIPOS_TAREA = [
  "REVISAR",
  "APROBAR",
  "CORREGIR_OBSERVACION",
  "CONFIRMAR_SAFI",
  "ESCANEO_PENDIENTE",
  "ESCANEO_NO_RECONOCIDO",
  "CARGA_SAFI_PENDIENTE",
] as const;

export type TipoTarea = (typeof TIPOS_TAREA)[number];

export type MetaTarea = {
  etiqueta: string;
  area: Area;
  tono: TonoEstado;
  /** Verbo del botón que resuelve la tarea, o `null` si se resuelve fuera del sistema. */
  accion: string | null;
  /** La tarea exige escribir una observación al resolverla. */
  exigeObservacion: boolean;
};

export const TAREA_META: Record<TipoTarea, MetaTarea> = {
  REVISAR: {
    etiqueta: "Pendiente de revisión",
    area: "CONTABILIDAD",
    tono: "info",
    accion: "Marcar como revisada",
    exigeObservacion: false,
  },
  APROBAR: {
    etiqueta: "Pendiente de aprobación",
    area: "GERENCIA",
    tono: "gold",
    accion: "Aprobar el ingreso",
    exigeObservacion: false,
  },
  CORREGIR_OBSERVACION: {
    etiqueta: "Devuelta con observaciones",
    area: "SOCIOS",
    tono: "warning",
    accion: "Corregir y volver a registrar",
    exigeObservacion: false,
  },
  CONFIRMAR_SAFI: {
    etiqueta: "Falta confirmar los datos y crear el socio en SAFI",
    area: "SOCIOS",
    tono: "warning",
    accion: "Confirmar y crear en SAFI",
    exigeObservacion: false,
  },
  ESCANEO_PENDIENTE: {
    etiqueta: "Falta escanear documentación",
    area: "SOCIOS",
    tono: "warning",
    accion: null,
    exigeObservacion: false,
  },
  ESCANEO_NO_RECONOCIDO: {
    etiqueta: "Archivo escaneado con nombre no reconocido",
    area: "SOCIOS",
    tono: "danger",
    accion: "Renombrar en la carpeta compartida",
    exigeObservacion: false,
  },
  CARGA_SAFI_PENDIENTE: {
    etiqueta: "Pendiente de cargar al CRM de SAFI",
    area: "SOCIOS",
    tono: "warning",
    accion: "Reintentar la carga",
    exigeObservacion: false,
  },
};

/** Una incidencia del vigilante de la carpeta compartida de escaneos. */
export type IncidenciaEscaneo = {
  id: string;
  archivo: string;
  motivo: MotivoRechazo;
  detalle: string;
  detectadaEn: string;
  /** Número de socio deducido del nombre, si se pudo. */
  numeroSocio?: string;
};

export type Tarea = {
  id: string;
  tipo: TipoTarea;
  area: Area;
  /** Solicitud a la que se refiere la tarea, si la hay. */
  solicitudId?: string;
  codigo: string;
  titulo: string;
  detalle: string;
  /** Número de socio, cédula y nombre: lo que la bandeja muestra en la lista. */
  numeroSocio: string;
  cedula: string;
  nombreSocio: string;
  tipoMiembro: string;
  /** Momento desde el que la tarea está pendiente, para ordenar por antigüedad. */
  desde: string;
};

/* ------------------------------------------------------------------ */
/* Derivación                                                          */
/* ------------------------------------------------------------------ */

function baseDe(solicitud: SolicitudAfiliacion) {
  return {
    solicitudId: solicitud.id,
    codigo: solicitud.codigo,
    numeroSocio: solicitud.tramite.numeroSocio || "—",
    cedula: solicitud.datos.cedula,
    nombreSocio: nombreCompleto(solicitud.datos),
    tipoMiembro: nombreTipo(solicitud.datos.tipoMiembro),
  };
}

function listaDocumentos(tipos: TipoDocumento[]): string {
  return tipos.map(nombreDocumento).join(", ");
}

/** Tareas que genera una sola solicitud, en todas las áreas. */
export function tareasDeSolicitud(solicitud: SolicitudAfiliacion): Tarea[] {
  const tareas: Tarea[] = [];
  const base = baseDe(solicitud);
  const { tramite, expediente, estado } = solicitud;

  if (estado === "REGISTRADA") {
    tareas.push({
      ...base,
      id: `${solicitud.id}:REVISAR`,
      tipo: "REVISAR",
      area: "CONTABILIDAD",
      titulo: `Revisar la afiliación ${solicitud.codigo}`,
      detalle:
        "Compruebe en el CRM de SAFI que el ingreso del socio se haya realizado correctamente y registre el número de factura.",
      desde: tramite.registro?.en ?? solicitud.creadaEn,
    });
  }

  if (estado === "REVISADA") {
    tareas.push({
      ...base,
      id: `${solicitud.id}:APROBAR`,
      tipo: "APROBAR",
      area: "GERENCIA",
      titulo: `Aprobar el ingreso ${solicitud.codigo}`,
      detalle: tramite.revision?.observacion
        ? `Observación de Contabilidad: ${tramite.revision.observacion}`
        : "Contabilidad ya revisó el ingreso. Corresponde su aprobación.",
      desde: tramite.revision?.en ?? solicitud.actualizadaEn,
    });
  }

  if (estado === "OBSERVADA") {
    const observacion =
      tramite.aprobacion?.observacion || tramite.revision?.observacion || "Sin detalle registrado.";
    tareas.push({
      ...base,
      id: `${solicitud.id}:CORREGIR`,
      tipo: "CORREGIR_OBSERVACION",
      area: "SOCIOS",
      titulo: `Corregir la afiliación ${solicitud.codigo}`,
      detalle: `Observación: ${observacion}`,
      desde: solicitud.actualizadaEn,
    });
  }

  // El alta en SAFI es lo primero que hace el Área de Socios tras registrar la
  // afiliación: Contabilidad revisa comprobando el ingreso en el CRM, así que
  // para entonces la ficha ya tiene que existir. La misma tarea recoge el
  // número de socio, sin el cual tampoco se puede nombrar la carpeta del
  // expediente.
  if (estado !== "BORRADOR" && estado !== "RECHAZADA" && !expediente.socioSafiId) {
    const falta = !tramite.numeroSocio.trim()
      ? "Falta el número de socio y la confirmación de los campos de facturación y cuotas."
      : "Falta confirmar los campos de facturación y cuotas que SAFI guarda como listas cerradas.";

    tareas.push({
      ...base,
      id: `${solicitud.id}:SAFI_ALTA`,
      tipo: "CONFIRMAR_SAFI",
      area: "SOCIOS",
      titulo: `Crear en SAFI a ${base.nombreSocio}`,
      detalle: expediente.altaSafiMensaje ?? falta,
      desde: tramite.registro?.en ?? solicitud.creadaEn,
    });
  }

  if (expediente.escaneosPendientes.length > 0) {
    tareas.push({
      ...base,
      id: `${solicitud.id}:ESCANEO`,
      tipo: "ESCANEO_PENDIENTE",
      area: "SOCIOS",
      titulo: `Falta escanear documentación de ${base.nombreSocio}`,
      detalle: `Pendiente de depositar en la carpeta compartida: ${listaDocumentos(
        expediente.escaneosPendientes
      )}.`,
      desde: tramite.registro?.en ?? solicitud.creadaEn,
    });
  }

  if (expediente.safi === "ERROR" || (expediente.safi === "PENDIENTE" && estado === "APROBADA")) {
    tareas.push({
      ...base,
      id: `${solicitud.id}:SAFI`,
      tipo: "CARGA_SAFI_PENDIENTE",
      area: "SOCIOS",
      titulo: `Expediente de ${base.nombreSocio} sin cargar en SAFI`,
      detalle:
        expediente.safiMensaje ??
        "El expediente aún no se ha publicado en la sección Documentos del módulo Cuenta del CRM de SAFI.",
      desde: expediente.safiActualizadoEn ?? solicitud.actualizadaEn,
    });
  }

  return tareas;
}

/** Tareas que generan los archivos que el repositorio no pudo clasificar. */
export function tareasDeIncidencias(incidencias: IncidenciaEscaneo[]): Tarea[] {
  return incidencias.map((incidencia) => ({
    id: `escaneo:${incidencia.id}`,
    tipo: "ESCANEO_NO_RECONOCIDO" as const,
    area: "SOCIOS" as const,
    codigo: incidencia.archivo,
    titulo: `Archivo no reconocido: ${incidencia.archivo}`,
    detalle: incidencia.detalle || MOTIVO_RECHAZO_META[incidencia.motivo],
    numeroSocio: incidencia.numeroSocio ?? "—",
    cedula: "—",
    nombreSocio: "—",
    tipoMiembro: "—",
    desde: incidencia.detectadaEn,
  }));
}

/**
 * Todas las tareas del sistema, de la más antigua a la más reciente.
 *
 * Se calcula una sola vez y de ahí salen la bandeja de cada área y los
 * contadores: derivarlas por separado obligaba a recorrer las solicitudes dos
 * veces en cada recarga, y las tres áreas recargan cada minuto.
 */
export function calcularTareas(
  solicitudes: SolicitudAfiliacion[],
  incidencias: IncidenciaEscaneo[] = []
): Tarea[] {
  return [...solicitudes.flatMap(tareasDeSolicitud), ...tareasDeIncidencias(incidencias)].sort(
    (a, b) => a.desde.localeCompare(b.desde)
  );
}

/** Tareas de un área a partir del conjunto ya calculado. */
export function tareasDeArea(area: Area, tareas: Tarea[]): Tarea[] {
  return tareas.filter((t) => t.area === area);
}

/** Contadores por área a partir del conjunto ya calculado. */
export function contadoresDeTareas(tareas: Tarea[]): Record<Area, number> {
  const contadores: Record<Area, number> = { SOCIOS: 0, CONTABILIDAD: 0, GERENCIA: 0 };
  for (const tarea of tareas) contadores[tarea.area] += 1;
  return contadores;
}

/** Bandeja completa de un área, ordenada de la tarea más antigua a la más reciente. */
export function bandejaDe(
  area: Area,
  solicitudes: SolicitudAfiliacion[],
  incidencias: IncidenciaEscaneo[] = []
): Tarea[] {
  return tareasDeArea(area, calcularTareas(solicitudes, incidencias));
}

/** Número de tareas pendientes por área, para los contadores del portal. */
export function contadoresPorArea(
  solicitudes: SolicitudAfiliacion[],
  incidencias: IncidenciaEscaneo[] = []
): Record<Area, number> {
  return contadoresDeTareas(calcularTareas(solicitudes, incidencias));
}

/**
 * Solicitudes ya atendidas por un área: la segunda lista que pide el informe
 * («cada una ve una lista de tareas pendientes y otra de tareas cumplidas»).
 */
export function atendidasPor(area: Area, solicitudes: SolicitudAfiliacion[]): SolicitudAfiliacion[] {
  return solicitudes
    .filter((solicitud) => {
      switch (area) {
        case "CONTABILIDAD":
          return solicitud.tramite.revision !== null;
        case "GERENCIA":
          return solicitud.tramite.aprobacion !== null;
        case "SOCIOS":
          return solicitud.estado === "APROBADA";
      }
    })
    .sort((a, b) => b.actualizadaEn.localeCompare(a.actualizadaEn));
}

/** Etiqueta legible del área, para la interfaz web y la aplicación. */
export function etiquetaArea(area: Area): string {
  return AREA_META[area].etiqueta;
}
