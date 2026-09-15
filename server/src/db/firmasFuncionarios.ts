import fs from "node:fs";
import path from "node:path";

import type { Area } from "../../../src/domain/solicitud";
import { config } from "../config";
import { ahora, db } from "./indice";

/**
 * Firma de los funcionarios: la que el reverso del formulario estampa en las
 * constancias de Registrado, Revisado y Aprobado.
 *
 * Cada funcionario la traza **una sola vez desde la tableta**, autenticándose
 * con su propio usuario, y se guarda como un archivo por usuario en
 * `/datos/firmas/<usuario>.png`. Quien no la haya cargado imprime su constancia
 * sin firma, exactamente como venía haciéndose hasta el 15/09/2026: la firma
 * cargada es una comodidad, no un requisito para que el trámite avance.
 *
 * Al actuar sobre un trámite, la firma se **copia** a la carpeta de ese trámite
 * (`firma-<AREA>.png`) y la constancia guarda ese nombre. Así una firma que el
 * funcionario vuelva a trazar mañana no reescribe las constancias ya emitidas,
 * igual que el nombre del responsable, que también queda congelado.
 */

const TIPOS_ACEPTADOS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
};

/** Tamaño máximo de una firma: de sobra para un trazo en pantalla. */
export const MAXIMO_BYTES_FIRMA = 2 * 1024 * 1024;

export function extensionDeFirma(tipoContenido: string): string | null {
  return TIPOS_ACEPTADOS[tipoContenido.split(";")[0].trim().toLowerCase()] ?? null;
}

function nombreSeguro(usuario: string): string {
  return usuario.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function rutaDe(usuario: string, extension: string): string {
  return path.join(config.firmasDir, `${nombreSeguro(usuario)}${extension}`);
}

/** La firma cargada por un funcionario, o `null` si todavía no cargó ninguna. */
export function firmaDeFuncionario(usuario: string): { ruta: string; extension: string } | null {
  for (const extension of Object.values(TIPOS_ACEPTADOS)) {
    const ruta = rutaDe(usuario, extension);
    if (fs.existsSync(ruta)) return { ruta, extension };
  }
  return null;
}

/**
 * Guarda (o sustituye) la firma de un funcionario. Devuelve el momento en que
 * quedó registrada.
 */
export function guardarFirmaFuncionario(entrada: {
  usuario: string;
  contenido: Buffer;
  extension: string;
}): string {
  fs.mkdirSync(config.firmasDir, { recursive: true });

  // Una firma anterior con otra extensión dejaría dos archivos y ganaría el
  // primero que encontrase `firmaDeFuncionario`.
  const anterior = firmaDeFuncionario(entrada.usuario);
  if (anterior) fs.rmSync(anterior.ruta, { force: true });

  fs.writeFileSync(rutaDe(entrada.usuario, entrada.extension), entrada.contenido, { mode: 0o640 });

  const momento = ahora();
  db()
    .prepare("UPDATE usuarios SET firma_en = ? WHERE usuario = ?")
    .run(momento, entrada.usuario.trim().toLowerCase());

  return momento;
}

/**
 * Copia la firma del funcionario a la carpeta del trámite y devuelve el nombre
 * del archivo, para guardarlo en la constancia. `null` si no tiene firma
 * cargada: entonces la constancia se imprime solo con su nombre.
 */
export function estamparFirma(entrada: {
  usuario: string;
  solicitudId: string;
  area: Area;
}): string | null {
  const firma = firmaDeFuncionario(entrada.usuario);
  if (!firma) return null;

  const carpeta = path.join(
    config.tramitesDir,
    entrada.solicitudId.replace(/[^a-zA-Z0-9_-]/g, "")
  );
  fs.mkdirSync(carpeta, { recursive: true });

  const nombre = `firma-${entrada.area.toLowerCase()}${firma.extension}`;
  fs.copyFileSync(firma.ruta, path.join(carpeta, nombre));
  return nombre;
}

/** Ruta de una firma ya estampada en un trámite, para leerla al imprimir. */
export function rutaFirmaEstampada(solicitudId: string, nombreArchivo: string): string {
  return path.join(
    config.tramitesDir,
    solicitudId.replace(/[^a-zA-Z0-9_-]/g, ""),
    path.basename(nombreArchivo)
  );
}
