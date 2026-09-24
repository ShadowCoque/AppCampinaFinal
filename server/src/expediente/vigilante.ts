import fs from "node:fs";
import path from "node:path";

import {
  MOTIVO_RECHAZO_META,
  analizarNombreArchivo,
  analizarNombreCarpeta,
  nombreCoincide,
  prefijoDe,
} from "../../../src/domain/expediente";
import { nombreCompleto, type SolicitudAfiliacion } from "../../../src/domain/solicitud";
import type { TipoDocumento } from "../../../src/domain/documentos";
import { config } from "../config";
import {
  incidenciasAbiertas,
  registrarIncidencia,
  resolverIncidencia,
  resolverIncidenciaPorId,
} from "../db/archivos";
import { registrarBitacora } from "../db/indice";
import { familiaDe, personaEnExpediente } from "../db/solicitudes";
import { archivar, type ResultadoArchivado } from "./repositorio";

/**
 * Vigilante de la carpeta compartida de escaneos.
 *
 * La Jefatura del Área de Socios escanea la documentación física desde su
 * equipo a una carpeta compartida por SMB. Este proceso la recorre
 * periódicamente, interpreta el nombre de cada archivo según la convención del
 * repositorio (`domain/expediente.ts`) y lo archiva en el expediente de la
 * persona a la que pertenece.
 *
 * **Nunca borra nada de la carpeta compartida.** Cada archivo termina en uno de
 * tres sitios, y los tres están a la vista de la Jefatura:
 *
 *   · `_ARCHIVADOS/<carpeta del socio>/` — se archivó en el expediente. El
 *     original queda aquí; la copia de trabajo, en el repositorio.
 *   · `_REVISAR/` — el nombre es ambiguo o no corresponde a la persona
 *     registrada. Genera una tarea que dice qué corregir.
 *   · **Donde estaba** — el nombre es correcto pero todavía no hay ningún
 *     trámite con ese número (la Jefatura escaneó antes de asignarlo). Se
 *     archiva solo en cuanto el número exista; mientras, una tarea lo avisa.
 *
 * Antes, lo archivado se borraba de la carpeta compartida tras copiarlo, y un
 * número que no correspondía a ningún trámite se archivaba igual, sin avisar a
 * nadie: el documento «desaparecía». Ante la duda, ahora el sistema se detiene
 * y avisa: un documento en el expediente de otro socio es un incidente de
 * protección de datos.
 *
 * Se recorre por temporizador en lugar de confiar solo en `fs.watch`: sobre un
 * montaje CIFS los eventos del sistema de archivos no son fiables, y una
 * afiliación no puede quedarse esperando un evento que nunca llegó.
 */

/**
 * Un archivo se toma cuando ya nadie lo está escribiendo, y eso se comprueba de
 * dos maneras:
 *
 *   · Su tamaño no cambió desde la pasada anterior y pasaron unos segundos
 *     desde la última escritura (el caso normal, con dos pasadas del
 *     temporizador).
 *   · O bien lleva un buen rato quieto, aunque sea la primera vez que se ve.
 *     Es lo que permite que «Revisar la carpeta ahora» archive de inmediato lo
 *     que ya estaba depositado, sin obligar a la Jefatura a pulsar dos veces.
 */
const ESPERA_ESTABILIDAD_MS = 4000;
const QUIETO_MS = 20_000;

/** Archivos que el sistema operativo o el escáner dejan y que no son documentos. */
const IGNORADOS = new Set(["thumbs.db", "desktop.ini", ".ds_store"]);

/** Tamaños vistos en la pasada anterior, para no tomar un archivo a medio copiar. */
const tamanosPrevios = new Map<string, number>();

/** Archivos ya anunciados como en espera, para no repetir el aviso en cada pasada. */
const anunciadosEnEspera = new Set<string>();

let temporizador: NodeJS.Timeout | null = null;
let enCurso = false;

export function vigilanciaActiva(): boolean {
  return temporizador !== null;
}

