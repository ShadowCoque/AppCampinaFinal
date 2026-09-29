import type { ConfirmacionSafi, DatosAfiliacion } from "../../../src/domain/solicitud";
import { ahora, db, nuevoId } from "../db/indice";
import type { ClaveColumna } from "./columnas";
import type { CeldaLeida } from "./excel";

/**
 * Lotes de la importación de socios oficiales desde Excel.
 *
 * Un lote es un archivo subido: sus filas tal como se leyeron, lo que el
 * sistema entendió de cada una, lo que dijo SAFI al revisarlas y lo que se
 * creó. Se guarda entero, como JSON, en la tabla `importaciones`; así el
 * resultado de un octubre se puede volver a consultar —y descargar— meses
 * después, y un lote detenido a medias se retoma sin volver a subir nada.
 */

export type EstadoLote =
  /** Revisado: se puede crear en SAFI, volver a comprobar o descartar. */
  | "REVISADO"
  /** Creándose en SAFI, fila por fila. */
  | "EN_CURSO"
  /** Se detuvo antes de terminar: a pedido de la Jefatura o por un fallo. */
  | "DETENIDO"
  /** Se recorrió entero. Puede tener filas con errores que no se crearon. */
  | "TERMINADO"
  /** Descartado sin crear nada. */
  | "DESCARTADO";

export type EstadoFila =
  /** No se puede crear: datos incompletos o que SAFI ya tiene. */
  | "ERROR"
  /** Lista para crear. */
  | "LISTA"
  /** Creándose en este momento. */
  | "EN_CURSO"
  | "CREADA"
  /** SAFI la rechazó al crear, o se cortó: se puede reintentar. */
  | "FALLIDA";

export type MensajeFila = { columna?: ClaveColumna; texto: string };

export type FilaImportacion = {
  /** Fila de la hoja de Excel, la que ve la Jefatura. */
  fila: number;
  /** Lo que se leyó de cada celda, para volver a interpretarla. */
  celdas: Partial<Record<ClaveColumna, CeldaLeida>>;
  estado: EstadoFila;
  /** Número de socio con el que se creará. Vacío si no hay. */
  numero: string;
  /** El número lo asignó el sistema («a partir del …»), no venía en el archivo. */
  numeroAsignado: boolean;
  datos: DatosAfiliacion;
  confirmacion: ConfirmacionSafi;
  /** «Acepta comunicaciones por correo»: decide el «No Enviar Email» de SAFI. */
  comunicaciones: boolean;
  errores: MensajeFila[];
  avisos: MensajeFila[];
  /**
   * Cuenta que quedó creada en un intento que falló después: el reintento la
   * reutiliza en lugar de crear otra.
   */
  cuentaSafiId?: string | null;
  resultado?: {
    en: string;
    cuentaSafiId?: string;
    socioSafiId?: string;
    /** La ficha que SAFI crea sola con la Cuenta: si se completó o quedó sobrando. */
    fichaAutomatica?: { id: string; completada: boolean; motivo?: string };
    mensaje?: string;
  };
};

export type MensajeLote = { tono: "info" | "aviso" | "error"; texto: string };

export type LoteImportacion = {
  id: string;
  codigo: string;
  estado: EstadoLote;
  archivo: { nombre: string; bytes: number; huella: string; hoja: string };
  creadaEn: string;
  creadaPor: { usuario: string; nombre: string };
  actualizadaEn: string;
  /** Desde qué número se asignan los de las filas que no traen el suyo. */
  numerarDesde: string;
  /** Si la última revisión pudo consultar SAFI. */
  consultadoEnSafi: boolean;
  revisadoEn: string;
  mensajes: MensajeLote[];
  filas: FilaImportacion[];
  proceso?: {
    iniciadoEn: string;
    iniciadoPor: string;
    terminadoEn?: string;
    /** Quién pidió detenerlo, si alguien lo pidió. */
    detenidoPor?: string;
    /** Por qué se detuvo o cómo terminó, en una frase para la bandeja. */
    motivo?: string;
  };
};

type FilaTabla = { documento: string };

/** Código legible del lote: `IMP-2026-0001`. */
function siguienteCodigo(): string {
  const prefijo = `IMP-${new Date().getFullYear()}-`;
  const fila = db()
    .prepare("SELECT codigo FROM importaciones WHERE codigo LIKE ? ORDER BY codigo DESC LIMIT 1")
    .get(`${prefijo}%`) as { codigo: string } | undefined;
  const ultimo = fila ? Number(fila.codigo.slice(prefijo.length)) : 0;
  return `${prefijo}${String((Number.isFinite(ultimo) ? ultimo : 0) + 1).padStart(4, "0")}`;
}

