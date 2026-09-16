import fs from "node:fs";
import path from "node:path";

import { ROLES_ADJUNTO, type RolAdjunto } from "../../../src/domain/solicitud";
import { config } from "../config";
import { ahora, db, nuevoId } from "./indice";

/**
 * Firmas y fotografía que entrega la tableta.
 *
 * Llegan con el registro, cuando el trámite todavía no tiene número de socio y
 * por tanto no tiene carpeta en el repositorio. Se guardan aparte, una carpeta
 * por trámite en `/datos/tramites/<id>/`, y de aquí salen las firmas que se
 * estampan en el formulario y la fotografía que se archiva al aprobarse.
 */

export type Adjunto = {
  id: string;
  solicitudId: string;
  rol: RolAdjunto;
  nombreArchivo: string;
  ruta: string;
  bytes: number;
  tipoContenido: string;
  recibidoEn: string;
};

type Fila = {
  id: string;
  solicitud_id: string;
  rol: string;
  nombre_archivo: string;
  ruta: string;
  bytes: number;
  tipo_contenido: string;
  recibido_en: string;
};

function aAdjunto(fila: Fila): Adjunto {
  return {
    id: fila.id,
    solicitudId: fila.solicitud_id,
    rol: fila.rol as RolAdjunto,
    nombreArchivo: fila.nombre_archivo,
    ruta: fila.ruta,
    bytes: fila.bytes,
    tipoContenido: fila.tipo_contenido,
    recibidoEn: fila.recibido_en,
  };
}

export function esRolAdjunto(valor: unknown): valor is RolAdjunto {
  return typeof valor === "string" && (ROLES_ADJUNTO as readonly string[]).includes(valor);
}

/** Carpeta de los adjuntos de un trámite. El id viene del propio servidor o se valida antes. */
function carpetaDe(solicitudId: string): string {
  const seguro = solicitudId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(config.tramitesDir, seguro);
}

/**
 * Guarda un adjunto y lo inscribe. Si ya existía uno con el mismo papel, lo
 * sustituye: la tableta reintenta cuando pierde una respuesta, y el segundo
 * envío es el mismo archivo.
 */
export function guardarAdjunto(entrada: {
  solicitudId: string;
  rol: RolAdjunto;
  contenido: Buffer;
  extension: string;
  tipoContenido: string;
}): Adjunto {
  const carpeta = carpetaDe(entrada.solicitudId);
  fs.mkdirSync(carpeta, { recursive: true });

  const nombre = `${entrada.rol.toLowerCase()}${entrada.extension}`;
  const ruta = path.join(carpeta, nombre);

  // Un adjunto anterior con otra extensión (una foto que llegó como .png y
  // ahora como .jpg) no debe quedar huérfano en el disco.
  const anterior = adjuntoDe(entrada.solicitudId, entrada.rol);
  if (anterior && anterior.ruta !== ruta) fs.rmSync(anterior.ruta, { force: true });

  fs.writeFileSync(ruta, entrada.contenido);

  db()
    .prepare(
      `INSERT INTO adjuntos (id, solicitud_id, rol, nombre_archivo, ruta, bytes, tipo_contenido, recibido_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(solicitud_id, rol) DO UPDATE SET
         nombre_archivo = excluded.nombre_archivo,
         ruta = excluded.ruta,
         bytes = excluded.bytes,
         tipo_contenido = excluded.tipo_contenido,
         recibido_en = excluded.recibido_en`
    )
    .run(
      nuevoId(),
      entrada.solicitudId,
      entrada.rol,
      nombre,
      ruta,
      entrada.contenido.length,
      entrada.tipoContenido,
      ahora()
    );

  return adjuntoDe(entrada.solicitudId, entrada.rol)!;
}

/**
 * Borra los adjuntos de un trámite y su carpeta.
 *
 * Solo se llama al borrar el trámite entero: mientras exista, sus firmas son
 * parte de él. Si un archivo ya no está en el disco, no es un error —lo que
 * importa es que no quede inscrito algo que no existe—.
 */
export function borrarAdjuntosDe(solicitudId: string): number {
  const adjuntos = adjuntosDe(solicitudId);
  for (const adjunto of adjuntos) {
    try {
      if (fs.existsSync(adjunto.ruta)) fs.rmSync(adjunto.ruta, { force: true });
    } catch (error) {
      console.warn(`[adjuntos] No se pudo borrar ${adjunto.ruta}:`, error);
    }
  }

  db().prepare("DELETE FROM adjuntos WHERE solicitud_id = ?").run(solicitudId);

  try {
    const carpeta = carpetaDe(solicitudId);
    if (fs.existsSync(carpeta)) fs.rmSync(carpeta, { recursive: true, force: true });
  } catch (error) {
    console.warn("[adjuntos] No se pudo borrar la carpeta del trámite:", error);
  }

  return adjuntos.length;
}

export function adjuntoDe(solicitudId: string, rol: RolAdjunto): Adjunto | null {
  const fila = db()
    .prepare("SELECT * FROM adjuntos WHERE solicitud_id = ? AND rol = ?")
    .get(solicitudId, rol) as unknown as Fila | undefined;
  return fila ? aAdjunto(fila) : null;
}

export function adjuntosDe(solicitudId: string): Adjunto[] {
  const filas = db()
    .prepare("SELECT * FROM adjuntos WHERE solicitud_id = ? ORDER BY rol")
    .all(solicitudId) as unknown as Fila[];
  return filas.map(aAdjunto);
}

/** Papeles recibidos cuyo archivo sigue en el disco. */
export function rolesRecibidos(solicitudId: string): RolAdjunto[] {
  return adjuntosDe(solicitudId)
    .filter((adjunto) => fs.existsSync(adjunto.ruta))
    .map((adjunto) => adjunto.rol);
}

/** Un adjunto como `data:` URI, para incrustarlo en el formulario. */
export function adjuntoComoDataUri(solicitudId: string, rol: RolAdjunto): string | null {
  const adjunto = adjuntoDe(solicitudId, rol);
  if (!adjunto || !fs.existsSync(adjunto.ruta)) return null;
  const base64 = fs.readFileSync(adjunto.ruta).toString("base64");
  return `data:${adjunto.tipoContenido};base64,${base64}`;
}
