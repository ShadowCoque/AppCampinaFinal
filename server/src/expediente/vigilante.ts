import fs from "node:fs";
import path from "node:path";

import {
  MOTIVO_RECHAZO_META,
  analizarNombreArchivo,
  analizarNombreCarpeta,
  nombreCoincide,
} from "../../../src/domain/expediente";
import { config } from "../config";
import { registrarIncidencia, resolverIncidencia } from "../db/archivos";
import { registrarBitacora } from "../db/indice";
import { solicitudPorNumeroSocio } from "../db/solicitudes";
import { archivar } from "./repositorio";

/**
 * Vigilante de la carpeta compartida de escaneos.
 *
 * La Jefatura del Área de Socios escanea la documentación física desde su
 * equipo a una carpeta compartida por SMB. Este proceso la recorre
 * periódicamente, interpreta el nombre de cada archivo según la convención del
 * repositorio (`domain/expediente.ts`), lo archiva en la carpeta del socio y lo
 * encola para su publicación en el módulo Cuentas del CRM de SAFI.
 *
 * Lo que no puede clasificar NO se borra: se traslada a `_REVISAR/` y genera una
 * tarea en la bandeja del Área de Socios explicando cómo debe nombrarse. Un
 * documento mal archivado en el expediente de otro socio es un incidente de
 * protección de datos, así que ante la duda el sistema se detiene y avisa.
 *
 * Se recorre por temporizador en lugar de confiar solo en `fs.watch`: sobre un
 * montaje CIFS los eventos del sistema de archivos no son fiables, y una
 * afiliación no puede quedarse esperando un evento que nunca llegó.
 */

const ESPERA_ESTABILIDAD_MS = 4000;

/** Tamaños vistos en la pasada anterior, para no tomar un archivo a medio copiar. */
const tamanosPrevios = new Map<string, number>();

let temporizador: NodeJS.Timeout | null = null;
let enCurso = false;

export function iniciarVigilante(): void {
  if (temporizador) return;

  if (!fs.existsSync(config.escaneosDir)) {
    console.warn(
      `[vigilante] La carpeta de escaneos ${config.escaneosDir} no existe. El vigilante queda inactivo.`
    );
    return;
  }

  fs.mkdirSync(config.escaneosRevisarDir, { recursive: true });

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
  omitidos: number;
};

/** Recorre la carpeta compartida una vez. Expuesto para poder forzarlo por API. */
export async function recorrer(): Promise<ResumenPasada> {
  if (enCurso) return { archivados: 0, incidencias: 0, omitidos: 0 };
  enCurso = true;

  const resumen: ResumenPasada = { archivados: 0, incidencias: 0, omitidos: 0 };

  try {
    const candidatos = recolectar(config.escaneosDir);

    for (const candidato of candidatos) {
      const parcial = procesar(candidato);
      resumen.archivados += parcial.archivados;
      resumen.incidencias += parcial.incidencias;
      resumen.omitidos += parcial.omitidos;
    }

    // Un archivo que se retiró a mano de la carpeta compartida dejaría su
    // entrada aquí para siempre. Se olvida lo que ya no está: el servicio corre
    // durante meses sin reiniciarse.
    const vistos = new Set(candidatos.map((c) => c.ruta));
    for (const ruta of tamanosPrevios.keys()) {
      if (!vistos.has(ruta)) tamanosPrevios.delete(ruta);
    }
  } catch (error) {
    console.error("[vigilante] Error recorriendo la carpeta compartida:", error);
  } finally {
    enCurso = false;
  }

  return resumen;
}

type Candidato = { ruta: string; nombre: string; carpeta: string | null };

/** Archivos de la carpeta compartida, incluidas sus subcarpetas por socio. */
function recolectar(raiz: string): Candidato[] {
  const candidatos: Candidato[] = [];
  const revisar = path.resolve(config.escaneosRevisarDir);

  const entradas = fs.readdirSync(raiz, { withFileTypes: true });
  for (const entrada of entradas) {
    const ruta = path.join(raiz, entrada.name);
    if (path.resolve(ruta) === revisar) continue;
    if (entrada.name.startsWith(".") || entrada.name.startsWith("~")) continue;

    if (entrada.isDirectory()) {
      for (const hijo of fs.readdirSync(ruta, { withFileTypes: true })) {
        if (!hijo.isFile() || hijo.name.startsWith(".") || hijo.name.startsWith("~")) continue;
        candidatos.push({ ruta: path.join(ruta, hijo.name), nombre: hijo.name, carpeta: entrada.name });
      }
    } else if (entrada.isFile()) {
      candidatos.push({ ruta, nombre: entrada.name, carpeta: null });
    }
  }

  return candidatos;
}

