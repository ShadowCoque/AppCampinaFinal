import { formatFechaHora } from "../../domain/fechas";
import {
  AREA_META,
  type Area,
  type ConstanciaTramite,
  type SolicitudAfiliacion,
} from "../../domain/solicitud";
import { reglasDe } from "../../domain/tiposMiembro";
import { encabezado, escapar, fecha, filaDoble } from "./piezas";
import type { RecursosFormulario } from "./tipos";

/**
 * Reverso del formulario: INFORMACIÓN INTERNA DEL CLUB.
 *
 * Es el mismo recuadro que hoy se llena a mano —fecha de registro, número de
 * socio, número de tarjeta y las tres constancias de Registrado, Revisado y
 * Aprobado— pero cada constancia se imprime con el nombre del funcionario que
 * la ejecutó y con la fecha y hora exactas en que lo hizo, que es justamente lo
 * que hoy no queda acreditado (informe CLC-TI-010, numerales 3 y 5.1).
 *
 * Cuando una constancia todavía no se ha cumplido, el recuadro se imprime vacío
 * y con la leyenda «Pendiente», igual que el formulario en papel.
 */

const REQUISITOS_CARNETIZACION = [
  "Cédula de ciudadanía",
  "Tarjeta militar (de ser el caso)",
  "Formulario de información del socio, lleno y firmado",
  "Credencial anterior (opcional)",
  "Factura de pago de la credencial (USD 5,00 c/u)",
  "Copia de la cédula del Oficial de FAE en caso de ser socio D-A o D-B",
];

function constancia(
  area: Area,
  registro: ConstanciaTramite | null,
  extra?: { etiqueta: string; valor: string }
): string {
  const meta = AREA_META[area];
  const cumplida = registro !== null;

  return `<div class="constancia${cumplida ? "" : " pendiente"}">
    <div class="accion">${escapar(capitalizar(meta.accion))}</div>
    <div class="rubrica">${escapar(cumplida ? registro.responsable : "Pendiente")}</div>
    <div class="cargo">${escapar(meta.cargo)}</div>
    <div class="momento">${cumplida ? escapar(formatFechaHora(registro.en)) : "&nbsp;"}</div>
    ${
      extra
        ? `<div class="momento" style="margin-top:6px"><strong>${escapar(
            extra.etiqueta
          )}</strong> ${escapar(extra.valor) || "____________"}</div>`
        : ""
    }
  </div>`;
}

function capitalizar(accion: string): string {
  // AREA_META declara el verbo en presente («REGISTRA»); el reverso lo imprime
  // en participio.
  switch (accion) {
    case "REGISTRA":
      return "Registrado";
    case "REVISA":
      return "Revisado";
    case "APRUEBA":
      return "Aprobado";
    default:
      return accion;
  }
}

function observacion(rotulo: string, texto: string | undefined): string {
  return `<div class="observacion">
    <div class="rotulo">${escapar(rotulo)}</div>
    <div class="texto">${escapar((texto ?? "").trim()) || "&nbsp;"}</div>
  </div>`;
}

export function paginaReverso(
  solicitud: SolicitudAfiliacion,
  recursos: RecursosFormulario,
  codigoRegistro: string
): string {
  const { tramite, datos } = solicitud;
  const reglas = reglasDe(datos.tipoMiembro);

  const numeros = `<table class="recuadro">
    <colgroup><col style="width:22%"><col style="width:28%"><col style="width:25%"><col style="width:25%"></colgroup>
    ${filaDoble(
      "Fecha de registro",
      fecha(tramite.fechaRegistro || solicitud.creadaEn.slice(0, 10)),
      "Número de socio",
      tramite.numeroSocio
    )}
    ${filaDoble(
      "Número de tarjeta",
      tramite.numeroTarjeta,
      reglas?.requiereNumeroSocioActivo ? "Número de socio activo" : "Tipo de trámite",
      reglas?.requiereNumeroSocioActivo ? datos.numeroSocioActivo : solicitud.codigo
    )}
  </table>`;

  return `
    ${encabezado(recursos.logo, codigoRegistro, "Información interna del Club")}
    <div class="interna-cabecera">Información interna del Club</div>
    ${numeros}

    <div class="constancias">
      ${constancia("SOCIOS", tramite.registro)}
      ${constancia(
        "CONTABILIDAD",
        tramite.revision,
        { etiqueta: "FC:", valor: tramite.revision?.numeroFactura ?? "" }
      )}
      ${constancia("GERENCIA", tramite.aprobacion)}
    </div>

    ${observacion("Observación Control de Socios", tramite.registro?.observacion)}
    ${observacion("Observación Contabilidad", tramite.revision?.observacion)}
    ${observacion("Observación Gerencia", tramite.aprobacion?.observacion)}

    <div class="requisitos">
      <strong>Requisitos para carnetización</strong>
      <ul>${REQUISITOS_CARNETIZACION.map((r) => `<li>${escapar(r)}</li>`).join("")}</ul>
      <div class="aviso-importante">
        ¡Importante! El socio titular debe obtener su tarjeta primero, para que puedan hacerlo sus dependientes.
      </div>
      Contáctese al correo electrónico: socios@clublacampina.com.ec
    </div>
  `;
}
