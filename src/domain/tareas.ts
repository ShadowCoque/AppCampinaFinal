import { nombreDocumento, type TipoDocumento } from "./documentos";
import { MOTIVO_RECHAZO_META, nombreArchivo, type MotivoRechazo } from "./expediente";
import {
  AREA_META,
  ROL_ADJUNTO_META,
  adjuntosFaltantes,
  nombreCompleto,
  type Area,
  type SolicitudAfiliacion,
  type TonoEstado,
} from "./solicitud";
import { nombreTipo, tieneCuentaPropia } from "./tiposMiembro";

/**
 * Bandeja de tareas de las tres áreas que intervienen en el trámite.
 *
 * Las tareas no se almacenan: se derivan del estado de cada solicitud y del
 * estado de su expediente. Así no puede existir una tarea huérfana ni una
 * solicitud atascada sin tarea que la reclame, que es exactamente el problema
 * que hoy tiene el reverso del formulario impreso cuando se llena de manera
 * irregular.
 *
 * El orden del trámite es el que fija el propio reverso, con un matiz que
 * impone SAFI: Contabilidad REVISA comprobando el ingreso en el CRM, así que su
 * tarea aparece cuando el Área de Socios ya creó al socio allá. Mientras tanto,
 * Contabilidad ve la afiliación en su lista «En camino», sin acción.
 *
 *   Registrada ──► [Socios] Crear en SAFI ──► [Contabilidad] Revisar ──► [Gerencia] Aprobar
 *                                                  │                          │
 *                                                  └──── Devolver ◄───────────┘
 *                                                         │
 *                                               [Socios] Reenviar o anular
 */

export const TIPOS_TAREA = [
  "REVISAR",
  "APROBAR",
  "CORREGIR_OBSERVACION",
  "CONFIRMAR_SAFI",
  "ADJUNTOS_PENDIENTES",
  "ESCANEO_PENDIENTE",
  "ESCANEO_NO_RECONOCIDO",
  "ESCANEO_EN_ESPERA",
  "FORMULARIO_FINAL_PENDIENTE",
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
    accion: "Atender y reenviar",
    exigeObservacion: true,
  },
  CONFIRMAR_SAFI: {
    etiqueta: "Falta crear al socio en SAFI",
    area: "SOCIOS",
    tono: "warning",
    accion: "Confirmar y crear en SAFI",
    exigeObservacion: false,
  },
  ADJUNTOS_PENDIENTES: {
    etiqueta: "Faltan archivos de la tableta",
    area: "SOCIOS",
    tono: "danger",
    accion: null,
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
  ESCANEO_EN_ESPERA: {
    etiqueta: "Archivo escaneado en espera de su trámite",
    area: "SOCIOS",
    tono: "warning",
    accion: null,
    exigeObservacion: false,
  },
  FORMULARIO_FINAL_PENDIENTE: {
    etiqueta: "Falta archivar el formulario final",
    area: "SOCIOS",
    tono: "danger",
    accion: "Generar el formulario final",
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
  /**
   * `RECHAZADO`: el archivo se apartó a `_REVISAR/` porque su nombre es
   * ambiguo o no corresponde al socio registrado.
   * `EN_ESPERA`: el nombre es correcto pero todavía no hay ningún trámite con
   * ese número; el archivo se queda donde está hasta que lo haya.
   */
  tipo?: "RECHAZADO" | "EN_ESPERA";
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
  /** Nombres exactos de archivo que la tarea pide, cuando aplica. */
  archivosEsperados?: string[];
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
    numeroSocio: numeroEnExpediente(solicitud) || "—",
    cedula: solicitud.datos.cedula,
    nombreSocio: nombreCompleto(solicitud.datos),
    tipoMiembro: nombreTipo(solicitud.datos.tipoMiembro),
  };
}

/** `280` o `280-1`: cómo aparece la persona en el repositorio, si ya tiene número. */
export function numeroEnExpediente(solicitud: SolicitudAfiliacion): string {
  const { numeroSocio, ordinalDependiente } = solicitud.tramite;
  if (!numeroSocio) return "";
  return ordinalDependiente === null || ordinalDependiente === undefined
    ? numeroSocio
    : `${numeroSocio}-${ordinalDependiente}`;
}

/** El socio ya existe en SAFI: o lo creó el sistema, o se registró el alta hecha a mano. */
export function creadoEnSafi(solicitud: SolicitudAfiliacion): boolean {
  return Boolean(solicitud.expediente.socioSafiId);
}

function listaDocumentos(tipos: TipoDocumento[]): string {
  return tipos.map(nombreDocumento).join(", ");
}

