import { calcularEdad } from "../../domain/fechas";
import { CLAUSULA_FORMULARIO, CLAUSULA_SOLICITUD } from "../../domain/privacidad";
import { nombreCompleto, nombreTitular, type SolicitudAfiliacion } from "../../domain/solicitud";
import { socioDelQueDepende } from "../../domain/sociosSafi";
import {
  CATALOGO_TIPOS,
  FORMULARIO_PRINCIPAL,
  ORDEN_CATEGORIAS,
  TIPOS_MIEMBRO,
  bloquesPara,
  reglasDe,
  tituloFormularioPrincipal,
  type BloquesFormulario,
  type HojaSolicitud,
} from "../../domain/tiposMiembro";
import {
  casilla,
  encabezado,
  escapar,
  fecha,
  fila,
  filaDoble,
  firma,
  opciones,
  recuadro,
  unir,
  valor,
} from "./piezas";
import type { RecursosFormulario } from "./tipos";

/**
 * Maquetas de ficha: el formulario principal R-PGS1-1, común a todas las
 * categorías, y el formulario general PGS1-11, que es la hoja de solicitud de
 * los dependientes del titular y del socio fundador.
 */

/* ------------------------------------------------------------------ */
/* Recuadros compartidos                                               */
/* ------------------------------------------------------------------ */

/** Datos militares propios: grado, situación, promoción y, si aplica, fuerza. */
function filasMilitares(solicitud: SolicitudAfiliacion, bloques: BloquesFormulario): string {
  const { datos } = solicitud;
  const reglas = reglasDe(datos.tipoMiembro);
  return `
    ${fila("Grado militar", datos.gradoMilitar)}
    <tr><th>Estado</th><td class="libre">
      ${casilla("Activo", datos.situacion === "Activo")}
      ${casilla("Pasivo", datos.situacion === "Pasivo")}
    </td></tr>
    ${reglas?.requierePromocion ? fila("Promoción", datos.promocion) : ""}
    ${
      bloques.fuerza
        ? `<tr><th>Fuerza</th><td class="libre">${["Terrestre", "Naval", "Aérea"]
            .map((f) => casilla(f, datos.fuerza === f))
            .join("")}</td></tr>`
        : ""
    }`;
}

/** Socio principal del que depende la persona (cónyuge, padres, juvenil). */
function filasTitular(solicitud: SolicitudAfiliacion): string {
  const { datos } = solicitud;
  return `
    ${fila("Socio principal", nombreTitular(datos))}
    ${fila("Cédula del titular", datos.titularCedula)}
    ${fila("Socio N.º", datos.titularNumeroSocio)}
    ${fila("Vínculo del solicitante", datos.vinculoConTitular ?? "")}
    ${fila("Grado militar del titular", unir([datos.titularGradoMilitar, datos.titularSituacion ?? ""], " · "))}`;
}

/**
 * Recuadro «Datos personales», con los mismos campos y en el mismo orden que el
 * impreso. Se añaden el sexo y el estado civil, que el R-PGS1-1 no trae y que
 * la ficha del socio en SAFI necesita.
 *
 * La variante `compacta` agrupa los teléfonos en una sola fila —tal como está
 * en el PGS1-11 impreso— para que esa hoja quepa completa en una página. La
 * paginación de un formulario no es un detalle estético: una hoja partida en
 * dos deja la firma huérfana en un papel suelto.
 */
