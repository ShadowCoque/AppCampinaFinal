import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { TipoDocumento } from "../../../src/domain/documentos";
import { nombreArchivo, nombreCarpeta, type ClaveExpediente } from "../../../src/domain/expediente";
import {
  nombreCompleto,
  nombreTitular,
  type SolicitudAfiliacion,
} from "../../../src/domain/solicitud";
import { normalizarNombreFinal, normalizarNumeroSocio } from "../../../src/domain/texto";
import { tieneCuentaPropia } from "../../../src/domain/tiposMiembro";
import { config } from "../config";
import { registrarArchivo, type ArchivoExpediente } from "../db/archivos";
import { marcarEscaneoRecibido, titularPorNumero } from "../db/solicitudes";

/**
 * Repositorio digital de expedientes.
 *
 * Un directorio por socio titular, nombrado `280 APELLIDOS NOMBRES`, que
 * contiene su documentación y la de todos sus dependientes. Es la misma unidad
 * que una Cuenta del CRM de SAFI, de modo que lo que se archiva aquí es
 * exactamente lo que se publica allá.
 *
 * Dos garantías que este módulo no negocia:
 *
 *   · **Nada se pierde al reemplazar.** Si llega una versión nueva de un
 *     documento que ya estaba archivado —una cédula reescaneada, el formulario
 *     final que sustituye al preliminar—, la anterior se conserva en
 *     `_ANTERIORES/` con la fecha en el nombre.
 *   · **Solo se archiva lo que tiene dueño.** Quien llama resuelve antes a qué
 *     trámite pertenece el documento; aquí no se adivina.
 */

export type ResultadoArchivado = {
  archivo: ArchivoExpediente;
  /** Ruta absoluta dentro del repositorio. */
  destino: string;
  /** El documento ya existía con otro contenido y la versión anterior se conservó. */
  reemplazado: boolean;
  /** El documento ya estaba archivado con el mismo contenido: no se duplicó. */
  identico: boolean;
  /** Carpeta del socio titular, tal como quedó en el repositorio. */
  carpeta: string;
};

/**
 * Nombre del socio titular de la cuenta a la que pertenece una persona: el
 * propio, si es titular; el de su titular, si es dependiente.
 */
function titularDeLaCuenta(solicitud: SolicitudAfiliacion): string {
  if (tieneCuentaPropia(solicitud.datos.tipoMiembro)) return nombreCompleto(solicitud.datos);

  // Si el titular se registró por este sistema, su nombre manda: es el que
  // quedó en su Cuenta de SAFI. Si es un titular antiguo, se usa el que declaró
  // el dependiente.
  const titular = titularPorNumero(solicitud.tramite.numeroSocio);
  return titular ? nombreCompleto(titular.datos) : nombreTitular(solicitud.datos);
}

/**
 * Carpeta del socio titular en el repositorio.
 *
 * La carpeta se identifica por el número, no por el nombre: si ya existe una
 * que empieza por «280 », es esa, aunque el nombre del titular se haya escrito
 * de otro modo en el trámite de un dependiente. Dos carpetas para la misma
 * familia serían dos expedientes a medias.
 */
export function carpetaDeCuenta(numeroSocio: string, nombreTitularCuenta: string): string {
  const numero = normalizarNumeroSocio(numeroSocio);
  fs.mkdirSync(config.expedientesDir, { recursive: true });

  const existente = fs
    .readdirSync(config.expedientesDir, { withFileTypes: true })
    .find((entrada) => entrada.isDirectory() && entrada.name.startsWith(`${numero} `));
  if (existente) return path.join(config.expedientesDir, existente.name);

  const carpeta = path.join(
    config.expedientesDir,
    nombreCarpeta({ numeroSocio: numero, apellidosNombres: normalizarNombreFinal(nombreTitularCuenta) })
  );
  fs.mkdirSync(carpeta, { recursive: true });
  return carpeta;
}

/** Clave de la persona en el repositorio, a partir de su trámite. */
export function claveDe(solicitud: SolicitudAfiliacion): ClaveExpediente {
  return {
    numeroSocio: normalizarNumeroSocio(solicitud.tramite.numeroSocio),
    ordinalDependiente: solicitud.tramite.ordinalDependiente ?? null,
    apellidosNombres: normalizarNombreFinal(nombreCompleto(solicitud.datos)),
  };
}

function huella(ruta: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(ruta)).digest("hex");
}

