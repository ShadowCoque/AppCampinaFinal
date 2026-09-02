import { calcularEdad } from "../../domain/fechas";
import { CLAUSULA_FORMULARIO, CLAUSULA_SOLICITUD } from "../../domain/privacidad";
import { nombreCompleto, nombreTitular, type SolicitudAfiliacion } from "../../domain/solicitud";
import type { BloquesFormulario, VarianteFormulario } from "../../domain/tiposMiembro";
import { CATALOGO_TIPOS, ORDEN_CATEGORIAS, TIPOS_MIEMBRO } from "../../domain/tiposMiembro";
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
  rejilla,
  unir,
} from "./piezas";
import type { RecursosFormulario } from "./tipos";

/**
 * Maqueta «FICHA»: el formulario general de ingreso de socios (PGS1-11) y el
 * formulario del socio activo (R-PGS1-1).
 *
 * A diferencia de la maqueta de solicitud, la ficha se encabeza con la columna
 * de tipos de socio —donde se marca el que corresponde— y, para los
 * dependientes, con el nombre y el grado militar del socio principal.
 */

/**
 * Columna de tipos de socio del formulario PGS1-11, en el mismo orden y con las
 * mismas glosas que constan impresas.
 */
function columnaTipos(solicitud: SolicitudAfiliacion): string {
  const seleccionado = solicitud.datos.tipoMiembro;

  const grupos = ORDEN_CATEGORIAS.map((categoria) => {
    const tipos = TIPOS_MIEMBRO.map((codigo) => CATALOGO_TIPOS[codigo]).filter(
      (t) => t.categoria === categoria && t.formularios.length > 0
    );
    if (tipos.length === 0) return "";
    const items = tipos
      .map(
        (tipo) =>
          `<div style="margin:1px 0">${casilla(
            tipo.glosaFormulario,
            tipo.codigo === seleccionado
          )}</div>`
      )
      .join("");
    return `<div style="margin-bottom:4px">
      <div style="font-size:7pt;color:#54657A;text-transform:uppercase;letter-spacing:.2px">${escapar(
        categoria
      )}</div>
      ${items}
    </div>`;
  }).join("");

  return `<div style="flex:1.05">${grupos}</div>`;
}

/** Recuadro derecho: datos militares propios y vínculo con el socio principal. */
function columnaVinculo(solicitud: SolicitudAfiliacion, bloques: BloquesFormulario): string {
  const { datos } = solicitud;
  const partes: string[] = [];

  const COLUMNAS = `<colgroup><col style="width:38%"><col style="width:62%"></colgroup>`;

  if (bloques.datosMilitares) {
    partes.push(`<table class="recuadro">
      ${COLUMNAS}
      ${fila("Grado militar", datos.gradoMilitar)}
      ${fila("Promoción", datos.promocion)}
      <tr><th>Estado</th><td class="libre">
        ${casilla("Activo", datos.situacion === "Activo")}
        ${casilla("Pasivo", datos.situacion === "Pasivo")}
      </td></tr>
      ${
        bloques.fuerza
          ? `<tr><th>Fuerza</th><td class="libre">${["Terrestre", "Naval", "Aérea"]
              .map((f) => casilla(f, datos.fuerza === f))
              .join("")}</td></tr>`
          : ""
      }
    </table>`);
  }

  if (bloques.vinculoTitular) {
    partes.push(`<table class="recuadro" style="margin-top:6px">
      ${COLUMNAS}
      <tr><th colspan="2" style="text-align:center;color:#08407D;font-weight:bold">Nombre del socio principal</th></tr>
      ${fila("Apellidos y nombres", nombreTitular(datos))}
      ${fila("Cédula", datos.titularCedula)}
      ${fila("Socio N.º", datos.titularNumeroSocio)}
      ${fila("Vínculo del solicitante", datos.vinculoConTitular ?? "")}
      ${fila("Grado militar del titular", datos.titularGradoMilitar)}
      ${fila("Situación", datos.titularSituacion ?? "")}
    </table>`);
  }

  return `<div style="flex:1">${partes.join("")}</div>`;
}