function bloqueDatosPersonales(
  solicitud: SolicitudAfiliacion,
  opcionesBloque: { compacto?: boolean } = {}
): string {
  const { datos } = solicitud;
  const edad = datos.fechaNacimiento ? calcularEdad(datos.fechaNacimiento) : null;

  const filas = [
    filaDoble(
      "Apellidos y nombres (completos)",
      nombreCompleto(datos),
      "Lugar y fecha de nacimiento",
      unir([datos.lugarNacimiento, fecha(datos.fechaNacimiento)], ", ")
    ),
    filaDoble(
      "N.º cédula de ciudadanía",
      datos.cedula,
      "Edad",
      edad !== null && edad >= 0 ? `${edad} años` : ""
    ),
    `<tr><td colspan="4" class="libre">
      ${opciones("SEXO", ["Masculino", "Femenino"], datos.sexo)}
    </td></tr>`,
    filaDoble("Tipo de sangre", datos.tipoSangre, "Estado civil", datos.estadoCivil),
    `<tr><th>Dirección domiciliaria</th><td colspan="3" class="libre">${
      escapar(datos.direccion) || "&nbsp;"
    }<br/><span style="font-size:6.8pt;color:#54657A">(provincia, cantón, calle principal, N.º y calle secundaria)</span></td></tr>`,
    filaDoble("Provincia", datos.provincia, "Ciudad", datos.ciudad),
  ];

  if (opcionesBloque.compacto) {
    filas.push(
      `<tr><th>Teléfonos</th><td colspan="3">${escapar(
        unir(
          [
            datos.telefonoDomicilio ? `Domicilio ${datos.telefonoDomicilio}` : "",
            datos.telefonoTrabajo ? `Trabajo ${datos.telefonoTrabajo}` : "",
            datos.celular ? `Celular ${datos.celular}` : "",
          ],
          " · "
        )
      ) || "&nbsp;"}</td></tr>`,
      filaDoble("Correo electrónico personal", datos.correo, "Profesión", datos.profesion),
      filaDoble("Lugar de trabajo", datos.lugarTrabajo, "Cargo", datos.cargo)
    );
  } else {
    filas.push(
      filaDoble("Teléfono domicilio", datos.telefonoDomicilio, "Teléfono trabajo", datos.telefonoTrabajo),
      filaDoble("Celular", datos.celular, "Correo electrónico personal", datos.correo),
      filaDoble("Profesión", datos.profesion, "Cargo", datos.cargo),
      `<tr><th>Lugar de trabajo</th><td colspan="3" class="libre">${
        escapar(datos.lugarTrabajo) || "&nbsp;"
      }</td></tr>`
    );
  }

  filas.push(
    filaDoble(
      "Fecha de ingreso al Club",
      fecha(datos.fechaIngresoClub || solicitud.creadaEn.slice(0, 10)),
      "Hobbie",
      datos.hobbie
    )
  );

  return recuadro("Datos personales", filas, 4);
}

const COLUMNAS_RECUADRO = `<colgroup><col style="width:38%"><col style="width:62%"></colgroup>`;

/* ------------------------------------------------------------------ */
/* R-PGS1-1 — formulario principal                                     */
/* ------------------------------------------------------------------ */

/**
 * El R-PGS1-1 de cualquier categoría.
 *
 * El impreso nació para los cadetes y su recuadro superior solo tiene la
 * casilla «Socio Activo (Oficial FAE)» con los datos militares. Al ser ahora
 * el formulario de todas las categorías, ese recuadro marca la que corresponde
 * y trae lo que ella necesita: los datos militares, el socio principal del que
 * depende o el oficial FAE del que es hijo.
 */
export function paginaPrincipal(solicitud: SolicitudAfiliacion, recursos: RecursosFormulario): string {
  const { datos } = solicitud;
  const tipo = datos.tipoMiembro ? CATALOGO_TIPOS[datos.tipoMiembro] : null;
  const bloques = bloquesPara(datos.tipoMiembro, datos.estadoCivil);
  const reglas = reglasDe(datos.tipoMiembro);

  const derecha: string[] = [];
  if (bloques?.datosMilitares) {
    derecha.push(`<table class="recuadro">${COLUMNAS_RECUADRO}${filasMilitares(solicitud, bloques)}</table>`);
  }
  if (bloques?.vinculoTitular) {
    derecha.push(`<table class="recuadro">${COLUMNAS_RECUADRO}${filasTitular(solicitud)}</table>`);
  }
  if (reglas?.requiereNumeroSocioActivo) {
    derecha.push(`<table class="recuadro">${COLUMNAS_RECUADRO}
      ${fila("Hijo de oficial FAE · N.º de socio activo", datos.numeroSocioActivo)}
    </table>`);
  }

  const superior = `<section class="seccion">
    <table class="recuadro"><colgroup><col style="width:42%"><col style="width:58%"></colgroup>
      <tr>
        <td class="libre" style="vertical-align:middle">
          <div style="font-size:7pt;color:#54657A;text-transform:uppercase;letter-spacing:.2px">Tipo de socio</div>
          <div style="margin-top:3px">${casilla(tipo?.glosaFormulario ?? "", Boolean(tipo))}</div>
          <div style="font-size:7pt;color:#54657A;margin-top:3px">${escapar(tipo?.categoria ?? "")}</div>
        </td>
        <td class="libre" style="padding:4px">${derecha.join('<div style="height:5px"></div>') || "&nbsp;"}</td>
      </tr>
      <tr><td colspan="2" class="libre" style="font-size:7.4pt;text-align:justify">
        Por la presente y reuniendo los requisitos establecidos por el COFAE, ${escapar(
          CLAUSULA_SOLICITUD.replace(/^por la presente y reuniendo los requisitos establecidos por el COFAE, /, "")
        )}
      </td></tr>
    </table>
  </section>`;

  const cabecera = `
    ${encabezado(recursos.logo, FORMULARIO_PRINCIPAL.codigo, FORMULARIO_PRINCIPAL.tituloRegistro)}
    <h1 class="titulo">${escapar(tituloFormularioPrincipal(datos.tipoMiembro))}</h1>
    ${superior}
  `;

  const cuerpo = `
    ${bloqueDatosPersonales(solicitud)}
    <p class="legal">${escapar(CLAUSULA_FORMULARIO)}</p>
  `;

  const rubrica = `
    <div class="zona-firmas">
      ${firma(recursos.firmaSolicitante, nombreCompleto(datos), `C.I. ${datos.cedula}`, "Firma socio")}
    </div>
  `;

  return cabecera + cuerpo + rubrica;
}

