import type { SolicitudAfiliacion } from "../../domain/solicitud";
import {
  CATALOGO_TIPOS,
  FORMULARIO_PRINCIPAL,
  hojaSolicitudPara,
  tituloFormularioPrincipal,
  type HojaSolicitud,
} from "../../domain/tiposMiembro";
import { paginaCarta } from "./cartas";
import { ESTILOS_FORMULARIO } from "./estilos";
import { paginaPrincipal, paginasGeneral } from "./layoutFicha";
import { paginasSolicitud } from "./layoutSolicitud";
import { paginacion, pie } from "./piezas";
import { paginaReverso } from "./reverso";
import type { RecursosFormulario } from "./tipos";

export { recursosVacios } from "./tipos";
export type { RecursosFormulario } from "./tipos";

/**
 * Construye el trámite completo de una solicitud, tal como se archiva:
 *
 *   1. El R-PGS1-1, formulario principal común a todas las categorías.
 *   2. La hoja de solicitud de ingreso de su categoría, con los recuadros de
 *      cónyuge, hijos y garantes que esa hoja tenga. El Socio Activo no lleva:
 *      su R-PGS1-1 ya es su solicitud.
 *   3. La carta de compromiso, cuando la categoría la exige.
 *   4. El reverso con la INFORMACIÓN INTERNA DEL CLUB y las tres constancias.
 *
 * Es código puro —no toca el sistema de archivos ni la red— y lo usan tanto la
 * tableta, que lo imprime con el sistema del dispositivo, como el servidor, que
 * lo sirve a la bandeja y lo archiva en el expediente al aprobarse el ingreso.
 * Así el documento que ve la Gerencia es exactamente el que se generó en la
 * tableta, con las constancias que se hayan ido sumando.
 */

export type ResultadoFormulario = {
  html: string;
  /** Códigos de los documentos incluidos (p. ej. `R-PGS1-1 · R-PGS1-8`). */
  codigoRegistro: string;
  /** Título del formulario principal. */
  titulo: string;
  paginas: number;
};

/** Hoja de solicitud que acompaña al R-PGS1-1 de esta solicitud, si lleva. */
export function hojaDe(solicitud: SolicitudAfiliacion): HojaSolicitud | null {
  return hojaSolicitudPara(solicitud.datos.tipoMiembro, solicitud.datos.estadoCivil);
}

export function construirFormulario(
  solicitud: SolicitudAfiliacion,
  recursos: RecursosFormulario
): ResultadoFormulario | null {
  const tipo = solicitud.datos.tipoMiembro;
  if (!tipo) return null;

  const hoja = hojaDe(solicitud);
  const hojas = hoja
    ? hoja.layout === "GENERAL"
      ? paginasGeneral(solicitud, hoja, recursos)
      : paginasSolicitud(solicitud, hoja, recursos)
    : [];

  const carta = CATALOGO_TIPOS[tipo].cartaCompromiso ? paginaCarta(solicitud, recursos) : null;

  const paginas = [
    paginaPrincipal(solicitud, recursos),
    ...hojas,
    ...(carta ? [carta] : []),
    paginaReverso(solicitud, recursos, FORMULARIO_PRINCIPAL.codigo),
  ];

  const cuerpo = paginas
    .map(
      (contenidoPagina, indice) =>
        `<div class="hoja">${contenidoPagina}
           ${pie(solicitud.codigo, solicitud.creadaEn)}
           ${paginacion(indice + 1, paginas.length)}
         </div>`
    )
    .join("");

  const titulo = tituloFormularioPrincipal(tipo);
  const codigos = [FORMULARIO_PRINCIPAL.codigo, ...(hoja ? [hoja.codigo] : [])].join(" · ");

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
    <title>${escaparTitulo(`${solicitud.codigo} · ${codigos}`)}</title>
    <style>${ESTILOS_FORMULARIO}</style></head><body>${cuerpo}</body></html>`;

  return { html, codigoRegistro: codigos, titulo, paginas: paginas.length };
}

function escaparTitulo(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
