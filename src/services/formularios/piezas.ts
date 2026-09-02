import { formatFechaCorta, formatFechaHora } from "../../domain/fechas";
import { sinTildes } from "../../domain/texto";

/**
 * Piezas comunes de los formularios: escapado, campos con línea, casillas de
 * verificación y recuadros. Todas devuelven HTML listo para insertar.
 */

export function escapar(valor: string | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Valor capturado sobre la línea del formulario. Vacío se dibuja punteado. */
export function valor(texto: string | null | undefined, opciones: { ancho?: boolean } = {}): string {
  const clases = ["valor"];
  if (opciones.ancho) clases.push("ancho");
  const limpio = (texto ?? "").trim();
  if (!limpio) clases.push("vacio");
  return `<span class="${clases.join(" ")}">${escapar(limpio) || "&nbsp;"}</span>`;
}

/** Casilla de verificación con su etiqueta, como en el formulario impreso. */
export function casilla(etiqueta: string, marcada: boolean): string {
  return `<span class="casilla">${marcada ? "X" : "&nbsp;"}</span>${escapar(etiqueta)}`;
}

/** Grupo de casillas excluyentes: `ESTADO CIVIL: soltero ☐ casado ☒ …`. */
export function opciones(
  rotulo: string,
  items: readonly string[],
  seleccionado: string | null
): string {
  const casillas = items
    .map((item) => casilla(item, normaliza(item) === normaliza(seleccionado ?? "")))
    .join("");
  return `<div class="opciones"><strong>${escapar(rotulo)}:</strong> ${casillas}</div>`;
}

function normaliza(valorTexto: string): string {
  return sinTildes(valorTexto).toLowerCase().trim();
}

/** Una fila de dos columnas dentro de un recuadro. */
export function fila(etiqueta: string, contenido: string | null | undefined): string {
  return `<tr><th>${escapar(etiqueta)}</th><td>${escapar((contenido ?? "").trim()) || "&nbsp;"}</td></tr>`;
}

/** Fila con dos pares etiqueta/valor, como los recuadros a dos columnas. */
export function filaDoble(
  etiquetaA: string,
  valorA: string | null | undefined,
  etiquetaB: string,
  valorB: string | null | undefined
): string {
  return `<tr>
    <th>${escapar(etiquetaA)}</th><td>${escapar((valorA ?? "").trim()) || "&nbsp;"}</td>
    <th>${escapar(etiquetaB)}</th><td>${escapar((valorB ?? "").trim()) || "&nbsp;"}</td>
  </tr>`;
}

/** Recuadro con rótulo, como «DATOS PERSONALES ASPIRANTE». */
export function recuadro(rotulo: string, filas: string[], columnas = 2): string {
  if (filas.length === 0) return "";
  const anchos =
    columnas === 4
      ? `<colgroup><col style="width:15%"><col style="width:35%"><col style="width:15%"><col style="width:35%"></colgroup>`
      : `<colgroup><col style="width:27%"><col style="width:73%"></colgroup>`;
  return `<section class="seccion">
    <div class="rotulo">${escapar(rotulo)}</div>
    <table class="recuadro">${anchos}${filas.join("")}</table>
  </section>`;
}

/** Rejilla con encabezados y filas, como «DATOS HIJOS». */
export function rejilla(
  rotulo: string,
  encabezados: { texto: string; ancho?: string }[],
  filas: string[][],
  filasMinimas = 0
): string {
  const colgroup = `<colgroup>${encabezados
    .map((e) => `<col${e.ancho ? ` style="width:${e.ancho}"` : ""}>`)
    .join("")}</colgroup>`;

  const cuerpo = [...filas];
  while (cuerpo.length < filasMinimas) cuerpo.push(encabezados.map(() => ""));

  const cuerpoHtml = cuerpo
    .map(
      (celdas) =>
        `<tr>${celdas
          .map((celda, indice) =>
            indice === 0
              ? `<td>${escapar(celda) || "&nbsp;"}</td>`
              : `<td class="centrada">${escapar(celda) || "&nbsp;"}</td>`
          )
          .join("")}</tr>`
    )
    .join("");

  return `<section class="seccion">
    <div class="rotulo">${escapar(rotulo)}</div>
    <table class="rejilla">${colgroup}
      <tr>${encabezados.map((e) => `<th>${escapar(e.texto)}</th>`).join("")}</tr>
      ${cuerpoHtml}
    </table>
  </section>`;
}

/** Bloque de firma: imagen si existe, línea con el nombre y la cédula debajo. */
export function firma(
  imagenDataUri: string | null,
  nombre: string,
  detalle: string,
  rotulo = ""
): string {
  const grafico = imagenDataUri
    ? `<img src="${imagenDataUri}" alt="Firma" />`
    : `<div class="espacio"></div>`;
  return `<div class="firma">
    ${grafico}
    <div class="linea">
      ${rotulo ? `${escapar(rotulo)}<br/>` : ""}
      <strong>${escapar(nombre) || "&nbsp;"}</strong>
      ${escapar(detalle)}
    </div>
  </div>`;
}

/** Cabecera institucional con el código del registro de calidad. */
export function encabezado(logo: string, codigoRegistro: string, tituloRegistro: string): string {
  const marca = logo
    ? `<img src="${logo}" alt="Club La Campiña" />`
    : `<div class="marca">CLUB LA CAMPIÑA</div>`;
  return `<header class="encabezado">
    ${marca}
    <div class="codigo-registro">
      <strong>${escapar(codigoRegistro)}</strong>
      ${escapar(tituloRegistro)}
    </div>
  </header>`;
}

export function pie(codigoSolicitud: string, generadoEn: string): string {
  return `<div class="pie">
    Documento generado electrónicamente por la aplicación institucional del Club La Campiña ·
    Trámite ${escapar(codigoSolicitud)} · ${escapar(formatFechaHora(generadoEn))}<br/>
    El tratamiento de los datos personales aquí contenidos se rige por la Ley Orgánica de
    Protección de Datos Personales del Ecuador.
  </div>`;
}

export function paginacion(actual: number, total: number): string {
  return `<div class="paginacion">Página ${actual} | ${total}</div>`;
}

/** `1990-05-04` → `04/05/1990`, o cadena vacía si no hay fecha. */
export function fecha(iso: string | null | undefined): string {
  if (!iso) return "";
  const formateada = formatFechaCorta(iso);
  return formateada === "—" ? "" : formateada;
}

/** «Quito, 26 de agosto de 2026» para el encabezado de las cartas. */
export function lugarYFecha(iso: string, ciudad = "Quito"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return ciudad;
  const meses = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  return `${ciudad}, ${date.getDate()} de ${meses[date.getMonth()]} de ${date.getFullYear()}`;
}

/** Une nombre y detalle en una sola línea, omitiendo lo vacío. */
export function unir(partes: (string | null | undefined)[], separador = " · "): string {
  return partes
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(separador);
}
