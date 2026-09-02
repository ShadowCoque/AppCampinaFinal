/**
 * Hoja de estilos de los formularios generados.
 *
 * El objetivo no es que el documento «se parezca» al formulario físico, sino
 * que sea el mismo formulario: los recuadros, el orden de los campos, las
 * casillas de verificación y el pie con los requisitos de carnetización están
 * calcados de los originales que reposan en `FORMULARIOS_TIPO_DE_SOCIOS/`.
 *
 * Lo único que cambia respecto del papel es que los campos vienen llenos: el
 * valor capturado se imprime en azul institucional sobre la línea de puntos,
 * de modo que a simple vista se distingue el texto preimpreso del dato del
 * socio.
 */

export const AZUL = "#08407D";
export const DORADO = "#D0A33E";
export const GRIS_LINEA = "#9AA9BC";
export const GRIS_TEXTO = "#54657A";

export const ESTILOS_FORMULARIO = `
  @page { size: A4; margin: 12mm 11mm; }

  * { box-sizing: border-box; }

  body {
    font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
    color: #101820;
    font-size: 8.6pt;
    line-height: 1.35;
    margin: 0;
  }

  .hoja { page-break-after: always; }
  .hoja:last-child { page-break-after: auto; }

  /* --- Cabecera ---------------------------------------------------- */

  .encabezado {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 2px solid ${AZUL};
    padding-bottom: 6px;
  }
  .encabezado img { height: 40px; }
  .encabezado .marca {
    font-size: 13pt; font-weight: bold; color: ${AZUL}; letter-spacing: .5px;
  }
  .codigo-registro {
    text-align: right; font-size: 7pt; color: ${GRIS_TEXTO}; line-height: 1.4; white-space: nowrap;
  }
  .codigo-registro strong { display: block; color: ${AZUL}; font-size: 7.5pt; }

  h1.titulo {
    text-align: center;
    font-size: 11pt;
    color: ${AZUL};
    text-transform: uppercase;
    letter-spacing: .4px;
    margin: 10px 0 8px;
    font-weight: bold;
  }

  .destinatario { margin: 6px 0 8px; line-height: 1.5; }
  .destinatario .cargo { font-weight: bold; }

  p.parrafo { text-align: justify; margin: 6px 0; }
  p.legal { text-align: justify; margin: 8px 0; font-size: 7.3pt; color: ${GRIS_TEXTO}; }

  /* --- Valores capturados ------------------------------------------ */

  .valor {
    color: ${AZUL};
    font-weight: bold;
    border-bottom: 1px solid ${GRIS_LINEA};
    padding: 0 4px 1px;
    display: inline-block;
    min-width: 60px;
  }
  .valor.ancho { min-width: 240px; }
  .valor.vacio { color: ${GRIS_LINEA}; font-weight: normal; }

  /* --- Recuadros de datos ------------------------------------------ */

  .seccion {
    margin-top: 9px;
    page-break-inside: avoid;
  }
  .seccion > .rotulo {
    font-weight: bold;
    font-size: 8.4pt;
    color: ${AZUL};
    text-transform: uppercase;
    letter-spacing: .3px;
    margin-bottom: 3px;
  }

  table.recuadro {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  table.recuadro th, table.recuadro td {
    border: 1px solid ${GRIS_LINEA};
    padding: 3px 5px;
    vertical-align: top;
    text-align: left;
    word-wrap: break-word;
  }
  table.recuadro th {
    font-weight: normal;
    font-size: 7.4pt;
    color: ${GRIS_TEXTO};
    text-transform: uppercase;
    letter-spacing: .2px;
    background: #F4F7FB;
    width: 27%;
  }
  table.recuadro td { font-weight: bold; color: ${AZUL}; }
  table.recuadro td.libre { font-weight: normal; color: #101820; }

  /* --- Rejillas (hijos, dependientes, garantes) --------------------- */

  table.rejilla {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  table.rejilla th {
    border: 1px solid ${GRIS_LINEA};
    background: #EDF3F9;
    color: ${AZUL};
    font-size: 7pt;
    text-transform: uppercase;
    letter-spacing: .2px;
    padding: 3px 4px;
    text-align: center;
  }
  table.rejilla td {
    border: 1px solid ${GRIS_LINEA};
    padding: 3px 5px;
    height: 16px;
    font-size: 8pt;
  }
  table.rejilla td.centrada { text-align: center; }

  /* --- Casillas de verificación ------------------------------------- */

  .casilla {
    display: inline-block;
    width: 9px; height: 9px;
    border: 1px solid #101820;
    margin: 0 3px 0 8px;
    vertical-align: -1px;
    text-align: center;
    line-height: 8px;
    font-size: 8px;
    font-weight: bold;
    color: ${AZUL};
  }
  .casilla:first-child { margin-left: 0; }
  .opciones { margin: 2px 0; }

  /* --- Firmas -------------------------------------------------------- */

  .zona-firmas {
    display: flex;
    gap: 22px;
    margin-top: 14px;
    page-break-inside: avoid;
  }
  .firma { flex: 1; text-align: center; }
  .firma img { height: 46px; object-fit: contain; display: block; margin: 0 auto 2px; }
  .firma .espacio { height: 46px; }
  .firma .linea {
    border-top: 1px solid #101820;
    padding-top: 3px;
    font-size: 7.4pt;
    color: ${GRIS_TEXTO};
    line-height: 1.4;
  }
  .firma .linea strong { display: block; color: #101820; font-size: 8pt; }
  .atentamente { text-align: center; margin-top: 12px; font-size: 9pt; }

  /* --- Reverso: información interna --------------------------------- */

  .interna-cabecera {
    border: 1px solid ${AZUL};
    background: #EDF3F9;
    color: ${AZUL};
    font-weight: bold;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: .6px;
    padding: 5px;
    font-size: 9.5pt;
    margin-bottom: 8px;
  }

  .constancias { display: flex; gap: 10px; margin-top: 8px; }
  .constancia {
    flex: 1;
    border: 1px solid ${GRIS_LINEA};
    padding: 6px 8px 8px;
    min-height: 104px;
    page-break-inside: avoid;
  }
  .constancia .accion {
    font-weight: bold; color: ${AZUL}; text-transform: uppercase;
    letter-spacing: .4px; font-size: 8.4pt; margin-bottom: 4px;
  }
  .constancia .cargo { font-size: 7pt; color: ${GRIS_TEXTO}; text-transform: uppercase; }
  .constancia .rubrica {
    border-top: 1px solid #101820; margin-top: 26px; padding-top: 3px;
    font-size: 7.6pt; font-weight: bold; color: #101820; min-height: 14px;
  }
  .constancia .momento { font-size: 7pt; color: ${GRIS_TEXTO}; margin-top: 2px; }
  .constancia.pendiente .rubrica { color: ${GRIS_LINEA}; font-weight: normal; }

  .observacion {
    border: 1px solid ${GRIS_LINEA};
    margin-top: 6px;
    padding: 4px 6px;
    min-height: 30px;
  }
  .observacion .rotulo {
    font-size: 7pt; color: ${GRIS_TEXTO}; text-transform: uppercase; letter-spacing: .2px;
  }
  .observacion .texto { font-size: 8pt; }

  .requisitos {
    margin-top: 10px;
    border-top: 1px solid ${GRIS_LINEA};
    padding-top: 6px;
    font-size: 7.2pt;
    color: ${GRIS_TEXTO};
    line-height: 1.5;
  }
  .requisitos strong { color: ${AZUL}; }
  .requisitos ul { margin: 3px 0 0 14px; padding: 0; }
  .aviso-importante {
    margin-top: 5px; font-weight: bold; color: #101820; font-size: 7.4pt;
  }

  /* --- Carta de compromiso ------------------------------------------ */

  .carta p { text-align: justify; margin: 9px 0; line-height: 1.55; font-size: 9pt; }
  .carta .titulo-carta {
    text-align: center; font-weight: bold; font-size: 10.5pt; color: #101820;
    margin: 14px 0 16px; letter-spacing: .3px;
  }

  /* --- Pie de página -------------------------------------------------- */

  .pie {
    margin-top: 12px;
    border-top: 1px solid #DCE5EF;
    padding-top: 5px;
    font-size: 6.6pt;
    color: #93A5B8;
    text-align: center;
    line-height: 1.5;
  }
  .paginacion { text-align: right; font-size: 7pt; color: ${GRIS_TEXTO}; margin-top: 4px; }
`;
