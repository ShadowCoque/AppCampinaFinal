import { escaneosEsperados, type TipoDocumento } from "../../../src/domain/documentos";
import {
  ESQUEMA_SOLICITUD,
  expedienteVacio,
  identidadVacia,
  nombreCompleto,
  tramiteVacio,
  type Area,
  type ConfirmacionSafi,
  type ConstanciaTramite,
  type EstadoSolicitud,
  type SolicitudAfiliacion,
} from "../../../src/domain/solicitud";
import { tareasDeSolicitud } from "../../../src/domain/tareas";
import { normalizarNumeroSocio } from "../../../src/domain/texto";
import { ahora, db, nuevoId, registrarBitacora } from "./indice";

/**
 * Repositorio de solicitudes de afiliación.
 *
 * El documento completo viaja como JSON: es la misma estructura que produce la
 * aplicación móvil, sin traducción intermedia. Las columnas sueltas replican
 * los campos por los que hace falta consultar u ordenar.
 */

type FilaSolicitud = { documento: string };

/**
 * Lee el documento almacenado y lo pone al día con el esquema vigente.
 *
 * Los trámites guardados por una versión anterior conservan la forma que tenían
 * al escribirse, y aquí se completa lo que falte. Sin esto, un expediente
 * antiguo abierto con el código nuevo mostraría campos en blanco en lugar de su
 * contenido, que es peor que un error: parece un dato que nunca se capturó.
 *
 *   Esquema 5 → 6  El nombre del socio titular pasó a guardarse en dos campos,
 *                  apellidos y nombres, porque SAFI los usa en dos órdenes
 *                  distintos. El valor antiguo se conserva entero en el de
 *                  apellidos: partirlo por la mitad escribiría un nombre
 *                  equivocado en el CRM.
 *
 * No reescribe la fila: la normalización se persiste sola la próxima vez que el
 * trámite se guarde por cualquier otro motivo.
 */
function aSolicitud(fila: FilaSolicitud): SolicitudAfiliacion {
  const guardada = JSON.parse(fila.documento) as SolicitudAfiliacion;
  if (guardada.esquema >= ESQUEMA_SOLICITUD) return guardada;

  const datos = guardada.datos as typeof guardada.datos & { titularNombre?: string };

  return {
    ...guardada,
    esquema: ESQUEMA_SOLICITUD,
    datos: {
      ...datos,
      titularApellidos: datos.titularApellidos ?? datos.titularNombre ?? "",
      titularNombres: datos.titularNombres ?? "",
      provincia: datos.provincia ?? "",
    },
    tramite: { ...tramiteVacio(), ...guardada.tramite },
    expediente: { ...expedienteVacio(), ...guardada.expediente },
  };
}

function guardarDocumento(solicitud: SolicitudAfiliacion): void {
  // La marca la calcula el mismo dominio que dibuja las bandejas, de modo que
  // no puedan discrepar: si genera alguna tarea, la solicitud sigue viva.
  const requiereAtencion = tareasDeSolicitud(solicitud).length > 0 ? 1 : 0;

  db()
    .prepare(
      `INSERT INTO solicitudes
         (id, codigo, estado, numero_socio, cedula, nombre, tipo_miembro, creada_en,
          actualizada_en, documento, requiere_atencion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         codigo = excluded.codigo,
         estado = excluded.estado,
         numero_socio = excluded.numero_socio,
         cedula = excluded.cedula,
         nombre = excluded.nombre,
         tipo_miembro = excluded.tipo_miembro,
         actualizada_en = excluded.actualizada_en,
         documento = excluded.documento,
         requiere_atencion = excluded.requiere_atencion`
    )
    .run(
      solicitud.id,
      solicitud.codigo,
      solicitud.estado,
      solicitud.tramite.numeroSocio || null,
      solicitud.datos.cedula,
      nombreCompleto(solicitud.datos),
      solicitud.datos.tipoMiembro,
      solicitud.creadaEn,
      solicitud.actualizadaEn,
      JSON.stringify(solicitud),
      requiereAtencion
    );
}

export function listarSolicitudes(filtro?: {
  estado?: EstadoSolicitud;
  limite?: number;
}): SolicitudAfiliacion[] {
  const limite = filtro?.limite ?? 500;

  const filas = filtro?.estado
    ? (db()
        .prepare(
          "SELECT documento FROM solicitudes WHERE estado = ? ORDER BY creada_en DESC LIMIT ?"
        )
        .all(filtro.estado, limite) as unknown as FilaSolicitud[])
    : (db()
        .prepare("SELECT documento FROM solicitudes ORDER BY creada_en DESC LIMIT ?")
        .all(limite) as unknown as FilaSolicitud[]);
  return filas.map(aSolicitud);
}

