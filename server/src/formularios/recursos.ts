import fs from "node:fs";
import path from "node:path";

import {
  rolFirmaGarante,
  type SolicitudAfiliacion,
} from "../../../src/domain/solicitud";
import { recursosVacios, type RecursosFormulario } from "../../../src/services/formularios";
import { adjuntoComoDataUri } from "../db/adjuntos";
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

export function recursosDe(solicitud: SolicitudAfiliacion): RecursosFormulario {
  return {
    ...recursosVacios(),
    logo: logoInstitucional(),
    firmaSolicitante: adjuntoComoDataUri(solicitud.id, "FIRMA_SOLICITANTE"),
    firmasGarantes: solicitud.datos.garantes.map((_garante, indice) =>
      adjuntoComoDataUri(solicitud.id, rolFirmaGarante(indice))
    ),
    fotoCarnet: adjuntoComoDataUri(solicitud.id, "FOTO_CARNET"),
  };
}
