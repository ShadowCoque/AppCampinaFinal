import { CLAUSULA_FORMULARIO, CLAUSULA_SOLICITUD } from "../../domain/privacidad";
import {
  ESTADO_CIVIL_HIJO_META,
  conyugeEstaVacio,
  nombreCompleto,
  type SolicitudAfiliacion,
} from "../../domain/solicitud";
import {
  bloquesPara,
  type BloquesFormulario,
  type HojaSolicitud,
} from "../../domain/tiposMiembro";
import {
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
  valor,
} from "./piezas";
import type { RecursosFormulario } from "./tipos";

/**
 * Maqueta «SOLICITUD»: la hoja de solicitud de ingreso, en forma de carta
 * dirigida al Gerente del Club, que acompaña al R-PGS1-1 de los socios
 * dependientes (D-A, D-B, D-C), los particulares (P-A, P-B), los corresponsales
 * (C-A, C-B, C-C) y los suscriptores de tenis y gimnasio.
 *
 * El orden y la redacción reproducen la hoja impresa. Los recuadros de
 * cónyuge, hijos y garantes aparecen únicamente cuando la hoja de ese tipo de
 * socio los contiene.
 */

/** Opciones de estado civil tal como están impresas en el formulario. */
const ESTADO_CIVIL_IMPRESO = ["soltero", "casado", "viudo", "divorciado", "otros"] as const;

/** El formulario impreso agrupa unión de hecho bajo «otros». */
function estadoCivilImpreso(estadoCivil: string): string {
  switch (estadoCivil) {
    case "Soltero":
      return "soltero";
    case "Casado":
      return "casado";
    case "Viudo":
      return "viudo";
    case "Divorciado":
      return "divorciado";
    case "Unión de hecho":
      return "otros";
    default:
      return "";
  }
}

/**
 * Recuadro «DATOS PERSONALES ASPIRANTE».
 *
 * No repite la cédula del aspirante: la carta que lo encabeza ya dice «Yo, …
 * con C.I. …» (pedido del Coordinador, 23/09/2026). La del garante sí se
 * imprime, en su recuadro.
 */
function bloqueDatosPersonales(solicitud: SolicitudAfiliacion, bloques: BloquesFormulario): string {
  const { datos } = solicitud;

  const encabezadoCasillas = `<tr><td colspan="4" class="libre">
    ${opciones("ESTADO CIVIL", ESTADO_CIVIL_IMPRESO, estadoCivilImpreso(datos.estadoCivil))}
    ${opciones("SEXO", ["Masculino", "Femenino"], datos.sexo)}
  </td></tr>`;

  const filas = [
    encabezadoCasillas,
    filaDoble(
      "Lugar y fecha de nacimiento",
      unir([datos.lugarNacimiento, fecha(datos.fechaNacimiento)], ", "),
      "Mail",
      datos.correo
    ),
    filaDoble("Dirección de domicilio", datos.direccion, "Teléfono", datos.telefonoDomicilio),
    filaDoble("Ciudad", datos.ciudad, "Celular", datos.celular),
    filaDoble("Lugar de trabajo", datos.lugarTrabajo, "Teléfono", datos.telefonoTrabajo),
    `<tr><th>Ocupación</th><td colspan="3">${
      escapar(unir([datos.profesion, datos.cargo], ", ")) || "&nbsp;"
    }</td></tr>`,
  ];

  if (bloques.datosMilitares) {
    filas.push(
      filaDoble(
        "Grado militar",
        datos.gradoMilitar,
        "Situación",
        datos.situacion ?? ""
      )
    );
    filas.push(
      filaDoble("Fuerza", datos.fuerza ?? "", "Promoción", datos.promocion)
    );
  }

  return recuadro("Datos personales aspirante", filas, 4);
}

function bloqueConyuge(solicitud: SolicitudAfiliacion): string {
  const { conyuge } = solicitud.datos;
  if (conyugeEstaVacio(conyuge)) {
    // El recuadro se imprime igual, en blanco, para no alterar el formulario.
    return recuadro(
      "Datos del cónyuge",
      [
        filaDoble("Cédula", "", "Mail", ""),
        filaDoble("Apellidos", "", "Nombres", ""),
        filaDoble("Lugar y fecha de nacimiento", "", "Teléfono", ""),
        filaDoble("Lugar de trabajo", "", "Ocupación", ""),
        filaDoble("Celular", "", "", ""),
      ],
      4
    );
  }

  return recuadro(
    "Datos del cónyuge",
    [
      filaDoble("Cédula", conyuge.cedula, "Mail", conyuge.correo),
      filaDoble("Apellidos", conyuge.apellidos, "Nombres", conyuge.nombres),
      filaDoble(
        "Lugar y fecha de nacimiento",
        unir([conyuge.lugarNacimiento, fecha(conyuge.fechaNacimiento)], ", "),
        "Teléfono",
        conyuge.telefono
      ),
      filaDoble("Lugar de trabajo", conyuge.lugarTrabajo, "Ocupación", conyuge.ocupacion),
      filaDoble("Celular", conyuge.celular, "", ""),
    ],
    4
  );
}

