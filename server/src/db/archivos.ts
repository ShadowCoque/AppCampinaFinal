import type { TipoDocumento } from "../../../src/domain/documentos";
import type { ClaveExpediente } from "../../../src/domain/expediente";
import type { EstadoSincronizacion } from "../../../src/domain/solicitud";
import { ahora, db, nuevoId } from "./indice";

/** Un documento del repositorio digital. */
export type ArchivoExpediente = {
  id: string;
  solicitudId: string | null;
  numeroSocio: string;
  ordinalDependiente: number | null;
  nombrePersona: string;
  tipoDocumento: TipoDocumento;
  nombreArchivo: string;
  ruta: string;
  bytes: number;
  origen: "APP" | "ESCANEO";
  registradoEn: string;
  safiEstado: EstadoSincronizacion;
  safiMensaje: string | null;
  safiActualizadoEn: string | null;
  safiIntentos: number;
};

type Fila = {
  id: string;
  solicitud_id: string | null;
  numero_socio: string;
  ordinal_dependiente: number | null;
  nombre_persona: string;
  tipo_documento: string;
  nombre_archivo: string;
  ruta: string;
  bytes: number;
  origen: string;
  registrado_en: string;
  safi_estado: string;
  safi_mensaje: string | null;
  safi_actualizado_en: string | null;
  safi_intentos: number;
};

function aArchivo(fila: Fila): ArchivoExpediente {
  return {
    id: fila.id,
    solicitudId: fila.solicitud_id,
    numeroSocio: fila.numero_socio,
    ordinalDependiente: fila.ordinal_dependiente,
    nombrePersona: fila.nombre_persona,
    tipoDocumento: fila.tipo_documento as TipoDocumento,
    nombreArchivo: fila.nombre_archivo,
    ruta: fila.ruta,
    bytes: fila.bytes,
    origen: fila.origen as "APP" | "ESCANEO",
    registradoEn: fila.registrado_en,
    safiEstado: fila.safi_estado as EstadoSincronizacion,
    safiMensaje: fila.safi_mensaje,
    safiActualizadoEn: fila.safi_actualizado_en,
    safiIntentos: fila.safi_intentos,
  };
}

export function registrarArchivo(entrada: {
  solicitudId: string | null;
  clave: ClaveExpediente;
  tipoDocumento: TipoDocumento;
  nombreArchivo: string;
  ruta: string;
  bytes: number;
  origen: "APP" | "ESCANEO";
}): ArchivoExpediente {
  const id = nuevoId();
  const momento = ahora();

  // Un mismo documento puede volver a depositarse (una cédula reescaneada);
  // la ruta es única y la nueva versión sustituye a la anterior, que ya fue
  // reemplazada en disco.
  db()
    .prepare(
      `INSERT INTO archivos
         (id, solicitud_id, numero_socio, ordinal_dependiente, nombre_persona, tipo_documento,
          nombre_archivo, ruta, bytes, origen, registrado_en, safi_estado, safi_intentos)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', 0)
       ON CONFLICT(ruta) DO UPDATE SET
         solicitud_id = excluded.solicitud_id,
         nombre_persona = excluded.nombre_persona,
         tipo_documento = excluded.tipo_documento,
         bytes = excluded.bytes,
         registrado_en = excluded.registrado_en,
         safi_estado = 'PENDIENTE',
         safi_mensaje = NULL,
         safi_intentos = 0`
    )
    .run(
      id,
      entrada.solicitudId,
      entrada.clave.numeroSocio,
      entrada.clave.ordinalDependiente,
      entrada.clave.apellidosNombres,
      entrada.tipoDocumento,
      entrada.nombreArchivo,
      entrada.ruta,
      entrada.bytes,
      entrada.origen,
      momento
    );

  return porRuta(entrada.ruta)!;
}

export function porId(id: string): ArchivoExpediente | null {
  const fila = db().prepare("SELECT * FROM archivos WHERE id = ?").get(id) as unknown as
    | Fila
    | undefined;
  return fila ? aArchivo(fila) : null;
}