export function iniciarVigilante(): void {
  if (temporizador) return;

  if (!fs.existsSync(config.escaneosDir)) {
    console.warn(
      `[vigilante] La carpeta de escaneos ${config.escaneosDir} no existe. El vigilante queda inactivo.`
    );
    return;
  }

  try {
    fs.mkdirSync(config.escaneosRevisarDir, { recursive: true });
    fs.mkdirSync(config.escaneosArchivadosDir, { recursive: true });
  } catch (error) {
    console.warn(
      "[vigilante] No se pudieron crear _REVISAR/ o _ARCHIVADOS/ en la carpeta de escaneos. Revise los permisos del volumen:",
      error
    );
  }

  const intervalo = config.intervaloVigilanciaSeg * 1000;
  temporizador = setInterval(() => void recorrer(), intervalo);
  // Primera pasada al arrancar, para recoger lo depositado mientras el servidor
  // estaba detenido.
  setTimeout(() => void recorrer(), 2000);

  console.log(
    `[vigilante] Vigilando ${config.escaneosDir} cada ${config.intervaloVigilanciaSeg} s.`
  );
}

export function detenerVigilante(): void {
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
}

export type ResumenPasada = {
  archivados: number;
  incidencias: number;
  enEspera: number;
  omitidos: number;
};

function vacio(): ResumenPasada {
  return { archivados: 0, incidencias: 0, enEspera: 0, omitidos: 0 };
}

/** Recorre la carpeta compartida una vez. Expuesto para poder forzarlo por API. */
export async function recorrer(): Promise<ResumenPasada> {
  if (enCurso) return vacio();
  enCurso = true;

  const resumen = vacio();

  try {
    const candidatos = recolectar(config.escaneosDir);

    for (const candidato of candidatos) {
      const parcial = procesar(candidato);
      resumen.archivados += parcial.archivados;
      resumen.incidencias += parcial.incidencias;
      resumen.enEspera += parcial.enEspera;
      resumen.omitidos += parcial.omitidos;
    }

    // Un archivo que se retiró a mano de la carpeta compartida dejaría su
    // entrada aquí para siempre. Se olvida lo que ya no está: el servicio corre
    // durante meses sin reiniciarse.
    const vistos = new Set(candidatos.map((c) => c.ruta));
    for (const ruta of tamanosPrevios.keys()) {
      if (!vistos.has(ruta)) tamanosPrevios.delete(ruta);
    }
    for (const ruta of anunciadosEnEspera) {
      if (!vistos.has(ruta)) anunciadosEnEspera.delete(ruta);
    }

    cerrarIncidenciasSinArchivo();
  } catch (error) {
    console.error("[vigilante] Error recorriendo la carpeta compartida:", error);
  } finally {
    enCurso = false;
  }

  return resumen;
}

type Candidato = { ruta: string; nombre: string; carpeta: string | null };

function esIgnorado(nombre: string): boolean {
  return (
    nombre.startsWith(".") ||
    nombre.startsWith("~") ||
    // `_REVISAR`, `_ARCHIVADOS` y cualquier otra carpeta de trabajo del sistema.
    nombre.startsWith("_") ||
    IGNORADOS.has(nombre.toLowerCase())
  );
}

/** Archivos de la carpeta compartida, incluidas sus subcarpetas por socio. */
function recolectar(raiz: string): Candidato[] {
  const candidatos: Candidato[] = [];

  for (const entrada of fs.readdirSync(raiz, { withFileTypes: true })) {
    if (esIgnorado(entrada.name)) continue;
    const ruta = path.join(raiz, entrada.name);

    if (entrada.isDirectory()) {
      for (const hijo of fs.readdirSync(ruta, { withFileTypes: true })) {
        if (!hijo.isFile() || esIgnorado(hijo.name)) continue;
        candidatos.push({ ruta: path.join(ruta, hijo.name), nombre: hijo.name, carpeta: entrada.name });
      }
    } else if (entrada.isFile()) {
      candidatos.push({ ruta, nombre: entrada.name, carpeta: null });
    }
  }

  return candidatos;
}