/* ------------------------------------------------------------------ */
/* PGS1-11 — hoja general de los dependientes del titular              */
/* ------------------------------------------------------------------ */

/**
 * Columna de tipos de socio del formulario PGS1-11, en el mismo orden y con las
 * mismas glosas que constan impresas.
 *
 * El impreso trae una línea «de ____» junto a cada categoría de dependiente
 * —cónyuge, padres, juvenil, D-A, D-B y D-C— para escribir de qué socio
 * depende. Se imprime en la casilla marcada, siempre, con el grado y el nombre
 * de ese socio (ver `socioDelQueDepende`); en blanco si aún no se sabe.
 */
function columnaTipos(solicitud: SolicitudAfiliacion): string {
  const seleccionado = solicitud.datos.tipoMiembro;
  const de = socioDelQueDepende(solicitud.datos);

  const grupos = ORDEN_CATEGORIAS.map((categoria) => {
    const tipos = TIPOS_MIEMBRO.map((codigo) => CATALOGO_TIPOS[codigo]).filter(
      (t) => t.categoria === categoria
    );
    if (tipos.length === 0) return "";
    const items = tipos
      .map((tipo) => {
        const marcada = tipo.codigo === seleccionado;
        const linea =
          marcada && de !== null
            ? `<div style="margin:1px 0 2px 14px">de ${valor(de)}</div>`
            : "";
        return `<div>${casilla(tipo.glosaFormulario, marcada)}</div>${linea}`;
      })
      .join("");
    return `<div style="margin-bottom:3px">
      <div style="font-size:6.8pt;color:#54657A;text-transform:uppercase;letter-spacing:.2px">${escapar(
        categoria
      )}</div>
      ${items}
    </div>`;
  }).join("");

  // La columna lista los dieciséis tipos del impreso: apretada, porque de su
  // altura depende que la hoja quepa completa en una página.
  return `<div style="flex:1.05;font-size:7.6pt;line-height:1.25">${grupos}</div>`;
}

/** Recuadro derecho: datos militares propios y vínculo con el socio principal. */
function columnaVinculo(solicitud: SolicitudAfiliacion, bloques: BloquesFormulario): string {
  const partes: string[] = [];

  if (bloques.datosMilitares) {
    partes.push(`<table class="recuadro">${COLUMNAS_RECUADRO}${filasMilitares(solicitud, bloques)}</table>`);
  }

  if (bloques.vinculoTitular) {
    partes.push(`<table class="recuadro" style="margin-top:6px">
      ${COLUMNAS_RECUADRO}
      <tr><th colspan="2" style="text-align:center;color:#08407D;font-weight:bold">Nombre del socio principal</th></tr>
      ${filasTitular(solicitud)}
    </table>`);
  }

  return `<div style="flex:1">${partes.join("")}</div>`;
}

export function paginasGeneral(
  solicitud: SolicitudAfiliacion,
  hoja: HojaSolicitud,
  recursos: RecursosFormulario
): string[] {
  const { datos } = solicitud;
  const bloques = bloquesPara(datos.tipoMiembro, datos.estadoCivil);
  if (!bloques) return [];

  const cabecera = `
    ${encabezado(recursos.logo, hoja.codigo, "Formulario ingreso socios")}
    <h1 class="titulo">Información del socio<br/><span style="font-size:9pt">Principal / Dependiente / Corresponsal y Particular</span></h1>
    <div style="display:flex; gap:12px; margin-top:8px">
      ${columnaTipos(solicitud)}
      ${columnaVinculo(solicitud, bloques)}
    </div>
  `;

  const cuerpo = `
    ${bloqueDatosPersonales(solicitud, { compacto: true })}
    <p class="legal">Por la presente y reuniendo los requisitos establecidos por el COFAE, ${escapar(
      CLAUSULA_SOLICITUD.replace(/^por la presente y reuniendo los requisitos establecidos por el COFAE, /, "")
    )}</p>
    <p class="legal">${escapar(CLAUSULA_FORMULARIO)}</p>
  `;

  const rubrica = `
    <div class="zona-firmas">
      ${firma(recursos.firmaSolicitante, nombreCompleto(datos), `C.I. ${datos.cedula}`, "Firma")}
    </div>
  `;

  return [cabecera + cuerpo + rubrica];
}
