import fs from "node:fs";
import path from "node:path";

import {
  rolFirmaGarante,
  type ConstanciaTramite,
  type SolicitudAfiliacion,
} from "../../../src/domain/solicitud";
import { recursosVacios, type RecursosFormulario } from "../../../src/services/formularios";
import { adjuntoComoDataUri } from "../db/adjuntos";
import { rutaFirmaEstampada } from "../db/firmasFuncionarios";
import { localizarWeb } from "../web";

/**
 * Recursos gráficos del formulario que genera el servidor: el logotipo
 * institucional y las firmas que trazó la tableta.
 *
 * Las firmas no viven en el documento de la solicitud —ahí solo hay rutas del
 * dispositivo, que aquí no significan nada—: llegaron aparte y se guardaron en
 * `adjuntos`. De ahí salen, ya como `data:` URI, para incrustarse en el
 * formulario. Es la razón por la que el formulario del servidor sí sale firmado.
 */

let logoCache: string | null = null;

/** Logotipo institucional como `data:` URI. Cadena vacía si no se encuentra. */
export function logoInstitucional(): string {
  if (logoCache !== null) return logoCache;

  const raiz = localizarWeb();
  const candidatas = [
    raiz ? path.join(raiz, "img", "logo-horizontal.png") : null,
    path.resolve(__dirname, "../../../../assets/images/brand/logo-horizontal.png"),
  ].filter((ruta): ruta is string => Boolean(ruta));

  const encontrada = candidatas.find((ruta) => fs.existsSync(ruta));
  logoCache = encontrada
    ? `data:image/png;base64,${fs.readFileSync(encontrada).toString("base64")}`
    : "";
  if (!encontrada) {
    console.warn("[formularios] No se encontró el logotipo: el formulario saldrá con el nombre del Club.");
  }
  return logoCache;
}

/**
 * Firma que se estampó en una constancia, leída de la carpeta del trámite.
 *
 * Es una copia congelada en el momento de la acción: si el funcionario vuelve a
 * trazar su firma, este formulario sigue mostrando la que firmó entonces.
 */
function firmaDeConstancia(
  solicitudId: string,
  constancia: ConstanciaTramite | null | undefined
): string | null {
  if (!constancia?.firmaArchivo) return null;
  const ruta = rutaFirmaEstampada(solicitudId, constancia.firmaArchivo);
  if (!fs.existsSync(ruta)) return null;
  const tipo = ruta.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  return `data:${tipo};base64,${fs.readFileSync(ruta).toString("base64")}`;
}

export function recursosDe(solicitud: SolicitudAfiliacion): RecursosFormulario {
  const { tramite } = solicitud;
  return {
    ...recursosVacios(),
    logo: logoInstitucional(),
    firmaSolicitante: adjuntoComoDataUri(solicitud.id, "FIRMA_SOLICITANTE"),
    firmasGarantes: solicitud.datos.garantes.map((_garante, indice) =>
      adjuntoComoDataUri(solicitud.id, rolFirmaGarante(indice))
    ),
    firmasFuncionarios: {
      SOCIOS: firmaDeConstancia(solicitud.id, tramite.registro),
      CONTABILIDAD: firmaDeConstancia(solicitud.id, tramite.revision),
      GERENCIA: firmaDeConstancia(solicitud.id, tramite.aprobacion),
    },
  };
}
