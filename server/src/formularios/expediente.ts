import fs from "node:fs";

import type { SolicitudAfiliacion } from "../../../src/domain/solicitud";
import { construirFormulario } from "../../../src/services/formularios";
import { adjuntoDe } from "../db/adjuntos";
import { registrarBitacora } from "../db/indice";
import { actualizarExpediente, obtenerSolicitud } from "../db/solicitudes";
import { archivarContenido } from "../expediente/repositorio";
import { generarPdf, pdfDisponible } from "./pdf";
import { recursosDe } from "./recursos";

/**
 * El formulario del trámite, tal como se ve y como se archiva.
 *
 * El documento se compone siempre a partir de los datos y las firmas que
 * guarda el servidor, así que refleja el estado del trámite en el momento en
 * que se pide: al registrarse lleva la constancia «Registrado» y las otras dos
 * en blanco, y al aprobarse lleva las tres. La bandeja lo muestra así a
 * Contabilidad y a la Gerencia —que antes aprobaban sin ver el formulario— y
 * esa última versión, la completa, es la que se archiva en el expediente y se
 * publica en SAFI.
 */

/** HTML del formulario completo de un trámite, o `null` si falta el tipo de socio. */
export function htmlDeSolicitud(solicitud: SolicitudAfiliacion): string | null {
  return construirFormulario(solicitud, recursosDe(solicitud))?.html ?? null;
}

/** PDF del formulario completo. Exige un navegador para imprimirlo. */
export async function pdfDeSolicitud(solicitud: SolicitudAfiliacion): Promise<Buffer> {
  const html = htmlDeSolicitud(solicitud);
  if (!html) throw new Error("El trámite no tiene tipo de socio: no se puede generar el formulario.");
  return generarPdf(html);
}

export type ResultadoArchivadoFinal =
  | { ok: true; nombreArchivo: string; reemplazado: boolean }
  | { ok: false; mensaje: string };

/**
 * Archiva en el expediente el formulario final —con las tres constancias— y la
 * fotografía tipo carnet.
 *
 * Se ejecuta al aprobarse el ingreso. Si el formulario ya estaba archivado con
 * el mismo contenido no se duplica, y si cambió (porque se aprobó después de
 * una devolución) la versión anterior se conserva en `_ANTERIORES/`.
 */
export async function archivarFormularioFinal(
  solicitudId: string
): Promise<ResultadoArchivadoFinal> {
  const solicitud = obtenerSolicitud(solicitudId);
  if (!solicitud) return { ok: false, mensaje: "Solicitud no encontrada." };

  if (!solicitud.tramite.numeroSocio) {
    return {
      ok: false,
      mensaje:
        "El trámite todavía no tiene número de socio, y el expediente se archiva bajo ese número.",
    };
  }

  if (!pdfDisponible()) {
    const mensaje =
      "No hay navegador instalado para imprimir el PDF en el servidor. Abra el formulario desde el expediente, guárdelo como PDF con el nombre que indica la tarea y déjelo en la carpeta de escaneos.";
    actualizarExpediente(solicitudId, { formularioFinalMensaje: mensaje });
    return { ok: false, mensaje };
  }

  try {
    const pdf = await pdfDeSolicitud(solicitud);
    const formulario = archivarContenido({
      contenido: pdf,
      extension: ".pdf",
      solicitud,
      tipoDocumento: "FORMULARIO_FIRMADO",
    });

    actualizarExpediente(solicitudId, {
      formularioFinal: {
        archivadoEn: new Date().toISOString(),
        nombreArchivo: formulario.archivo.nombreArchivo,
      },
      formularioFinalMensaje: undefined,
      carpeta: formulario.carpeta.split(/[\\/]/).pop() ?? null,
    });

    registrarBitacora({
      area: "SOCIOS",
      accion: "ARCHIVAR_FORMULARIO",
      entidad: solicitud.codigo,
      detalle: `${formulario.archivo.nombreArchivo}${
        formulario.reemplazado ? " (la versión anterior se conservó en _ANTERIORES)" : ""
      }`,
    });

    return {
      ok: true,
      nombreArchivo: formulario.archivo.nombreArchivo,
      reemplazado: formulario.reemplazado,
    };
  } catch (error) {
    const mensaje = `No se pudo generar el formulario final: ${
      error instanceof Error ? error.message : String(error)
    }`;
    actualizarExpediente(solicitudId, { formularioFinalMensaje: mensaje });
    return { ok: false, mensaje };
  }
}