function procesar(candidato: Candidato): ResumenPasada {
  const vacio: ResumenPasada = { archivados: 0, incidencias: 0, omitidos: 0 };

  // 1. El escáner puede seguir escribiendo. Solo se toma un archivo cuyo tamaño
  //    no ha cambiado desde la pasada anterior y que ya tiene unos segundos.
  let info: fs.Stats;
  try {
    info = fs.statSync(candidato.ruta);
  } catch {
    return vacio;
  }

  const previo = tamanosPrevios.get(candidato.ruta);
  tamanosPrevios.set(candidato.ruta, info.size);
  const estable = previo === info.size && Date.now() - info.mtimeMs > ESPERA_ESTABILIDAD_MS;
  if (!estable || info.size === 0) return { ...vacio, omitidos: 1 };

  // 2. Interpretar el nombre del archivo.
  const analisis = analizarNombreArchivo(candidato.nombre);
  if (!analisis.ok) {
    apartar(candidato, analisis.motivo, analisis.detalle);
    return { ...vacio, incidencias: 1 };
  }

  // 3. Si el archivo está dentro de una subcarpeta con nombre de socio, el
  //    número de socio de ambos debe coincidir: un desajuste significa que el
  //    documento se guardó en la carpeta equivocada.
  if (candidato.carpeta) {
    const carpeta = analizarNombreCarpeta(candidato.carpeta);
    if (carpeta.ok && carpeta.clave.numeroSocio !== analisis.clave.numeroSocio) {
      apartar(
        candidato,
        "SIN_NUMERO_DE_SOCIO",
        `El archivo dice socio ${analisis.clave.numeroSocio} pero está en la carpeta del socio ${carpeta.clave.numeroSocio}. Verifique en cuál de los dos está el error antes de archivarlo.`
      );
      return { ...vacio, incidencias: 1 };
    }
  }

  // 4. Contrastar el nombre con el del socio registrado: un dígito equivocado
  //    en el número archivaría el documento en el expediente de otra persona.
  const solicitud = solicitudPorNumeroSocio(analisis.clave.numeroSocio);
  if (solicitud && analisis.clave.ordinalDependiente === null) {
    const registrado = `${solicitud.datos.apellidos} ${solicitud.datos.nombres}`;
    if (!nombreCoincide(registrado, analisis.clave.apellidosNombres)) {
      apartar(
        candidato,
        "SIN_NOMBRE",
        `El socio ${analisis.clave.numeroSocio} está registrado como «${registrado.trim()}» y el archivo dice «${analisis.clave.apellidosNombres}». Corrija el nombre o el número antes de archivarlo.`
      );
      return { ...vacio, incidencias: 1 };
    }
  }

  // 5. Archivar.
  try {
    const resultado = archivar({
      origenRuta: candidato.ruta,
      clave: analisis.clave,
      tipoDocumento: analisis.tipo,
      origen: "ESCANEO",
      moverOrigen: true,
    });

    tamanosPrevios.delete(candidato.ruta);
    resolverIncidencia(candidato.nombre);

    registrarBitacora({
      area: "SOCIOS",
      accion: "ARCHIVAR_ESCANEO",
      entidad: `${analisis.clave.numeroSocio}${
        analisis.clave.ordinalDependiente !== null ? `-${analisis.clave.ordinalDependiente}` : ""
      }`,
      detalle: `${analisis.tipo} · ${resultado.archivo.nombreArchivo}${
        resultado.reemplazado ? " (reemplaza versión anterior)" : ""
      }`,
    });

    console.log(`[vigilante] Archivado ${candidato.nombre} → ${resultado.destino}`);
    return { ...vacio, archivados: 1 };
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    apartar(candidato, "EXTENSION_NO_ACEPTADA", `No se pudo archivar: ${detalle}`);
    return { ...vacio, incidencias: 1 };
  }
}

/**
 * Traslada a `_REVISAR/` lo que no pudo clasificarse y abre la tarea
 * correspondiente. El archivo se conserva íntegro.
 */
function apartar(candidato: Candidato, motivo: string, detalle: string): void {
  const destino = path.join(config.escaneosRevisarDir, candidato.nombre);

  try {
    fs.mkdirSync(config.escaneosRevisarDir, { recursive: true });
    if (path.resolve(candidato.ruta) !== path.resolve(destino)) {
      fs.renameSync(candidato.ruta, destinoLibre(destino));
    }
  } catch (error) {
    console.warn(`[vigilante] No se pudo apartar ${candidato.nombre}:`, error);
  }

  tamanosPrevios.delete(candidato.ruta);
  registrarIncidencia({
    archivo: candidato.nombre,
    motivo,
    detalle: detalle || MOTIVO_RECHAZO_META.SIN_NUMERO_DE_SOCIO,
  });

  console.warn(`[vigilante] Apartado ${candidato.nombre}: ${detalle}`);
}

/** Evita sobrescribir en `_REVISAR/` un archivo apartado anteriormente. */
function destinoLibre(destino: string): string {
  if (!fs.existsSync(destino)) return destino;
  const extension = path.extname(destino);
  const base = destino.slice(0, destino.length - extension.length);
  let indice = 2;
  while (fs.existsSync(`${base} (${indice})${extension}`)) indice += 1;
  return `${base} (${indice})${extension}`;
}
