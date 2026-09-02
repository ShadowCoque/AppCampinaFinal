import fs from "node:fs";
import path from "node:path";

import type { TipoDocumento } from "../../../src/domain/documentos";
import { nombreArchivo, nombreCarpeta, type ClaveExpediente } from "../../../src/domain/expediente";
import { config } from "../config";
import { registrarArchivo, type ArchivoExpediente } from "../db/archivos";
import type { SolicitudAfiliacion } from "../../../src/domain/solicitud";
import { marcarEscaneoRecibido, solicitudPorNumeroSocio } from "../db/solicitudes";

/**
 * Repositorio digital de expedientes.
 *
 * Un directorio por socio titular, nombrado `280 APELLIDOS NOMBRES`, que
 * contiene su documentación y la de todos sus dependientes. Es la misma unidad
 * que una Cuenta del CRM de SAFI, de modo que lo que se archiva aquí es
 * exactamente lo que se publica allá.
 *
 * El servidor nunca borra un original de la carpeta compartida sin haberlo
 * copiado antes: primero escribe la copia en el repositorio, la verifica y solo
 * entonces retira el archivo de la bandeja de escaneo.
 */

export type ResultadoArchivado = {
  archivo: ArchivoExpediente;
  /** Ruta absoluta dentro del repositorio. */
  destino: string;
  /** El documento ya existía y fue reemplazado por una versión nueva. */
  reemplazado: boolean;
};

/**
 * Carpeta en la que se archiva el documento.
 *
 * Los documentos de un dependiente viven en la carpeta de su titular: es la
 * Cuenta que agrupa a la familia en el CRM de SAFI. La solicitud del titular
 * llega ya consultada para no repetir la misma búsqueda por cada archivo de una
 * misma tanda de escaneos.
 */
function carpetaDeSocio(clave: ClaveExpediente, titular: SolicitudAfiliacion | null): string {
  const nombreTitular = titular
    ? `${titular.datos.apellidos} ${titular.datos.nombres}`.replace(/\s+/g, " ").trim()
    : null;

  const carpeta = nombreCarpeta({
    numeroSocio: clave.numeroSocio,
    apellidosNombres:
      clave.ordinalDependiente === null
        ? clave.apellidosNombres
        : (nombreTitular ?? clave.apellidosNombres),
  });
  return path.join(config.expedientesDir, carpeta);
}

/** Copia un archivo al repositorio y lo inscribe en la base de datos. */
export function archivar(entrada: {
  origenRuta: string;
  clave: ClaveExpediente;
  tipoDocumento: TipoDocumento;
  origen: "APP" | "ESCANEO";
  /** Conservar el archivo de origen (la app sube copias temporales). */
  moverOrigen: boolean;
}): ResultadoArchivado {
  // Una sola consulta por archivo: sirve para nombrar la carpeta, para vincular
  // el documento con su trámite y para descontarlo de los escaneos pendientes.
  const solicitud = solicitudPorNumeroSocio(entrada.clave.numeroSocio);

  const carpeta = carpetaDeSocio(entrada.clave, solicitud);
  fs.mkdirSync(carpeta, { recursive: true });

  const extension = path.extname(entrada.origenRuta).toLowerCase() || ".pdf";
  const nombre = nombreArchivo(entrada.clave, entrada.tipoDocumento, extension);
  const destino = path.join(carpeta, nombre);
  const reemplazado = fs.existsSync(destino);

  fs.copyFileSync(entrada.origenRuta, destino);

  const bytes = fs.statSync(destino).size;
  if (bytes === 0) {
    fs.rmSync(destino, { force: true });
    throw new Error(`El archivo copiado quedó vacío: ${nombre}`);
  }

  if (entrada.moverOrigen) {
    try {
      fs.rmSync(entrada.origenRuta, { force: true });
    } catch (error) {
      // Si la carpeta compartida está en solo lectura, el documento ya quedó
      // archivado: se avisa pero no se deshace el trabajo.
      console.warn(`[repositorio] No se pudo retirar el original ${entrada.origenRuta}:`, error);
    }
  }

  const archivo = registrarArchivo({
    solicitudId: solicitud?.id ?? null,
    clave: entrada.clave,
    tipoDocumento: entrada.tipoDocumento,
    nombreArchivo: nombre,
    ruta: destino,
    bytes,
    origen: entrada.origen,
  });

  // Un documento del propio titular descuenta de su lista de pendientes.
  if (solicitud && entrada.clave.ordinalDependiente === null) {
    marcarEscaneoRecibido(solicitud.id, entrada.tipoDocumento);
  }

  return { archivo, destino, reemplazado };
}

/** Guarda un contenido en memoria (subida desde la app) en el repositorio. */
export function archivarContenido(entrada: {
  contenido: Buffer;
  extension: string;
  clave: ClaveExpediente;
  tipoDocumento: TipoDocumento;
}): ResultadoArchivado {
  const temporal = path.join(
    config.datosDir,
    "tmp",
    `subida-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${entrada.extension}`
  );
  fs.mkdirSync(path.dirname(temporal), { recursive: true });
  fs.writeFileSync(temporal, entrada.contenido);

  try {
    return archivar({
      origenRuta: temporal,
      clave: entrada.clave,
      tipoDocumento: entrada.tipoDocumento,
      origen: "APP",
      moverOrigen: false,
    });
  } finally {
    fs.rmSync(temporal, { force: true });
  }
}

/** Ruta absoluta de un documento, validada contra el directorio permitido. */
export function rutaSegura(ruta: string): string | null {
  const resuelta = path.resolve(ruta);
  const raiz = path.resolve(config.expedientesDir);
  if (!resuelta.startsWith(raiz + path.sep) && resuelta !== raiz) return null;
  return fs.existsSync(resuelta) ? resuelta : null;
}
