import { formatFechaLarga } from "../../domain/fechas";
import { nombreCompleto, type SolicitudAfiliacion } from "../../domain/solicitud";
import type { ModeloCarta, TipoMiembro } from "../../domain/tiposMiembro";
import { encabezado, escapar, firma, lugarYFecha, valor } from "./piezas";
import type { RecursosFormulario } from "./tipos";

/**
 * Cartas de compromiso que acompañan a la solicitud de ingreso.
 *
 * Las dos están transcritas literalmente de los originales que reposan en
 * `FORMULARIOS_TIPO_DE_SOCIOS/`: la del socio particular en `SOCIOS
 * PARTICULARES A & B/` y la del socio dependiente en `SOCIOS DEPENDIENTES A/`,
 * que es una sola para los tres tipos de dependiente. Los espacios en blanco
 * del documento en papel se llenan con los datos que la aplicación captura en
 * el paso «Carta de compromiso».
 *
 * Diferencias entre las dos, que se reflejan en el documento generado: la del
 * particular cita la sesión del Directorio que autorizó el ingreso y lleva dos
 * garantes; la del dependiente no cita sesión y lleva uno.
 */

function desglosarFecha(iso: string): { dia: string; mes: string; anio: string } {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!partes) return { dia: "", mes: "", anio: "" };
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
  return {
    dia: String(Number(partes[3])),
    mes: meses[Number(partes[2]) - 1] ?? "",
    anio: partes[1],
  };
}

function medioDePago(solicitud: SolicitudAfiliacion): string {
  const carta = solicitud.datos.carta;
  if (!carta) return "";

  if (carta.numeroCuenta.trim()) {
    const tipo = carta.tipoCuenta === "CORRIENTE" ? "corriente" : "de ahorros";
    return `de mi cuenta ${tipo} del banco/cooperativa ${valor(carta.entidadFinanciera)},
            Nro. ${valor(carta.numeroCuenta)}`;
  }
  return `de mi tarjeta de crédito Nro. ${valor(carta.tarjetaCredito)},
          con fecha de caducidad ${valor(carta.caducidadTarjeta)}`;
}

/** Carta de compromiso del socio particular (transcripción del original). */
function cuerpoParticular(solicitud: SolicitudAfiliacion): string {
  const { datos } = solicitud;
  const carta = datos.carta;
  if (!carta) return "";

  const sesion = desglosarFecha(carta.fechaSesionDirectorio);
  const hoy = desglosarFecha(solicitud.creadaEn.slice(0, 10));
  const categoria = datos.tipoMiembro === "PA" ? "A" : datos.tipoMiembro === "PB" ? "B" : "";
  const numeroSocio = solicitud.tramite.numeroSocio;

  return `
    <p>
      Yo, ${valor(nombreCompleto(datos), { ancho: true })}, con C.C. ${valor(datos.cedula)},
      de nacionalidad ${valor(carta.nacionalidad)}, por mis propios derechos y voluntad propia,
      una vez autorizado en sesión del Directorio de fecha ${valor(sesion.dia)} de
      ${valor(sesion.mes)} de ${valor(sesion.anio)}, el ingreso en la categoría de Socio
      Particular ${valor(categoria)}, con número de socio ${valor(numeroSocio)}, en el Club
      Social y Deportivo de Oficiales de la Fuerza Aérea Ecuatoriana – Club la Campiña, a los
      ${valor(hoy.dia)} días del mes de ${valor(hoy.mes)} de ${valor(hoy.anio)}, me comprometo a
      acogerme a los términos y condiciones estipulados en el Estatuto y reglamentos internos del
      Club así como en sus posibles modificaciones futuras y disposiciones de la Administración o
      el Directorio, haciendo un uso correcto de la credencial de socio, siendo ésta en todo
      momento personal e intransferible; cumplir con las normas de uso que exige cada área del
      Club; respetar los horarios de atención de las diferentes áreas; responsabilizarme de los
      actos y comportamientos de mis invitados, debiendo cancelar los valores correspondientes de
      uso de las instalaciones en la prevención y en las áreas que prestan los diferentes
      servicios.
    </p>
    <p>
      Además, soy consciente de mi obligación en cancelar puntualmente los valores por cuota de
      mantenimiento anual correspondiente y a los valores que fueran establecidos por la
      Administración o el Directorio, con lo cual tendré derecho al uso exclusivo de las
      instalaciones del Club y sus servicios. Por lo tanto, en caso de falta o inobservancia a
      este compromiso AUTORIZO al Club el débito automático ${medioDePago(solicitud)}.
      En caso de no existir fondos en ambas modalidades de pago, la responsabilidad será
      compartida solidariamente con los señores Garantes en calidad de Codeudores.
    </p>
    <p>
      Reconozco que el valor de mi cuota de mantenimiento anual es de USD.
      ${valor(carta.cuotaAnual)}, al que puedo acogerme mediante un pago mensualizado con las
      entidades financieras que el Club proporcione la facilidad, representando un valor de USD.
      ${valor(carta.cuotaMensualizada)} en caso acogerme al pago mensualizado y de existir un
      deseo de desafiliación voluntaria me comprometo a cancelar el valor restante del año en
      curso para que la misma sea aprobada por la administración.
    </p>
    <p>
      De igual forma autorizo al Club el uso de mis datos personales, así como imágenes que sean
      registrados por el Club la Campiña.
    </p>
  `;
}