/** `2026-09-11 153012`, para el nombre de una versión anterior. */
function sello(): string {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}${dos(
    d.getMinutes()
  )}${dos(d.getSeconds())}`;
}

/** Aparta la versión vigente de un documento antes de reemplazarla. */
function conservarAnterior(carpeta: string, destino: string): void {
  const anteriores = path.join(carpeta, "_ANTERIORES");
  fs.mkdirSync(anteriores, { recursive: true });
  const extension = path.extname(destino);
  const base = path.basename(destino, extension);
  fs.renameSync(destino, path.join(anteriores, `${base} ${sello()}${extension}`));
}

/**
 * Copia un archivo al expediente de la persona y lo inscribe en la base.
 *
 * No toca el archivo de origen: moverlo o conservarlo lo decide quien llama
 * (el vigilante lo traslada a `_ARCHIVADOS/` una vez archivado).
 */
export function archivar(entrada: {
  origenRuta: string;
  solicitud: SolicitudAfiliacion;
  tipoDocumento: TipoDocumento;
  /** `APP`: lo capturó la tableta o lo generó el servidor. `ESCANEO`: carpeta compartida. */
  origen: "APP" | "ESCANEO";
}): ResultadoArchivado {
  const { solicitud } = entrada;
  const clave = claveDe(solicitud);
  if (!clave.numeroSocio) {
    throw new Error(`El trámite ${solicitud.codigo} todavía no tiene número de socio: no se puede archivar.`);
  }

  const carpeta = carpetaDeCuenta(clave.numeroSocio, titularDeLaCuenta(solicitud));
  const extension = path.extname(entrada.origenRuta).toLowerCase() || ".pdf";
  const nombre = nombreArchivo(clave, entrada.tipoDocumento, extension);
  const destino = path.join(carpeta, nombre);

  const bytesOrigen = fs.statSync(entrada.origenRuta).size;
  if (bytesOrigen === 0) throw new Error(`El archivo de origen está vacío: ${path.basename(entrada.origenRuta)}`);

  let reemplazado = false;
  let identico = false;

  if (fs.existsSync(destino)) {
    if (fs.statSync(destino).size === bytesOrigen && huella(destino) === huella(entrada.origenRuta)) {
      identico = true;
    } else {
      conservarAnterior(carpeta, destino);
      reemplazado = true;
    }
  }

  if (!identico) {
    fs.copyFileSync(entrada.origenRuta, destino);
    const bytes = fs.statSync(destino).size;
    if (bytes !== bytesOrigen) {
      fs.rmSync(destino, { force: true });
      throw new Error(`La copia de ${nombre} quedó incompleta (${bytes} de ${bytesOrigen} bytes).`);
    }
  }

  const archivo = registrarArchivo({
    solicitudId: solicitud.id,
    clave,
    tipoDocumento: entrada.tipoDocumento,
    nombreArchivo: nombre,
    ruta: destino,
    bytes: bytesOrigen,
    origen: entrada.origen,
  });

  marcarEscaneoRecibido(solicitud.id, entrada.tipoDocumento);

  return { archivo, destino, reemplazado, identico, carpeta };
}

/** Guarda un contenido en memoria (formulario generado, fotografía) en el expediente. */
export function archivarContenido(entrada: {
  contenido: Buffer;
  extension: string;
  solicitud: SolicitudAfiliacion;
  tipoDocumento: TipoDocumento;
}): ResultadoArchivado {
  const temporal = path.join(
    config.datosDir,
    "tmp",
    `archivo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${entrada.extension}`
  );
  fs.mkdirSync(path.dirname(temporal), { recursive: true });
  fs.writeFileSync(temporal, entrada.contenido);

  try {
    return archivar({
      origenRuta: temporal,
      solicitud: entrada.solicitud,
      tipoDocumento: entrada.tipoDocumento,
      origen: "APP",
    });
  } finally {
    fs.rmSync(temporal, { force: true });
  }
}

/** Ruta absoluta de un documento, validada contra el directorio permitido. */
export function rutaSegura(ruta: string, raizPermitida = config.expedientesDir): string | null {
  const resuelta = path.resolve(ruta);
  const raiz = path.resolve(raizPermitida);
  if (!resuelta.startsWith(raiz + path.sep) && resuelta !== raiz) return null;
  return fs.existsSync(resuelta) ? resuelta : null;
}