function procesar(candidato: Candidato): ResumenPasada {
  // 1. El escáner puede seguir escribiendo. Solo se toma un archivo cuyo tamaño
  //    no ha cambiado desde la pasada anterior y que ya tiene unos segundos.
  let info: fs.Stats;
  try {
    info = fs.statSync(candidato.ruta);
  } catch {
    return vacio();
  }

  const previo = tamanosPrevios.get(candidato.ruta);
  tamanosPrevios.set(candidato.ruta, info.size);
  const quietoDesde = Date.now() - info.mtimeMs;
  const estable =
    (previo === info.size && quietoDesde > ESPERA_ESTABILIDAD_MS) || quietoDesde > QUIETO_MS;
  if (!estable || info.size === 0) return { ...vacio(), omitidos: 1 };

  // 2. Interpretar el nombre del archivo.
  const analisis = analizarNombreArchivo(candidato.nombre);
  if (!analisis.ok) {
    apartar(candidato, analisis.motivo, analisis.detalle);
    return { ...vacio(), incidencias: 1 };
  }
  const { clave } = analisis;
  const prefijo = prefijoDe(clave);

  // 3. Si el archivo está dentro de una subcarpeta con nombre de socio, el
  //    número de socio de ambos debe coincidir: un desajuste significa que el
  //    documento se guardó en la carpeta equivocada.
  if (candidato.carpeta) {
    const carpeta = analizarNombreCarpeta(candidato.carpeta);
    if (carpeta.ok && carpeta.clave.numeroSocio !== clave.numeroSocio) {
      apartar(
        candidato,
        "SIN_NUMERO_DE_SOCIO",
        `El archivo dice socio ${clave.numeroSocio} pero está en la carpeta del socio ${carpeta.clave.numeroSocio}. Verifique en cuál de los dos está el error antes de archivarlo.`,
        clave.numeroSocio
      );
      return { ...vacio(), incidencias: 1 };
    }
  }

  // 4. ¿A qué trámite pertenece? Se busca a la persona exacta —titular o
  //    dependiente—, no solo el número, que es el mismo para toda la familia.
  const persona = personaEnExpediente(clave.numeroSocio, clave.ordinalDependiente);

  if (!persona) {
    const familia = familiaDe(clave.numeroSocio);
    const detalle =
      familia.length === 0
        ? `Ningún trámite tiene todavía el número de socio ${clave.numeroSocio}. El archivo se queda en la carpeta compartida y se archivará solo en cuanto se asigne ese número con «Confirmar y crear en SAFI». Si el número está mal escrito, corríjalo en el nombre del archivo.`
        : `La cuenta ${clave.numeroSocio} no tiene registrada a la persona ${prefijo}. Si es un dependiente, se archivará cuando se le asigne ese número en la bandeja. Si el número está mal escrito, corríjalo.`;
    esperar(candidato, detalle, clave.numeroSocio);
    return { ...vacio(), enEspera: 1 };
  }

  // 5. Contrastar el nombre con el de la persona registrada: un dígito
  //    equivocado en el número archivaría el documento en el expediente de otro.
  const registrado = nombreCompleto(persona.datos);
  if (!nombreCoincide(registrado, clave.apellidosNombres)) {
    apartar(
      candidato,
      "SIN_NOMBRE",
      `El número ${prefijo} corresponde a «${registrado}» (trámite ${persona.codigo}) y el archivo dice «${clave.apellidosNombres}». Corrija el nombre o el número y devuelva el archivo a la carpeta de escaneos.`,
      clave.numeroSocio
    );
    return { ...vacio(), incidencias: 1 };
  }

  // 6. Archivar en el expediente y retirar el original a _ARCHIVADOS/.
  try {
    const resultado = archivar({
      origenRuta: candidato.ruta,
      solicitud: persona,
      tipoDocumento: analisis.tipo,
      origen: "ESCANEO",
    });

    const trasladado = trasladarArchivado(candidato, path.basename(resultado.carpeta));
    tamanosPrevios.delete(candidato.ruta);
    resolverIncidencia(candidato.nombre);

    if (!resultado.identico) {
      registrarBitacora({
        area: "SOCIOS",
        accion: "ARCHIVAR_ESCANEO",
        entidad: prefijo,
        detalle: `${analisis.tipo} · ${resultado.archivo.nombreArchivo}${
          resultado.reemplazado ? " (la versión anterior se conservó en _ANTERIORES)" : ""
        }`,
      });
      console.log(`[vigilante] Archivado ${candidato.nombre} → ${resultado.destino}`);
    }
    if (!trasladado) {
      console.warn(
        `[vigilante] ${candidato.nombre} quedó archivado, pero no se pudo trasladar a _ARCHIVADOS/. Revise los permisos de la carpeta compartida.`
      );
    }
    return { ...vacio(), archivados: resultado.identico ? 0 : 1 };
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    apartar(candidato, "EXTENSION_NO_ACEPTADA", `No se pudo archivar: ${detalle}`, clave.numeroSocio);
    return { ...vacio(), incidencias: 1 };
  }
}