/**
 * Solicitudes que hoy generan alguna tarea.
 *
 * La bandeja se recarga sola cada minuto en tres equipos. Recorrer el histórico
 * completo en cada recarga funciona el primer año y deja de funcionar al
 * quinto; con esta consulta el trabajo depende de lo que está pendiente, no de
 * lo que ya se resolvió.
 */
export function solicitudesConTareas(): SolicitudAfiliacion[] {
  const filas = db()
    .prepare(
      "SELECT documento FROM solicitudes WHERE requiere_atencion = 1 ORDER BY creada_en ASC"
    )
    .all() as unknown as FilaSolicitud[];
  return filas.map(aSolicitud);
}

/** Últimas solicitudes actualizadas, para la lista de tareas ya atendidas. */
export function solicitudesRecientes(limite = 300): SolicitudAfiliacion[] {
  const filas = db()
    .prepare("SELECT documento FROM solicitudes ORDER BY actualizada_en DESC LIMIT ?")
    .all(limite) as unknown as FilaSolicitud[];
  return filas.map(aSolicitud);
}

/**
 * Recalcula la marca de atención de todas las solicitudes. Se ejecuta al
 * arrancar tras una migración, cuando la columna aún trae el valor por defecto.
 */
export function recalcularAtencion(): number {
  const filas = db().prepare("SELECT documento FROM solicitudes").all() as unknown as FilaSolicitud[];
  const sentencia = db().prepare("UPDATE solicitudes SET requiere_atencion = ? WHERE id = ?");

  let cambiadas = 0;
  for (const fila of filas) {
    const solicitud = aSolicitud(fila);
    sentencia.run(tareasDeSolicitud(solicitud).length > 0 ? 1 : 0, solicitud.id);
    cambiadas += 1;
  }
  return cambiadas;
}

export function obtenerSolicitud(id: string): SolicitudAfiliacion | null {
  const fila = db()
    .prepare("SELECT documento FROM solicitudes WHERE id = ?")
    .get(id) as unknown as FilaSolicitud | undefined;
  return fila ? aSolicitud(fila) : null;
}

/** Busca la solicitud de un socio por su número, para clasificar un escaneo. */
export function solicitudPorNumeroSocio(numeroSocio: string): SolicitudAfiliacion | null {
  const fila = db()
    .prepare("SELECT documento FROM solicitudes WHERE numero_socio = ? ORDER BY creada_en DESC LIMIT 1")
    .get(normalizarNumeroSocio(numeroSocio)) as unknown as FilaSolicitud | undefined;
  return fila ? aSolicitud(fila) : null;
}

