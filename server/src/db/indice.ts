import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { config } from "../config";
import { ESQUEMA_SQL, INDICES_SQL, MIGRACIONES, VERSION_ESQUEMA } from "./esquema";

/**
 * Apertura de la base de datos.
 *
 * Se usa `node:sqlite`, incorporado en Node desde la versión 22.5, para no
 * arrastrar una dependencia nativa que obligaría a compilar en la imagen del
 * contenedor.
 */

let instancia: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (instancia) return instancia;

  fs.mkdirSync(path.dirname(config.baseDatos), { recursive: true });
  fs.mkdirSync(config.expedientesDir, { recursive: true });

  const conexion = new DatabaseSync(config.baseDatos);
  const esNueva = !conexion
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='solicitudes'")
    .get();

  // Orden deliberado: primero las tablas, luego las columnas que falten y solo
  // al final los índices, que dependen de que esas columnas existan.
  conexion.exec(ESQUEMA_SQL);
  migrar(conexion, esNueva);
  conexion.exec(INDICES_SQL);

  instancia = conexion;
  return conexion;
}

/**
 * Lleva una base existente a la versión actual del esquema.
 *
 * `CREATE TABLE IF NOT EXISTS` no altera una tabla que ya existe, así que las
 * columnas añadidas después de la primera puesta en producción tienen que
 * aplicarse aquí. Una base recién creada ya nace con el esquema completo.
 */
function migrar(conexion: DatabaseSync, esNueva: boolean): void {
  const fila = conexion
    .prepare("SELECT valor FROM meta WHERE clave = 'version_esquema'")
    .get() as { valor: string } | undefined;

  const actual = esNueva ? VERSION_ESQUEMA : Number(fila?.valor ?? 1);

  if (!fila) {
    conexion
      .prepare("INSERT INTO meta (clave, valor) VALUES ('version_esquema', ?)")
      .run(String(actual));
  }

  if (actual >= VERSION_ESQUEMA) return;

  for (const migracion of MIGRACIONES) {
    if (migracion.desde < actual) continue;
    try {
      conexion.exec(migracion.sql);
      console.log(`[base] Migración aplicada: esquema ${migracion.desde} → ${migracion.desde + 1}.`);
    } catch (error) {
      // Una migración ya aplicada a mano no debe impedir el arranque.
      console.warn(`[base] La migración desde ${migracion.desde} no se aplicó:`, error);
    }
  }

  conexion
    .prepare("UPDATE meta SET valor = ? WHERE clave = 'version_esquema'")
    .run(String(VERSION_ESQUEMA));
}

export function cerrar(): void {
  instancia?.close();
  instancia = null;
}

/** Identificador corto, único dentro del ámbito del servidor. */
export function nuevoId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ahora(): string {
  return new Date().toISOString();
}

/* ------------------------------------------------------------------ */
/* Bitácora                                                            */
/* ------------------------------------------------------------------ */

/**
 * Registra una actuación. La LOPDP exige poder acreditar quién accedió o
 * modificó los datos de un titular y cuándo; esta tabla es esa evidencia.
 */
export function registrarBitacora(entrada: {
  usuario?: string;
  area?: string;
  accion: string;
  entidad?: string;
  detalle?: string;
}): void {
  db()
    .prepare(
      "INSERT INTO bitacora (en, usuario, area, accion, entidad, detalle) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      ahora(),
      entrada.usuario ?? null,
      entrada.area ?? null,
      entrada.accion,
      entrada.entidad ?? null,
      entrada.detalle ?? null
    );
}
