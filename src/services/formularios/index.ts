import { formularioPara, type VarianteFormulario } from "../../domain/tiposMiembro";
import type { SolicitudAfiliacion } from "../../domain/solicitud";
import { paginaCarta } from "./cartas";
import { ESTILOS_FORMULARIO } from "./estilos";
import { paginasFicha } from "./layoutFicha";
import { paginasSolicitud } from "./layoutSolicitud";
import { paginacion, pie } from "./piezas";
import { paginaReverso } from "./reverso";
import type { RecursosFormulario } from "./tipos";

export { recursosVacios } from "./tipos";
export type { RecursosFormulario } from "./tipos";

/**
 * Construye el formulario de ingreso completo de una solicitud, tal como se
 * imprime hoy en papel: el anverso con los datos del socio, la hoja de garantes
 * cuando el tipo la exige, la carta de compromiso cuando corresponde, y el
 * reverso con la INFORMACIÓN INTERNA DEL CLUB.
 *
 * Es el documento que se archiva en el expediente digital y se carga a la
 * sección Documentos del módulo Cuenta del CRM de SAFI.
 */

export type ResultadoFormulario = {
  html: string;
  /** Código del registro de calidad del formulario emitido (p. ej. `R-PGS1-8`). */
  codigoRegistro: string;
  /** Título del formulario, tal como consta en su encabezado. */
  titulo: string;
  paginas: number;
};

export function variantePara(solicitud: SolicitudAfiliacion): VarianteFormulario | null {
  return formularioPara(solicitud.datos.tipoMiembro, solicitud.datos.estadoCivil);
}

export function construirFormulario(
  solicitud: SolicitudAfiliacion,
  recursos: RecursosFormulario
): ResultadoFormulario | null {
  const variante = variantePara(solicitud);
  if (!variante) return null;

  const contenido =
    variante.layout === "FICHA"
      ? paginasFicha(solicitud, variante, recursos)
      : paginasSolicitud(solicitud, variante, recursos);

  const carta = paginaCarta(solicitud, recursos);
  const paginas = [...contenido, ...(carta ? [carta] : []), paginaReverso(solicitud, recursos, variante.codigo)];

  const cuerpo = paginas
    .map(
      (contenidoPagina, indice) =>
        `<div class="hoja">${contenidoPagina}
           ${pie(solicitud.codigo, solicitud.creadaEn)}
           ${paginacion(indice + 1, paginas.length)}
         </div>`
    )
    .join("");

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
    <title>${escaparTitulo(variante.titulo)}</title>
    <style>${ESTILOS_FORMULARIO}</style></head><body>${cuerpo}</body></html>`;

  return { html, codigoRegistro: variante.codigo, titulo: variante.titulo, paginas: paginas.length };
}

function escaparTitulo(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