function bloqueHijos(solicitud: SolicitudAfiliacion): string {
  const filas = solicitud.datos.hijos
    .filter((hijo) => hijo.apellidosNombres.trim())
    .map((hijo) => [
      hijo.apellidosNombres,
      fecha(hijo.fechaNacimiento),
      hijo.sexo === "Masculino" ? "M" : hijo.sexo === "Femenino" ? "F" : "",
      hijo.estadoCivil ? ESTADO_CIVIL_HIJO_META[hijo.estadoCivil].charAt(0) : "",
      hijo.correo,
    ]);

  return rejilla(
    "Datos hijos",
    [
      { texto: "Nombres", ancho: "38%" },
      { texto: "Fecha de nacimiento", ancho: "16%" },
      { texto: "Sexo (M / F)", ancho: "10%" },
      { texto: "Estado civil (S / C / D)", ancho: "13%" },
      { texto: "Mail", ancho: "23%" },
    ],
    filas,
    Math.max(4, filas.length)
  );
}

function bloqueGarantes(solicitud: SolicitudAfiliacion, recursos: RecursosFormulario): string {
  const { garantes } = solicitud.datos;
  if (garantes.length === 0) return "";

  const rotulo = garantes.length > 1 ? "Socios que le garantizan" : "Socio que le garantiza";

  const tarjetas = garantes
    .map((garante, indice) => {
      const filas = [
        fila("Nombres y apellidos", garante.apellidosNombres),
        fila("Cédula", garante.cedula),
        fila("Teléfono domicilio", garante.telefonoDomicilio),
        fila("Celular", garante.celular),
        fila("Socio N.º", garante.numeroSocio),
      ];
      const rubrica = firma(
        recursos.firmasGarantes[indice] ?? null,
        garante.apellidosNombres,
        garante.numeroSocio ? `Socio N.º ${garante.numeroSocio}` : "",
        "Firma del socio garante"
      );
      return `<div style="flex:1">
        <table class="recuadro">
          <colgroup><col style="width:38%"><col style="width:62%"></colgroup>
          ${filas.join("")}
        </table>
        <div class="zona-firmas" style="margin-top:10px">${rubrica}</div>
      </div>`;
    })
    .join("");

  return `<section class="seccion">
    <div class="rotulo">${escapar(rotulo)}</div>
    <div style="display:flex; gap:14px">${tarjetas}</div>
  </section>`;
}

/**
 * Construye las páginas de contenido del formulario (sin el reverso, que se
 * añade aparte). Devuelve un arreglo de bloques HTML, uno por página.
 */
export function paginasSolicitud(
  solicitud: SolicitudAfiliacion,
  hoja: HojaSolicitud,
  recursos: RecursosFormulario
): string[] {
  const { datos } = solicitud;
  const bloques = bloquesPara(datos.tipoMiembro, datos.estadoCivil);
  if (!bloques) return [];
  const fechaSolicitud = fecha(solicitud.creadaEn.slice(0, 10));

  const cabecera = `
    ${encabezado(recursos.logo, hoja.codigo, "Solicitud de ingreso")}
    <h1 class="titulo">${escapar(hoja.titulo)}</h1>
    <p class="parrafo">Fecha: ${valor(fechaSolicitud)}</p>
    <div class="destinatario">
      Señor<br/>
      <span class="cargo">GERENTE DEL CLUB LA CAMPIÑA</span><br/>
      Quito
    </div>
    <p class="parrafo">
      Yo, ${valor(nombreCompleto(datos), { ancho: true })} con C.I. ${valor(datos.cedula)},
      ${escapar(CLAUSULA_SOLICITUD)}
    </p>
    <p class="legal">${escapar(CLAUSULA_FORMULARIO)}</p>
  `;

  const cuerpo = [
    bloqueDatosPersonales(solicitud, bloques),
    bloques.conyuge ? bloqueConyuge(solicitud) : "",
    bloques.hijos ? bloqueHijos(solicitud) : "",
  ].join("");

  const rubricaSolicitante = `
    <div class="atentamente">Atentamente,</div>
    <div class="zona-firmas">
      ${firma(
        recursos.firmaSolicitante,
        nombreCompleto(datos),
        `C.I. ${datos.cedula}`,
        "Firma del solicitante"
      )}
    </div>
  `;

  const paginas = [cabecera + cuerpo + rubricaSolicitante];

  if (bloques.garantes > 0) {
    paginas.push(
      `${encabezado(recursos.logo, hoja.codigo, "Solicitud de ingreso")}
       ${bloqueGarantes(solicitud, recursos)}`
    );
  }

  return paginas;
}