export function crearLote(
  lote: Omit<LoteImportacion, "id" | "codigo" | "creadaEn" | "actualizadaEn">
): LoteImportacion {
  const completo: LoteImportacion = {
    ...lote,
    id: nuevoId(),
    codigo: siguienteCodigo(),
    creadaEn: ahora(),
    actualizadaEn: ahora(),
  };
  db()
    .prepare(
      `INSERT INTO importaciones (id, codigo, estado, archivo, huella, creada_por, creada_en, actualizada_en, documento)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      completo.id,
      completo.codigo,
      completo.estado,
      completo.archivo.nombre,
      completo.archivo.huella,
      completo.creadaPor.usuario,
      completo.creadaEn,
      completo.actualizadaEn,
      JSON.stringify(completo)
    );
  return completo;
}

/** Guarda el lote tal como está. Se llama después de cada fila creada. */
export function guardarLote(lote: LoteImportacion): LoteImportacion {
  lote.actualizadaEn = ahora();
  db()
    .prepare("UPDATE importaciones SET estado = ?, actualizada_en = ?, documento = ? WHERE id = ?")
    .run(lote.estado, lote.actualizadaEn, JSON.stringify(lote), lote.id);
  return lote;
}

export function obtenerLote(id: string): LoteImportacion | null {
  const fila = db().prepare("SELECT documento FROM importaciones WHERE id = ?").get(id) as
    | FilaTabla
    | undefined;
  return fila ? (JSON.parse(fila.documento) as LoteImportacion) : null;
}

export function lotesRecientes(limite = 20): LoteImportacion[] {
  const filas = db()
    .prepare("SELECT documento FROM importaciones ORDER BY creada_en DESC LIMIT ?")
    .all(limite) as unknown as FilaTabla[];
  return filas.map((fila) => JSON.parse(fila.documento) as LoteImportacion);
}

export function lotesEnCurso(): LoteImportacion[] {
  const filas = db()
    .prepare("SELECT documento FROM importaciones WHERE estado = 'EN_CURSO'")
    .all() as unknown as FilaTabla[];
  return filas.map((fila) => JSON.parse(fila.documento) as LoteImportacion);
}

/** Otro lote, no descartado, subido con el mismo archivo. */
export function loteConHuella(huella: string): { codigo: string; creadaEn: string } | null {
  const fila = db()
    .prepare(
      "SELECT codigo, creada_en FROM importaciones WHERE huella = ? AND estado != 'DESCARTADO' ORDER BY creada_en DESC LIMIT 1"
    )
    .get(huella) as { codigo: string; creada_en: string } | undefined;
  return fila ? { codigo: fila.codigo, creadaEn: fila.creada_en } : null;
}

/**
 * Trámites de la tableta con esas cédulas que siguen vivos (no anulados): una
 * persona que ya se está afiliando por la tableta no se importa otra vez.
 */
export function tramitesConCedulas(cedulas: string[]): Map<string, { codigo: string; estado: string }> {
  const resultado = new Map<string, { codigo: string; estado: string }>();
  const unicas = [...new Set(cedulas.filter((c) => /^\d{10}$/.test(c)))];
  for (let i = 0; i < unicas.length; i += 200) {
    const grupo = unicas.slice(i, i + 200);
    const filas = db()
      .prepare(
        `SELECT cedula, codigo, estado FROM solicitudes
         WHERE cedula IN (${grupo.map(() => "?").join(",")}) AND estado != 'RECHAZADA'`
      )
      .all(...grupo) as { cedula: string; codigo: string; estado: string }[];
    for (const fila of filas) resultado.set(fila.cedula, { codigo: fila.codigo, estado: fila.estado });
  }
  return resultado;
}

/** Números de socio que ya usa algún trámite del sistema. */
export function numerosEnTramites(numeros: string[]): Set<string> {
  const unicos = [...new Set(numeros.filter((n) => /^\d+$/.test(n)))];
  const usados = new Set<string>();
  for (let i = 0; i < unicos.length; i += 200) {
    const grupo = unicos.slice(i, i + 200);
    const filas = db()
      .prepare(`SELECT DISTINCT numero_socio FROM solicitudes WHERE numero_socio IN (${grupo.map(() => "?").join(",")})`)
      .all(...grupo) as { numero_socio: string }[];
    for (const fila of filas) usados.add(fila.numero_socio);
  }
  return usados;
}