function bloqueDatosPersonales(solicitud: SolicitudAfiliacion, bloques: BloquesFormulario): string {
  const { datos } = solicitud;
  const edad = datos.fechaNacimiento ? calcularEdad(datos.fechaNacimiento) : null;

  const filas = [
    filaDoble(
      "Apellidos y nombres (completos)",
      nombreCompleto(datos),
      "Lugar y fecha de nacimiento",
      unir([datos.lugarNacimiento, fecha(datos.fechaNacimiento)], " — ")
    ),
    filaDoble(
      "N.º cédula de ciudadanía",
      datos.cedula,
      "Edad",
      edad !== null && edad >= 0 ? `${edad} años` : ""
    ),
    filaDoble(
      "Tipo de sangre",
      bloques.tipoSangre ? datos.tipoSangre : "",
      "Estado civil",
      datos.estadoCivil
    ),
    `<tr><th>Dirección domiciliaria</th><td colspan="3" class="libre">${escapar(
      datos.direccion
    ) || "&nbsp;"}<br/><span style="font-size:6.8pt;color:#54657A">(provincia, cantón, calle principal, N.º y calle secundaria)</span></td></tr>`,
    filaDoble("Ciudad", datos.ciudad, "Correo electrónico personal", datos.correo),
    filaDoble("Teléfono domicilio", datos.telefonoDomicilio, "Teléfono trabajo", datos.telefonoTrabajo),
    filaDoble("Celular", datos.celular, "Cargo", datos.cargo),
    filaDoble("Profesión", datos.profesion, "Hobbie", bloques.hobbie ? datos.hobbie : ""),
    `<tr><th>Lugar de trabajo</th><td colspan="3" class="libre">${escapar(datos.lugarTrabajo) || "&nbsp;"}</td></tr>`,
  ];

  if (bloques.fechaIngresoClub) {
    filas.push(
      filaDoble(
        "Fecha de ingreso al Club",
        fecha(datos.fechaIngresoClub || solicitud.creadaEn.slice(0, 10)),
        "Tipo de socio",
        datos.tipoMiembro ? CATALOGO_TIPOS[datos.tipoMiembro].nombre : ""
      )
    );
  }

  if (bloques.sexo) {
    filas.push(
      `<tr><td colspan="4" class="libre">${opciones(
        "SEXO",
        ["Masculino", "Femenino"],
        datos.sexo
      )}</td></tr>`
    );
  }

  return recuadro("Datos personales", filas, 4);
}

/** Listado «Dependientes a su cargo» del formulario del socio activo. */
function bloqueDependientes(solicitud: SolicitudAfiliacion): string {
  const filas = solicitud.datos.dependientesACargo
    .filter((d) => d.apellidosNombres.trim())
    .map((d, indice) => [`${indice + 1}.- ${d.apellidosNombres}`, d.vinculo ?? ""]);

  return rejilla(
    "Dependientes a su cargo (solo lo que aplica)",
    [
      { texto: "Apellidos y nombres", ancho: "70%" },
      { texto: "Padres / Cónyuge / Juvenil (hijo < 21 años)", ancho: "30%" },
    ],
    filas,
    6
  );
}

export function paginasFicha(
  solicitud: SolicitudAfiliacion,
  variante: VarianteFormulario,
  recursos: RecursosFormulario
): string[] {
  const { datos } = solicitud;
  const bloques = variante.bloques;

  const superior =
    bloques.vinculoTitular || bloques.datosMilitares
      ? `<div style="display:flex; gap:12px; margin-top:8px">
           ${bloques.vinculoTitular ? columnaTipos(solicitud) : ""}
           ${columnaVinculo(solicitud, bloques)}
         </div>`
      : "";

  const cabecera = `
    ${encabezado(recursos.logo, variante.codigo, "Formulario de ingreso de socios")}
    <h1 class="titulo">${escapar(variante.titulo)}</h1>
    ${superior}
  `;

  const cuerpo = [
    bloqueDatosPersonales(solicitud, bloques),
    bloques.dependientesACargo ? bloqueDependientes(solicitud) : "",
    `<p class="parrafo">Por la presente y reuniendo los requisitos establecidos por el COFAE, ${escapar(
      CLAUSULA_SOLICITUD.replace(/^por la presente y reuniendo los requisitos establecidos por el COFAE, /, "")
    )}</p>`,
    `<p class="legal">${escapar(CLAUSULA_FORMULARIO)}</p>`,
  ].join("");

  const rubrica = `
    <div class="zona-firmas">
      ${firma(
        recursos.firmaSolicitante,
        nombreCompleto(datos),
        `C.I. ${datos.cedula}`,
        "Firma del socio"
      )}
    </div>
  `;

  return [cabecera + cuerpo + rubrica];
}