/**
 * Carta de compromiso del socio dependiente (transcripción del original).
 *
 * Es una sola carta para los tres tipos —D-A, D-B y D-C—, tal como la entregó
 * el Club en `SOCIOS DEPENDIENTES A/CARTA DE COMPROMISO DEPENDIENTES.docx`; lo
 * único que cambia entre ellos es la categoría que se escribe en el primer
 * párrafo.
 *
 * A diferencia de la del socio particular, esta no menciona la sesión del
 * Directorio y lleva un solo garante.
 */
function cuerpoDependiente(solicitud: SolicitudAfiliacion): string {
  const { datos } = solicitud;
  const carta = datos.carta;
  if (!carta) return "";

  const hoy = desglosarFecha(solicitud.creadaEn.slice(0, 10));
  const categoria = datos.tipoMiembro ? CATEGORIA_DEPENDIENTE[datos.tipoMiembro] ?? "" : "";
  const numeroSocio = solicitud.tramite.numeroSocio;

  return `
    <p>
      Yo, ${valor(nombreCompleto(datos), { ancho: true })}, con C.C. ${valor(datos.cedula)},
      de nacionalidad ${valor(carta.nacionalidad)}, por mis propios derechos y voluntad propia,
      una vez autorizado el ingreso en la categoría ${valor(categoria)}, con número de socio
      ${valor(numeroSocio)}, en el Club Social y Deportivo de Oficiales de la Fuerza Aérea
      Ecuatoriana – Club la Campiña, a los ${valor(hoy.dia)} días del mes de ${valor(hoy.mes)}
      de ${valor(hoy.anio)}, me comprometo a acogerme a los términos y condiciones estipulados en
      el Estatuto y reglamentos internos del Club así como en sus posibles modificaciones futuras
      y disposiciones de la Administración o el Directorio, haciendo un uso correcto de la
      credencial de socio, siendo ésta en todo momento personal e intransferible; cumplir con las
      normas de uso que exige cada área del Club; respetar los horarios de atención de las
      diferentes áreas; responsabilizarme de los actos y comportamientos de mis invitados,
      debiendo cancelar los valores correspondientes de uso de las instalaciones en la prevención
      y en las áreas que prestan los diferentes servicios.
    </p>
    <p>
      Además, soy consciente de mi obligación en cancelar puntualmente los valores por cuota de
      mantenimiento anual correspondiente y a los valores que fueran establecidos por la
      Administración o el Directorio, con lo cual tendré derecho al uso exclusivo de las
      instalaciones del Club y sus servicios. Por lo tanto, en caso de faltar o inobservar a este
      compromiso AUTORIZO al Club, el débito automático ${medioDePago(solicitud)}. En caso de no
      existir fondos en ambas modalidades de pago, la responsabilidad será compartida con los
      señores Garantes en calidad de Codeudores solidarios.
    </p>
    <p>
      Reconozco que el valor de mi cuota de mantenimiento anual es de USD,
      ${valor(carta.cuotaAnual)}, al que puedo acogerme mediante un pago mensualizado con las
      entidades financieras que el Club proporcione la facilidad, representando un valor de USD.
      ${valor(carta.cuotaMensualizada)}, en caso acogerme al pago mensualizado y de existir un
      deseo de desafiliación voluntaria me comprometo a cancelar el valor restante del año en
      curso para que la misma sea aprobada por la administración.
    </p>
    <p>
      De igual forma autorizo al Club el uso de mis datos personales, así como imágenes que sean
      registrados por el Club la Campiña.
    </p>
  `;
}

/** Categoría que se escribe en el primer párrafo de la carta del dependiente. */
const CATEGORIA_DEPENDIENTE: Partial<Record<TipoMiembro, string>> = {
  DA: "Socio Dependiente A",
  DB: "Socio Dependiente B",
  DC: "Socio Dependiente C",
};

const TITULO: Record<ModeloCarta, string> = {
  PARTICULAR: "CARTA DE COMPROMISO SOCIO PARTICULAR",
  DEPENDIENTE: "CARTA DE COMPROMISO SOCIO DEPENDIENTE",
};

export function paginaCarta(
  solicitud: SolicitudAfiliacion,
  recursos: RecursosFormulario
): string | null {
  const carta = solicitud.datos.carta;
  if (!carta) return null;

  const cuerpo =
    carta.modelo === "PARTICULAR" ? cuerpoParticular(solicitud) : cuerpoDependiente(solicitud);

  const firmasGarantes = solicitud.datos.garantes
    .map((garante, indice) =>
      firma(
        recursos.firmasGarantes[indice] ?? null,
        garante.apellidosNombres,
        `C.I. ${garante.cedula || "____________"}`,
        "Garante"
      )
    )
    .join("");

  return `
    ${encabezado(recursos.logo, "Carta de compromiso", "Anexo a la solicitud de ingreso")}
    <div class="carta">
      <div class="titulo-carta">${escapar(TITULO[carta.modelo])}</div>
      ${cuerpo}
      <p style="margin-top:20px">Atentamente,</p>
      <div class="zona-firmas">
        ${firma(
          recursos.firmaSolicitante,
          nombreCompleto(solicitud.datos),
          `C.I. ${solicitud.datos.cedula}`,
          "Titular"
        )}
        ${firmasGarantes}
      </div>
      <p style="margin-top:16px; font-size:7.6pt; color:#54657A">
        ${escapar(lugarYFecha(solicitud.creadaEn))}${
          carta.aceptadaEn
            ? ` · Aceptada electrónicamente el ${escapar(formatFechaLarga(carta.aceptadaEn.slice(0, 10)))}`
            : ""
        }
      </p>
    </div>
  `;
}
