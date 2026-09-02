import { Directory, File, Paths } from "expo-file-system";

import { nuevoId } from "./almacenamiento";

/**
 * Gestión del expediente digital en el almacenamiento privado de la app.
 *
 * Las imágenes y documentos capturados llegan en directorios temporales del
 * sistema (caché de la cámara, del selector de archivos, etc.), que el sistema
 * operativo puede borrar en cualquier momento. Aquí se copian a un directorio
 * permanente por solicitud para que el expediente sobreviva al reinicio.
 */

const RAIZ = "expedientes";

function directorioRaiz(): Directory {
  const dir = new Directory(Paths.document, RAIZ);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function directorioDeSolicitud(solicitudId: string): Directory {
  const dir = new Directory(directorioRaiz(), solicitudId);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function extensionDe(uri: string, mimeType?: string): string {
  const sinQuery = uri.split("?")[0];
  const punto = sinQuery.lastIndexOf(".");
  if (punto > -1 && punto > sinQuery.lastIndexOf("/")) return sinQuery.slice(punto);
  if (mimeType?.includes("pdf")) return ".pdf";
  if (mimeType?.includes("png")) return ".png";
  return ".jpg";
}

/**
 * Copia un archivo temporal al expediente y devuelve la nueva URI permanente.
 * Si la copia falla, se devuelve la URI original para no perder la captura.
 */
export function guardarEnExpediente(
  solicitudId: string,
  uriOrigen: string,
  opciones: { prefijo: string; mimeType?: string }
): { uri: string; nombreArchivo: string; tamanoBytes: number } {
  const nombreArchivo = `${opciones.prefijo}-${nuevoId()}${extensionDe(uriOrigen, opciones.mimeType)}`;

  try {
    const origen = new File(uriOrigen);
    const destino = new File(directorioDeSolicitud(solicitudId), nombreArchivo);
    origen.copy(destino);
    return { uri: destino.uri, nombreArchivo, tamanoBytes: destino.size ?? 0 };
  } catch (error) {
    console.warn("[archivos] No se pudo copiar al expediente:", error);
    return { uri: uriOrigen, nombreArchivo, tamanoBytes: 0 };
  }
}

/** Guarda contenido base64 (p. ej. la firma) como archivo del expediente. */
export function guardarBase64(
  solicitudId: string,
  base64: string,
  opciones: { prefijo: string; extension: string }
): string | null {
  try {
    const limpio = base64.replace(/^data:[^;]+;base64,/, "");
    const archivo = new File(
      directorioDeSolicitud(solicitudId),
      `${opciones.prefijo}-${nuevoId()}${opciones.extension}`
    );
    archivo.create({ overwrite: true, intermediates: true });
    archivo.write(limpio, { encoding: "base64" });
    return archivo.uri;
  } catch (error) {
    console.warn("[archivos] No se pudo guardar el archivo base64:", error);
    return null;
  }
}

export function esDataUri(uri: string | null | undefined): boolean {
  return !!uri && uri.startsWith("data:");
}

/**
 * Lleva una firma recién trazada del lienzo al expediente y devuelve su URI de
 * archivo.
 *
 * El lienzo entrega la firma como `data:` URI, es decir, la imagen entera
 * codificada dentro de una cadena. Conservarla así en el estado del asistente
 * significaría reescribirla en el almacenamiento del dispositivo con cada
 * autoguardado —cada pocos segundos, y hasta tres firmas por solicitud cuando
 * hay dos garantes—. Escribirla a disco en cuanto se captura deja en el
 * borrador una simple ruta.
 *
 * Si la escritura falla, se devuelve el `data:` URI original: es preferible un
 * borrador pesado a perder la firma del solicitante.
 */
export function persistirFirma(
  solicitudId: string,
  dataUri: string | null,
  opciones: { prefijo: string; anterior?: string | null }
): string | null {
  if (!dataUri) {
    if (opciones.anterior) eliminarArchivo(opciones.anterior);
    return null;
  }

  if (!esDataUri(dataUri)) return dataUri;

  const guardada = guardarBase64(solicitudId, dataUri, {
    prefijo: opciones.prefijo,
    extension: ".png",
  });

  // Solo se retira la anterior cuando la nueva quedó efectivamente escrita.
  if (guardada && opciones.anterior && opciones.anterior !== guardada) {
    eliminarArchivo(opciones.anterior);
  }

  return guardada ?? dataUri;
}

/**
 * Lee un archivo del expediente como base64 (para incrustarlo en el PDF).
 * Si la URI ya es un `data:` URI —caso de una firma que no pudo escribirse a
 * disco— se devuelve directamente su contenido, sin tocar el sistema de
 * archivos.
 */
export async function leerBase64(uri: string): Promise<string | null> {
  if (esDataUri(uri)) return uri.replace(/^data:[^;]+;base64,/, "");
  try {
    const archivo = new File(uri);
    if (!archivo.exists) return null;
    return await archivo.base64();
  } catch (error) {
    console.warn("[archivos] No se pudo leer el archivo:", error);
    return null;
  }
}

export function eliminarArchivo(uri: string): void {
  if (esDataUri(uri)) return;
  try {
    const archivo = new File(uri);
    if (archivo.exists) archivo.delete();
  } catch (error) {
    console.warn("[archivos] No se pudo eliminar el archivo:", error);
  }
}

/** Elimina el expediente completo de una solicitud del dispositivo. */
export function eliminarExpediente(solicitudId: string): void {
  try {
    const dir = new Directory(directorioRaiz(), solicitudId);
    if (dir.exists) dir.delete();
  } catch (error) {
    console.warn("[archivos] No se pudo eliminar el expediente:", error);
  }
}

export function formatearTamano(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