/** Primer nombre libre en un directorio, sin sobrescribir nada de lo que ya está. */
function destinoLibre(destino: string): string {
  if (!fs.existsSync(destino)) return destino;
  const extension = path.extname(destino);
  const base = destino.slice(0, destino.length - extension.length);
  let indice = 2;
  while (fs.existsSync(`${base} (${indice})${extension}`)) indice += 1;
  return `${base} (${indice})${extension}`;
}

/**
 * Traslada el original ya archivado a `_ARCHIVADOS/<carpeta del socio>/`.
 * Devuelve `false` si no pudo (permisos): el documento ya está a salvo en el
 * repositorio y la próxima pasada lo reconocerá como idéntico y volverá a
 * intentarlo, sin duplicar nada.
 */
function trasladarArchivado(candidato: Candidato, carpetaSocio: string): boolean {
  try {
    const directorio = path.join(config.escaneosArchivadosDir, carpetaSocio);
    fs.mkdirSync(directorio, { recursive: true });
    fs.renameSync(candidato.ruta, destinoLibre(path.join(directorio, candidato.nombre)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Traslada a `_REVISAR/` lo que no pudo clasificarse y abre la tarea
 * correspondiente. El archivo se conserva íntegro.
 */
function apartar(candidato: Candidato, motivo: string, detalle: string, numeroSocio?: string): void {
  let destino = candidato.ruta;

  try {
    fs.mkdirSync(config.escaneosRevisarDir, { recursive: true });
    destino = destinoLibre(path.join(config.escaneosRevisarDir, candidato.nombre));
    fs.renameSync(candidato.ruta, destino);
  } catch (error) {
    destino = candidato.ruta;
    console.warn(`[vigilante] No se pudo apartar ${candidato.nombre}:`, error);
  }

  tamanosPrevios.delete(candidato.ruta);
  anunciadosEnEspera.delete(candidato.ruta);
  registrarIncidencia({
    archivo: path.basename(destino),
    motivo,
    detalle: detalle || MOTIVO_RECHAZO_META.SIN_NUMERO_DE_SOCIO,
    tipo: "RECHAZADO",
    ruta: destino,
    numeroSocio,
  });

  console.warn(`[vigilante] Apartado a _REVISAR: ${candidato.nombre}`);
}

/**
 * Deja el archivo donde está y abre (o actualiza) la tarea que explica por qué
 * espera. Se archivará solo en una pasada posterior, en cuanto exista el
 * trámite con ese número.
 */
function esperar(candidato: Candidato, detalle: string, numeroSocio: string): void {
  registrarIncidencia({
    archivo: candidato.nombre,
    motivo: "SIN_NUMERO_DE_SOCIO",
    detalle,
    tipo: "EN_ESPERA",
    ruta: candidato.ruta,
    numeroSocio,
  });

  if (!anunciadosEnEspera.has(candidato.ruta)) {
    anunciadosEnEspera.add(candidato.ruta);
    console.log(`[vigilante] En espera de su trámite: ${candidato.nombre}`);
  }
}

/**
 * Cierra las incidencias cuyo archivo ya no está donde quedó: la Jefatura lo
 * renombró, lo sacó de `_REVISAR/` para corregirlo o lo retiró. Si vuelve con
 * el nombre corregido, se procesa como nuevo.
 */
function cerrarIncidenciasSinArchivo(): void {
  for (const incidencia of incidenciasAbiertas()) {
    if (incidencia.ruta && !fs.existsSync(incidencia.ruta)) {
      resolverIncidenciaPorId(incidencia.id);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Resolución a mano desde la bandeja                                  */
/* ------------------------------------------------------------------ */

/**
 * Localiza dentro de la carpeta compartida el archivo de una incidencia.
 *
 * El nombre llega de una petición, así que la ruta se resuelve y se comprueba
 * que quede dentro de la carpeta compartida: un nombre con `..` no puede
 * alcanzar nada del servidor.
 */
function localizarEscaneo(nombre: string): { ruta: string; nombre: string } | null {
  const abierta = incidenciasAbiertas().find((i) => i.archivo === nombre);
  const candidatas = [
    abierta?.ruta,
    path.join(config.escaneosDir, nombre),
    path.join(config.escaneosRevisarDir, nombre),
  ].filter((r): r is string => Boolean(r));

  const raiz = path.resolve(config.escaneosDir);
  for (const candidata of candidatas) {
    const resuelta = path.resolve(candidata);
    if (resuelta !== raiz && !resuelta.startsWith(raiz + path.sep)) continue;
    if (fs.existsSync(resuelta) && fs.statSync(resuelta).isFile()) {
      return { ruta: resuelta, nombre: path.basename(resuelta) };
    }
  }
  return null;
}

/**
 * Aparta a `_REVISAR/` un archivo que la Jefatura decidió no archivar y cierra
 * su tarea.
 *
 * Es una de las salidas de las tareas de escaneo: un archivo que llegó por
 * error dejaba la bandeja con una tarea que nadie podía resolver desde el
 * sistema. El archivo se conserva íntegro; aquí no se borra nada.
 */
export function apartarEscaneo(nombre: string): { ok: boolean; error?: string } {
  const archivo = localizarEscaneo(nombre);
  if (!archivo) return { ok: false, error: "El archivo ya no está en la carpeta compartida." };

  if (path.dirname(archivo.ruta) === path.resolve(config.escaneosRevisarDir)) {
    resolverIncidencia(nombre);
    return { ok: true };
  }

  try {
    fs.mkdirSync(config.escaneosRevisarDir, { recursive: true });
    fs.renameSync(archivo.ruta, destinoLibre(path.join(config.escaneosRevisarDir, archivo.nombre)));
  } catch (error) {
    return {
      ok: false,
      error: `No se pudo mover a _REVISAR: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  tamanosPrevios.delete(archivo.ruta);
  anunciadosEnEspera.delete(archivo.ruta);
  resolverIncidencia(nombre);
  return { ok: true };
}

/**
 * Archiva a mano un escaneo en el trámite que indica la Jefatura, cuando el
 * nombre del archivo no permitió deducirlo.
 *
 * Hace lo mismo que el vigilante cuando reconoce un archivo —archivar en el
 * expediente y retirar el original a `_ARCHIVADOS/`—, pero con el trámite y el
 * tipo de documento elegidos por una persona.
 */
export function asignarEscaneo(
  nombre: string,
  solicitud: SolicitudAfiliacion,
  tipoDocumento: TipoDocumento
): { ok: true; resultado: ResultadoArchivado } | { ok: false; error: string } {
  const archivo = localizarEscaneo(nombre);
  if (!archivo) return { ok: false, error: "El archivo ya no está en la carpeta compartida." };

  try {
    const resultado = archivar({
      origenRuta: archivo.ruta,
      solicitud,
      tipoDocumento,
      origen: "ESCANEO",
    });

    const trasladado = trasladarArchivado(
      { ruta: archivo.ruta, nombre: archivo.nombre, carpeta: null },
      path.basename(resultado.carpeta)
    );
    tamanosPrevios.delete(archivo.ruta);
    anunciadosEnEspera.delete(archivo.ruta);
    resolverIncidencia(nombre);

    registrarBitacora({
      area: "SOCIOS",
      accion: "ARCHIVAR_ESCANEO",
      entidad: solicitud.tramite.numeroSocio || solicitud.codigo,
      detalle: `${tipoDocumento} · ${resultado.archivo.nombreArchivo} (asignado a mano desde la bandeja)`,
    });

    if (!trasladado) {
      console.warn(
        `[vigilante] ${archivo.nombre} quedó archivado, pero no se pudo trasladar a _ARCHIVADOS/.`
      );
    }
    return { ok: true, resultado };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
