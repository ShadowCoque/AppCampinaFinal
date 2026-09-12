import crypto from "node:crypto";

import type { Area } from "../../../src/domain/solicitud";
import { ahora, db, nuevoId } from "./indice";

/**
 * Usuarios y sesiones.
 *
 * Cada área tiene su propio usuario y solo ve su bandeja. Las contraseñas se
 * guardan con `scrypt` y una sal por usuario; nunca en claro y nunca
 * reversibles. La comparación es de tiempo constante para no filtrar
 * información por la duración de la respuesta.
 */

export type Usuario = {
  id: string;
  usuario: string;
  nombre: string;
  area: Area;
  activo: boolean;
};

type FilaUsuario = {
  id: string;
  usuario: string;
  nombre: string;
  area: Area;
  clave_hash: string;
  clave_sal: string;
  activo: number;
};

const LONGITUD_HASH = 64;

/**
 * Longitud mínima de la contraseña. Los usuarios son tres y las contraseñas las
 * genera la utilidad de línea de comandos, así que exigir una longitud
 * razonable no incomoda a nadie y descarta las obvias.
 */
export const LONGITUD_MINIMA_CLAVE = 10;

export class ClaveDemasiadoCorta extends Error {
  constructor() {
    super(`La contraseña debe tener al menos ${LONGITUD_MINIMA_CLAVE} caracteres.`);
    this.name = "ClaveDemasiadoCorta";
  }
}

export class UsuarioDuplicado extends Error {
  constructor(usuario: string) {
    super(`Ya existe un usuario llamado «${usuario}».`);
    this.name = "UsuarioDuplicado";
  }
}

function derivar(clave: string, sal: string): string {
  return crypto.scryptSync(clave.normalize("NFKC"), sal, LONGITUD_HASH).toString("hex");
}

function aUsuario(fila: FilaUsuario): Usuario {
  return {
    id: fila.id,
    usuario: fila.usuario,
    nombre: fila.nombre,
    area: fila.area,
    activo: fila.activo === 1,
  };
}

export function crearUsuario(datos: {
  usuario: string;
  nombre: string;
  area: Area;
  clave: string;
}): Usuario {
  if (datos.clave.length < LONGITUD_MINIMA_CLAVE) throw new ClaveDemasiadoCorta();

  const nombreUsuario = datos.usuario.trim().toLowerCase();
  const yaExiste = db()
    .prepare("SELECT 1 AS x FROM usuarios WHERE usuario = ?")
    .get(nombreUsuario);
  if (yaExiste) throw new UsuarioDuplicado(nombreUsuario);

  const sal = crypto.randomBytes(16).toString("hex");
  const id = nuevoId();

  db()
    .prepare(
      `INSERT INTO usuarios (id, usuario, nombre, area, clave_hash, clave_sal, activo, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(
      id,
      datos.usuario.trim().toLowerCase(),
      datos.nombre.trim(),
      datos.area,
      derivar(datos.clave, sal),
      sal,
      ahora()
    );

  return { id, usuario: datos.usuario.trim().toLowerCase(), nombre: datos.nombre.trim(), area: datos.area, activo: true };
}

export function cambiarClave(usuario: string, clave: string): boolean {
  if (clave.length < LONGITUD_MINIMA_CLAVE) throw new ClaveDemasiadoCorta();

  const sal = crypto.randomBytes(16).toString("hex");
  const resultado = db()
    .prepare("UPDATE usuarios SET clave_hash = ?, clave_sal = ? WHERE usuario = ?")
    .run(derivar(clave, sal), sal, usuario.trim().toLowerCase());
  return Number(resultado.changes) > 0;
}

export function listarUsuarios(): Usuario[] {
  const filas = db()
    .prepare("SELECT * FROM usuarios ORDER BY area, usuario")
    .all() as unknown as FilaUsuario[];
  return filas.map(aUsuario);
}

export function hayUsuarios(): boolean {
  const fila = db().prepare("SELECT COUNT(*) AS total FROM usuarios").get() as { total: number };
  return fila.total > 0;
}

/** Verifica las credenciales. Devuelve `null` si no coinciden o está inactivo. */
export function autenticar(usuario: string, clave: string): Usuario | null {
  const fila = db()
    .prepare("SELECT * FROM usuarios WHERE usuario = ?")
    .get(usuario.trim().toLowerCase()) as unknown as FilaUsuario | undefined;

  // Se deriva igualmente cuando el usuario no existe, para que el tiempo de
  // respuesta no revele qué usuarios están dados de alta.
  const sal = fila?.clave_sal ?? "sal-inexistente";
  const esperado = fila?.clave_hash ?? crypto.randomBytes(LONGITUD_HASH).toString("hex");
  const calculado = derivar(clave, sal);

  const coincide = crypto.timingSafeEqual(
    Buffer.from(calculado, "hex"),
    Buffer.from(esperado, "hex")
  );

  if (!fila || !coincide || fila.activo !== 1) return null;
  return aUsuario(fila);
}

/* ------------------------------------------------------------------ */
/* Sesiones                                                            */
/* ------------------------------------------------------------------ */

export function abrirSesion(usuarioId: string, horas: number): string {
  const id = crypto.randomBytes(32).toString("hex");
  const creada = new Date();
  const expira = new Date(creada.getTime() + horas * 3600_000);

  db()
    .prepare("INSERT INTO sesiones (id, usuario_id, creada_en, expira_en) VALUES (?, ?, ?, ?)")
    .run(id, usuarioId, creada.toISOString(), expira.toISOString());

  return id;
}

export function usuarioDeSesion(sesionId: string): Usuario | null {
  if (!sesionId) return null;

  const fila = db()
    .prepare(
      `SELECT u.* FROM sesiones s
       JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.id = ? AND s.expira_en > ? AND u.activo = 1`
    )
    .get(sesionId, ahora()) as unknown as FilaUsuario | undefined;

  return fila ? aUsuario(fila) : null;
}

export function cerrarSesion(sesionId: string): void {
  db().prepare("DELETE FROM sesiones WHERE id = ?").run(sesionId);
}

/**
 * Cierra todas las sesiones abiertas de un usuario. Es lo que hay que hacer si
 * la tableta del Área de Socios se extravía: su sesión dura 30 días.
 */
export function cerrarSesionesDe(usuario: string): number {
  const resultado = db()
    .prepare(
      "DELETE FROM sesiones WHERE usuario_id IN (SELECT id FROM usuarios WHERE usuario = ?)"
    )
    .run(usuario.trim().toLowerCase());
  return Number(resultado.changes);
}

/** Sesiones abiertas de cada usuario, para saber qué dispositivos hay dentro. */
export function sesionesAbiertas(): { usuario: string; sesiones: number; ultima: string }[] {
  return db()
    .prepare(
      `SELECT u.usuario AS usuario, COUNT(s.id) AS sesiones, MAX(s.creada_en) AS ultima
       FROM usuarios u LEFT JOIN sesiones s ON s.usuario_id = u.id AND s.expira_en > ?
       GROUP BY u.usuario ORDER BY u.usuario`
    )
    .all(ahora()) as unknown as { usuario: string; sesiones: number; ultima: string }[];
}

/** Elimina las sesiones vencidas. Se ejecuta periódicamente. */
export function purgarSesiones(): number {
  const resultado = db().prepare("DELETE FROM sesiones WHERE expira_en <= ?").run(ahora());
  return Number(resultado.changes);
}