/** Código legible del trámite: `AF-2026-0007`. */
export function siguienteCodigo(): string {
  const anio = new Date().getFullYear();
  const prefijo = `AF-${anio}-`;
  const fila = db()
    .prepare("SELECT codigo FROM solicitudes WHERE codigo LIKE ? ORDER BY codigo DESC LIMIT 1")
    .get(`${prefijo}%`) as { codigo: string } | undefined;

  const ultimo = fila ? Number(fila.codigo.slice(prefijo.length)) : 0;
  const siguiente = Number.isFinite(ultimo) ? ultimo + 1 : 1;
  return `${prefijo}${String(siguiente).padStart(4, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Registro y avance del trámite                                       */
/* ------------------------------------------------------------------ */

/**
 * Construye la solicitud que se va a almacenar a partir de lo que envió la
 * tableta.
 *
 * De la petición se acepta ÚNICAMENTE lo que el solicitante llenó: sus datos,
 * su firma, su consentimiento y la trazabilidad de la identidad. Todo lo demás
 * —el estado, el código del trámite y, sobre todo, las constancias del reverso—
 * lo construye el servidor.
 *
 * El motivo es directo: si se aceptara el `tramite` que manda el cliente, una
 * afiliación podría llegar declarando que Contabilidad ya la revisó y que la
 * Gerencia ya la aprobó, y el formulario se imprimiría con el nombre de esas
 * personas sin que hubieran intervenido. La constancia de quién revisó y quién
 * aprobó es justamente lo que el sistema existe para acreditar.
 */
function depurarEntrante(
  entrante: SolicitudAfiliacion,
  actor: { nombre: string },
  momento: string
): SolicitudAfiliacion {
  return {
    id: entrante.id,
    codigo: "",
    esquema: ESQUEMA_SOLICITUD,
    estado: "REGISTRADA",
    creadaEn: entrante.creadaEn || momento,
    actualizadaEn: momento,
    datos: entrante.datos,
    documentos: entrante.documentos ?? [],
    firmaUri: entrante.firmaUri ?? null,
    modoFirma: entrante.modoFirma ?? "MANUSCRITA_EN_PANTALLA",
    identidad: entrante.identidad ?? identidadVacia(),
    consentimiento: entrante.consentimiento ?? null,
    tramite: {
      ...tramiteVacio(),
      fechaRegistro: momento.slice(0, 10),
      registro: { area: "SOCIOS", responsable: actor.nombre, en: momento, observacion: "" },
    },
    expediente: {
      ...expedienteVacio(),
      escaneosPendientes: escaneosEsperados(entrante.datos.tipoMiembro),
    },
    historial: [],
  };
}

/** Se lanza cuando la tableta reenvía una afiliación que el servidor ya tiene. */
export class SolicitudYaRegistrada extends Error {
  constructor(readonly existente: SolicitudAfiliacion) {
    super(`La solicitud ${existente.codigo} ya estaba registrada.`);
    this.name = "SolicitudYaRegistrada";
  }
}

export function registrarSolicitud(
  solicitud: SolicitudAfiliacion,
  actor: { usuario: string; area: Area; nombre: string }
): SolicitudAfiliacion {
  const momento = ahora();

  // Idempotencia: la tableta reintenta cuando una respuesta se pierde. Si el
  // identificador ya existe, se devuelve lo almacenado en lugar de sobrescribir
  // un expediente que quizá ya fue revisado y aprobado.
  if (solicitud.id) {
    const existente = obtenerSolicitud(solicitud.id);
    if (existente) throw new SolicitudYaRegistrada(existente);
  }

  const base = depurarEntrante(solicitud, actor, momento);

  const registrada: SolicitudAfiliacion = {
    ...base,
    id: base.id || nuevoId(),
    codigo: siguienteCodigo(),
    historial: [
      {
        en: momento,
        estado: "REGISTRADA",
        area: "SOCIOS",
        responsable: actor.nombre,
        nota: "Afiliación registrada desde la aplicación.",
      },
    ],
  };

  guardarDocumento(registrada);
  registrarBitacora({
    usuario: actor.usuario,
    area: actor.area,
    accion: "REGISTRAR_AFILIACION",
    entidad: registrada.codigo,
    detalle: `${nombreCompleto(registrada.datos)} · ${registrada.datos.cedula}`,
  });

  return registrada;
}

export type AvanceTramite = {
  estado: EstadoSolicitud;
  constancia: ConstanciaTramite & { numeroFactura?: string };
  /** Números que el Área de Socios asigna al crear el socio en el CRM. */
  numeroSocio?: string;
  numeroTarjeta?: string;
};

/**
 * Aplica una constancia del reverso del formulario (REVISADO por Contabilidad,
 * APROBADO por la Gerencia, u observación que devuelve el trámite) y devuelve
 * la solicitud actualizada.
 */
export function avanzarTramite(
  id: string,
  avance: AvanceTramite,
  actor: { usuario: string; area: Area }
): SolicitudAfiliacion | null {
  const actual = obtenerSolicitud(id);
  if (!actual) return null;

  const momento = avance.constancia.en || ahora();
  const tramite = { ...actual.tramite };

  if (avance.numeroSocio !== undefined) {
    tramite.numeroSocio = normalizarNumeroSocio(avance.numeroSocio);
  }
  if (avance.numeroTarjeta !== undefined) {
    tramite.numeroTarjeta = avance.numeroTarjeta.trim();
  }

  switch (avance.constancia.area) {
    case "CONTABILIDAD":
      tramite.revision = {
        area: "CONTABILIDAD",
        responsable: avance.constancia.responsable,
        en: momento,
        observacion: avance.constancia.observacion,
        numeroFactura: avance.constancia.numeroFactura ?? "",
      };
      break;
    case "GERENCIA":
      tramite.aprobacion = {
        area: "GERENCIA",
        responsable: avance.constancia.responsable,
        en: momento,
        observacion: avance.constancia.observacion,
      };
      break;
    case "SOCIOS":
      tramite.registro = {
        area: "SOCIOS",
        responsable: avance.constancia.responsable,
        en: momento,
        observacion: avance.constancia.observacion,
      };
      break;
  }

  const actualizada: SolicitudAfiliacion = {
    ...actual,
    estado: avance.estado,
    actualizadaEn: momento,
    tramite,
    historial: [
      ...actual.historial,
      {
        en: momento,
        estado: avance.estado,
        area: avance.constancia.area,
        responsable: avance.constancia.responsable,
        nota: avance.constancia.observacion || undefined,
      },
    ],
  };

  guardarDocumento(actualizada);
  registrarBitacora({
    usuario: actor.usuario,
    area: actor.area,
    accion: `TRAMITE_${avance.estado}`,
    entidad: actualizada.codigo,
    detalle: avance.constancia.observacion || undefined,
  });

  return actualizada;
}

/**
 * Guarda lo que la Jefatura de Socios confirmó y el resultado del alta en SAFI.
 *
 * Va en una sola escritura porque los tres datos son inseparables: el número de
 * socio da nombre a la carpeta del expediente, la confirmación deja constancia
 * de qué valores se acordaron, y los identificadores de SAFI son los que
 * permiten colgar después los documentos de la Cuenta correcta. Guardarlos por
 * separado abriría la puerta a un expediente con número pero sin Cuenta, que es
 * justo el estado en el que nada se puede archivar.
 */
export function guardarAltaSafi(
  id: string,
  alta: {
    numeroSocio: string;
    ordinalDependiente: number | null;
    confirmacion: ConfirmacionSafi;
    cuentaSafiId?: string | null;
    socioSafiId?: string | null;
    mensaje?: string;
  },
  actor: { usuario: string; area: Area }
): SolicitudAfiliacion | null {
  const actual = obtenerSolicitud(id);
  if (!actual) return null;

  const momento = ahora();

  const actualizada: SolicitudAfiliacion = {
    ...actual,
    actualizadaEn: momento,
    tramite: {
      ...actual.tramite,
      numeroSocio: normalizarNumeroSocio(alta.numeroSocio),
      ordinalDependiente: alta.ordinalDependiente,
    },
    expediente: {
      ...actual.expediente,
      confirmacionSafi: alta.confirmacion,
      cuentaSafiId: alta.cuentaSafiId ?? actual.expediente.cuentaSafiId ?? null,
      socioSafiId: alta.socioSafiId ?? actual.expediente.socioSafiId ?? null,
      altaSafiMensaje: alta.mensaje,
    },
    historial: [
      ...actual.historial,
      {
        en: momento,
        estado: actual.estado,
        area: "SOCIOS",
        responsable: alta.confirmacion.confirmadaPor,
        nota: alta.socioSafiId
          ? `Socio creado en SAFI (Cuenta ${alta.cuentaSafiId}, Socio ${alta.socioSafiId}).`
          : alta.mensaje ?? "Datos de SAFI confirmados.",
      },
    ],
  };

  guardarDocumento(actualizada);
  registrarBitacora({
    usuario: actor.usuario,
    area: actor.area,
    accion: alta.socioSafiId ? "SAFI_ALTA_CREADA" : "SAFI_ALTA_CONFIRMADA",
    entidad: actualizada.codigo,
    detalle: alta.socioSafiId
      ? `Cuenta ${alta.cuentaSafiId} · Socio ${alta.socioSafiId}`
      : alta.mensaje,
  });

  return actualizada;
}

/**
 * Cuenta de SAFI del socio titular al que se cuelga un dependiente. La comparte
 * toda la familia, igual que la carpeta del repositorio digital.
 */
export function cuentaSafiDelTitular(numeroSocioTitular: string): string | null {
  const titular = solicitudPorNumeroSocio(numeroSocioTitular);
  return titular?.expediente.cuentaSafiId ?? null;
}

/**
 * Siguiente ordinal libre dentro de la cuenta de un titular.
 *
 * El titular es siempre el `00`, así que sus dependientes empiezan en 1. Se
 * mira lo ya registrado para no repetir un número que dejaría dos fichas
 * distintas con la misma Secuencia en SAFI.
 */
export function siguienteOrdinalDependiente(numeroSocioTitular: string): number {
  const filas = db()
    .prepare("SELECT documento FROM solicitudes WHERE numero_socio = ?")
    .all(normalizarNumeroSocio(numeroSocioTitular)) as unknown as FilaSolicitud[];

  const usados = filas
    .map((fila) => aSolicitud(fila).tramite.ordinalDependiente)
    .filter((ordinal): ordinal is number => typeof ordinal === "number");

  return usados.length === 0 ? 1 : Math.max(...usados) + 1;
}

/** Actualiza el estado del expediente tras archivar o publicar documentos. */
export function actualizarExpediente(
  id: string,
  cambios: Partial<SolicitudAfiliacion["expediente"]>
): SolicitudAfiliacion | null {
  const actual = obtenerSolicitud(id);
  if (!actual) return null;

  const actualizada: SolicitudAfiliacion = {
    ...actual,
    actualizadaEn: ahora(),
    expediente: { ...actual.expediente, ...cambios },
  };

  guardarDocumento(actualizada);
  return actualizada;
}

/**
 * Descuenta de la lista de escaneos pendientes el documento que acaba de
 * llegar a la carpeta compartida.
 */
export function marcarEscaneoRecibido(
  solicitudId: string,
  tipo: TipoDocumento
): SolicitudAfiliacion | null {
  const actual = obtenerSolicitud(solicitudId);
  if (!actual) return null;

  const pendientes = actual.expediente.escaneosPendientes.filter((t) => t !== tipo);
  if (pendientes.length === actual.expediente.escaneosPendientes.length) return actual;

  return actualizarExpediente(solicitudId, { escaneosPendientes: pendientes });
}