export function porRuta(ruta: string): ArchivoExpediente | null {
  const fila = db().prepare("SELECT * FROM archivos WHERE ruta = ?").get(ruta) as unknown as
    | Fila
    | undefined;
  return fila ? aArchivo(fila) : null;
}

export function archivosDeSocio(numeroSocio: string): ArchivoExpediente[] {
  const filas = db()
    .prepare(
      "SELECT * FROM archivos WHERE numero_socio = ? ORDER BY ordinal_dependiente NULLS FIRST, registrado_en"
    )
    .all(numeroSocio) as unknown as Fila[];
  return filas.map(aArchivo);
}

export function archivosDeSolicitud(solicitudId: string): ArchivoExpediente[] {
  const filas = db()
    .prepare("SELECT * FROM archivos WHERE solicitud_id = ? ORDER BY registrado_en")
    .all(solicitudId) as unknown as Fila[];
  return filas.map(aArchivo);
}

/** Cola de publicación en el CRM de SAFI, en orden de llegada. */
export function pendientesDeSafi(limite = 20): ArchivoExpediente[] {
  const filas = db()
    .prepare(
      `SELECT * FROM archivos
       WHERE safi_estado IN ('PENDIENTE','ERROR') AND safi_intentos < 5
       ORDER BY registrado_en LIMIT ?`
    )
    .all(limite) as unknown as Fila[];
  return filas.map(aArchivo);
}

export function marcarSafi(
  id: string,
  estado: EstadoSincronizacion,
  mensaje?: string
): void {
  db()
    .prepare(
      `UPDATE archivos
       SET safi_estado = ?, safi_mensaje = ?, safi_actualizado_en = ?,
           safi_intentos = safi_intentos + CASE WHEN ? = 'ERROR' THEN 1 ELSE 0 END
       WHERE id = ?`
    )
    .run(estado, mensaje ?? null, ahora(), estado, id);
}

/* ------------------------------------------------------------------ */
/* Incidencias de escaneo                                              */
/* ------------------------------------------------------------------ */

export type Incidencia = {
  id: string;
  archivo: string;
  motivo: string;
  detalle: string;
  numeroSocio: string | null;
  detectadaEn: string;
  resueltaEn: string | null;
};

type FilaIncidencia = {
  id: string;
  archivo: string;
  motivo: string;
  detalle: string;
  numero_socio: string | null;
  detectada_en: string;
  resuelta_en: string | null;
};

export function registrarIncidencia(entrada: {
  archivo: string;
  motivo: string;
  detalle: string;
  numeroSocio?: string;
}): void {
  const abierta = db()
    .prepare("SELECT id FROM incidencias WHERE archivo = ? AND resuelta_en IS NULL")
    .get(entrada.archivo);
  if (abierta) return;

  db()
    .prepare(
      `INSERT INTO incidencias (id, archivo, motivo, detalle, numero_socio, detectada_en)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(nuevoId(), entrada.archivo, entrada.motivo, entrada.detalle, entrada.numeroSocio ?? null, ahora());
}

export function incidenciasAbiertas(): Incidencia[] {
  const filas = db()
    .prepare("SELECT * FROM incidencias WHERE resuelta_en IS NULL ORDER BY detectada_en")
    .all() as unknown as FilaIncidencia[];
  return filas.map((f) => ({
    id: f.id,
    archivo: f.archivo,
    motivo: f.motivo,
    detalle: f.detalle,
    numeroSocio: f.numero_socio,
    detectadaEn: f.detectada_en,
    resueltaEn: f.resuelta_en,
  }));
}

/** Cierra la incidencia cuando el archivo desaparece o se renombra bien. */
export function resolverIncidencia(archivo: string): void {
  db()
    .prepare("UPDATE incidencias SET resuelta_en = ? WHERE archivo = ? AND resuelta_en IS NULL")
    .run(ahora(), archivo);
}