/** Nombres exactos con los que deben escanearse los documentos que faltan. */
export function nombresDeEscaneo(solicitud: SolicitudAfiliacion, tipos: TipoDocumento[]): string[] {
  const { numeroSocio, ordinalDependiente } = solicitud.tramite;
  if (!numeroSocio) return [];
  const clave = {
    numeroSocio,
    ordinalDependiente: ordinalDependiente ?? null,
    apellidosNombres: nombreCompleto(solicitud.datos),
  };
  return tipos.map((tipo) => nombreArchivo(clave, tipo, ".pdf"));
}

/** Tareas que genera una sola solicitud, en todas las áreas. */
export function tareasDeSolicitud(solicitud: SolicitudAfiliacion): Tarea[] {
  const tareas: Tarea[] = [];
  const base = baseDe(solicitud);
  const { tramite, expediente, estado } = solicitud;

  // Un trámite anulado no reclama nada a nadie.
  if (estado === "RECHAZADA" || estado === "BORRADOR") return tareas;

  // El alta en SAFI es lo primero que hace el Área de Socios tras registrar la
  // afiliación: Contabilidad revisa comprobando el ingreso en el CRM, así que
  // para entonces la ficha ya tiene que existir. La misma tarea recoge el
  // número de socio, sin el cual tampoco se puede nombrar la carpeta del
  // expediente.
  if (!creadoEnSafi(solicitud)) {
    const falta = !tramite.numeroSocio.trim()
      ? "Asigne el número de socio y confirme los campos de facturación y cuotas que SAFI guarda como listas cerradas."
      : "Falta confirmar los campos que SAFI guarda como listas cerradas y crear la ficha.";
    const cuenta = tieneCuentaPropia(solicitud.datos.tipoMiembro)
      ? "Se creará su Cuenta y su ficha de Socio."
      : "Es dependiente del titular: se creará solo su ficha de Socio, colgada de la Cuenta del titular.";

    tareas.push({
      ...base,
      id: `${solicitud.id}:SAFI_ALTA`,
      tipo: "CONFIRMAR_SAFI",
      area: "SOCIOS",
      titulo: `Crear en SAFI a ${base.nombreSocio}`,
      detalle: `${expediente.altaSafiMensaje ?? falta} ${cuenta} Contabilidad podrá revisarla en cuanto exista en el CRM.`,
      desde: tramite.registro?.en ?? solicitud.creadaEn,
    });
  }

  if (estado === "REGISTRADA" && creadoEnSafi(solicitud)) {
    tareas.push({
      ...base,
      id: `${solicitud.id}:REVISAR`,
      tipo: "REVISAR",
      area: "CONTABILIDAD",
      titulo: `Revisar la afiliación ${solicitud.codigo}`,
      detalle:
        "El socio ya consta en el CRM de SAFI. Compruebe el ingreso y, si esta afiliación genera comprobante, registre el número de factura.",
      desde: solicitud.actualizadaEn,
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
    const devolucion = tramite.devolucion;
    const quien = devolucion ? AREA_META[devolucion.area].etiqueta : "Otra área";
    tareas.push({
      ...base,
      id: `${solicitud.id}:CORREGIR`,
      tipo: "CORREGIR_OBSERVACION",
      area: "SOCIOS",
      titulo: `Atender la observación de ${solicitud.codigo}`,
      detalle: `${quien} la devolvió: «${devolucion?.observacion ?? "sin detalle registrado"}». Corrija lo necesario y reenvíela, o anule el trámite si no procede.`,
      desde: devolucion?.en ?? solicitud.actualizadaEn,
    });
  }

  // Sin la firma, el formulario no se puede componer; sin la fotografía, la
  // credencial no se puede emitir. La tableta los envía sola: si no llegan, es
  // que no pudo, y conviene saberlo aquí y no el día de la aprobación.
  const faltantes = adjuntosFaltantes(solicitud);
  if (faltantes.length > 0) {
    tareas.push({
      ...base,
      id: `${solicitud.id}:ADJUNTOS`,
      tipo: "ADJUNTOS_PENDIENTES",
      area: "SOCIOS",
      titulo: `Faltan archivos de la tableta para ${base.nombreSocio}`,
      detalle: `El servidor aún no recibió: ${faltantes
        .map((rol) => ROL_ADJUNTO_META[rol].etiqueta.toLowerCase())
        .join(", ")}. La tableta los envía sola al sincronizar; abra en ella «Configuración y envío» y pulse «Sincronizar ahora».`,
      desde: tramite.registro?.en ?? solicitud.creadaEn,
    });
  }

  // La lista de escaneos solo se pide cuando ya hay número: sin él no hay
  // nombre de archivo que la Jefatura pueda usar.
  if (expediente.escaneosPendientes.length > 0 && tramite.numeroSocio.trim()) {
    const nombres = nombresDeEscaneo(solicitud, expediente.escaneosPendientes);
    tareas.push({
      ...base,
      id: `${solicitud.id}:ESCANEO`,
      tipo: "ESCANEO_PENDIENTE",
      area: "SOCIOS",
      titulo: `Falta escanear documentación de ${base.nombreSocio}`,
      detalle: `Pendiente de depositar en la carpeta compartida: ${listaDocumentos(
        expediente.escaneosPendientes
      )}. Use exactamente estos nombres de archivo.`,
      archivosEsperados: nombres,
      desde: tramite.registro?.en ?? solicitud.creadaEn,
    });
  }

  if (estado === "APROBADA" && !expediente.formularioFinal) {
    tareas.push({
      ...base,
      id: `${solicitud.id}:FORMULARIO`,
      tipo: "FORMULARIO_FINAL_PENDIENTE",
      area: "SOCIOS",
      titulo: `Falta archivar el formulario final de ${base.nombreSocio}`,
      detalle:
        expediente.formularioFinalMensaje ??
        "El formulario final, con las tres constancias, todavía no se ha archivado en el expediente.",
      desde: tramite.aprobacion?.en ?? solicitud.actualizadaEn,
    });
  }

  // Solo tras la aprobación: antes de ella los documentos no se publican en
  // SAFI, para no dejar allí el expediente de una afiliación que no prospere.
  if (
    estado === "APROBADA" &&
    (expediente.safi === "ERROR" || (expediente.safi === "PENDIENTE" && expediente.safiMensaje))
  ) {
    tareas.push({
      ...base,
      id: `${solicitud.id}:SAFI`,
      tipo: "CARGA_SAFI_PENDIENTE",
      area: "SOCIOS",
      titulo: `Expediente de ${base.nombreSocio} sin cargar en SAFI`,
      detalle:
        expediente.safiMensaje ??
        "El expediente aún no se ha publicado en la sección Documentos de la Cuenta en el CRM de SAFI.",
      desde: expediente.safiActualizadoEn ?? solicitud.actualizadaEn,
    });
  }

  return tareas;
}

/** Tareas que generan los archivos que el repositorio no pudo clasificar. */
export function tareasDeIncidencias(incidencias: IncidenciaEscaneo[]): Tarea[] {
  return incidencias.map((incidencia) => {
    const enEspera = incidencia.tipo === "EN_ESPERA";
    return {
      id: `escaneo:${incidencia.id}`,
      tipo: enEspera ? ("ESCANEO_EN_ESPERA" as const) : ("ESCANEO_NO_RECONOCIDO" as const),
      area: "SOCIOS" as const,
      codigo: incidencia.archivo,
      titulo: enEspera
        ? `Archivo en espera: ${incidencia.archivo}`
        : `Archivo no reconocido: ${incidencia.archivo}`,
      detalle: incidencia.detalle || MOTIVO_RECHAZO_META[incidencia.motivo],
      numeroSocio: incidencia.numeroSocio ?? "—",
      cedula: "—",
      nombreSocio: "—",
      tipoMiembro: "—",
      desde: incidencia.detectadaEn,
    };
  });
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

/**
 * Afiliaciones que ya vienen hacia un área pero todavía no le toca actuar.
 *
 * Contabilidad ve las registradas que el Área de Socios aún no creó en SAFI; la
 * Gerencia, las que Contabilidad aún no revisó. Sin esta lista, un área con la
 * bandeja vacía no puede saber si es que no hay nada o si algo se atascó antes
 * de llegarle, que fue exactamente lo que ocurrió en las primeras pruebas.
 */
export function enCaminoHacia(area: Area, solicitudes: SolicitudAfiliacion[]): SolicitudAfiliacion[] {
  return solicitudes
    .filter((solicitud) => {
      switch (area) {
        case "CONTABILIDAD":
          return solicitud.estado === "REGISTRADA" && !creadoEnSafi(solicitud);
        case "GERENCIA":
          return solicitud.estado === "REGISTRADA" || solicitud.estado === "OBSERVADA";
        case "SOCIOS":
          return false;
      }
    })
    .sort((a, b) => a.creadaEn.localeCompare(b.creadaEn));
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
          return creadoEnSafi(solicitud) || solicitud.estado === "RECHAZADA";
      }
    })
    .sort((a, b) => b.actualizadaEn.localeCompare(a.actualizadaEn));
}

/** Etiqueta legible del área, para la interfaz web y la aplicación. */
export function etiquetaArea(area: Area): string {
  return AREA_META[area].etiqueta;
}
