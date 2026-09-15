import type { SolicitudAfiliacion } from "../../domain/solicitud";
import {
  CATALOGO_TIPOS,
  formularioPrincipalPara,
  hojaAdicionalPara,
  HOJA_GENERAL,
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
 *   1. El formulario principal de la categoría, y solo uno: el R-PGS1-1 si es
 *      Socio Activo, el PGS1-11 en cualquier otro caso.
 *   2. La hoja de solicitud de ingreso de su categoría, con los recuadros de
 *      cónyuge, hijos y garantes que esa hoja tenga. No la llevan ni el Socio
 *      Activo ni los dependientes de un socio titular: su formulario principal
 *      ya es su solicitud.
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

/** Hoja de solicitud que acompaña al formulario principal, si lleva. */
export function hojaDe(solicitud: SolicitudAfiliacion): HojaSolicitud | null {
  return hojaAdicionalPara(solicitud.datos.tipoMiembro, solicitud.datos.estadoCivil);
}

export function construirFormulario(
  solicitud: SolicitudAfiliacion,
  recursos: RecursosFormulario
): ResultadoFormulario | null {
  const tipo = solicitud.datos.tipoMiembro;
  if (!tipo) return null;

  // Un solo formulario principal por categoría: el R-PGS1-1 del Socio Activo o
  // el PGS1-11 de las demás, nunca los dos.
  const principal = formularioPrincipalPara(tipo);
  const paginasPrincipal = principal.general
    ? paginasGeneral(solicitud, HOJA_GENERAL, recursos)
    : [paginaPrincipal(solicitud, recursos)];

  const hoja = hojaDe(solicitud);
  const hojas = hoja ? paginasSolicitud(solicitud, hoja, recursos) : [];

  const carta = CATALOGO_TIPOS[tipo].cartaCompromiso ? paginaCarta(solicitud, recursos) : null;

  const paginas = [
    ...paginasPrincipal,
    ...hojas,
    ...(carta ? [carta] : []),
    paginaReverso(solicitud, recursos, principal.codigo),
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
  const codigos = [principal.codigo, ...(hoja ? [hoja.codigo] : [])].join(" · ");

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
    <title>${escaparTitulo(`${solicitud.codigo} · ${codigos}`)}</title>
    <style>${ESTILOS_FORMULARIO}</style></head><body>${cuerpo}</body></html>`;

  return { html, codigoRegistro: codigos, titulo, paginas: paginas.length };
}

function escaparTitulo(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
