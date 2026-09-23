import { formatFechaHora } from "../../../src/domain/fechas";
import type { SolicitudAfiliacion } from "../../../src/domain/solicitud";
import {
  REGLA_GARANTE,
  REGLA_META,
  REGLA_OFICIAL,
  estadoNoActivo,
  estadoReferencia,
  motivoRechazo,
  nombreConGrado,
  reglaDependencia,
  reglaTitular,
  rotuloDependencia,
  verificacionDe,
  type ReglaSocio,
  type VerificacionSocio,
} from "../../../src/domain/sociosSafi";
import { normalizarNumeroSocio } from "../../../src/domain/texto";
import { bloquesPara } from "../../../src/domain/tiposMiembro";
import type { AdaptadorSafi } from "./adaptador";
import type { AvisoSafi } from "./registro";

/**
 * Comprobación, antes de crear la ficha en SAFI, de los socios a los que el
 * trámite hace referencia: el socio del que depende un D-A, D-B o D-C, el
 * oficial FAE del que desciende un D-C (su abuelo, el de su Parentesco), el
 * titular de un cónyuge, unos padres o un juvenil, y los garantes.
 *
 * La tableta ya los consulta al escribir su número o su cédula, pero trabaja
 * sin red: si entonces no pudo, el trámite llega «sin verificar» y es aquí
 * donde se comprueba (decisión del Coordinador, 19/09/2026, ampliada a
 * titulares y garantes el 23/09/2026). Si el CRM dice que ese número no existe
 * o que no es de la categoría que el papel exige (`src/domain/sociosSafi.ts`),
 * el alta se detiene; si el CRM no se puede consultar, se avisa sin detenerla,
 * para que la Jefatura lo compruebe a mano.
 *
 * Lo que trae la tableta **nunca** se da por verificado: es un dato del
 * cliente. Solo cuenta lo que el servidor consulta aquí mismo, y es lo que va
 * al Parentesco de la ficha (ver `parentescoDe`).
 */

/** Una referencia del trámite, comprobada ahora en el CRM. */
export type ReferenciaComprobada = {
  /** Si el trámite tiene esta referencia. */
  aplica: boolean;
  /** Lo que SAFI dijo ahora; `null` si no aplica o si no se pudo consultar. */
  verificacion: VerificacionSocio | null;
};

export type ReferenciasComprobadas = {
  avisos: AvisoSafi[];
  /** El socio del que depende un D-A, D-B o D-C. */
  dependencia: ReferenciaComprobada;
  /** El titular de un cónyuge, unos padres o un juvenil. */
  titular: ReferenciaComprobada;
  /** El oficial FAE del que desciende un D-C: su abuelo, el de su Parentesco. */
  oficialFae: ReferenciaComprobada;
};

type Referencia = {
  campo: string;
  /** «el garante», «el socio titular»…: para los avisos. */
  papel: string;
  /** «Garante 1», «Socio titular»…: rótulo del aviso. */
  etiqueta: string;
  numero: string;
  regla: ReglaSocio;
  /** Lo que la tableta dijo de él, solo para mencionarlo. */
  deLaTableta: VerificacionSocio | null | undefined;
  /** Cédula que declaró la tableta, para contrastarla con la de SAFI. */
  cedulaDeclarada: string;
  /** Qué pasa en la ficha si no se puede comprobar. */
  sinComprobar: string;
  /** El «no encontrado» ya lo avisa otra comprobación. */
  omitirNoEncontrado?: boolean;
  /** Dónde se corrige, al final del aviso. Por omisión, en la tableta. */
  comoCorregir?: string;
};

const NO_APLICA: ReferenciaComprobada = { aplica: false, verificacion: null };

async function comprobarUna(
  adaptador: AdaptadorSafi,
  referencia: Referencia
): Promise<{ avisos: AvisoSafi[]; verificacion: VerificacionSocio | null }> {
  const { campo, etiqueta, numero, regla } = referencia;

  const consulta = await adaptador
    .consultarSocio({ numeroSocio: numero })
    .catch((error: unknown) => ({
      consultado: false as const,
      motivo: error instanceof Error ? error.message : String(error),
    }));

  // Sin consulta al CRM en este momento, lo que trae la tableta se enseña pero
  // NO se da por verificado: es un dato que llegó del cliente. Vacío antes que
  // equivocado. En modo API esto casi no ocurre —con SAFI caído tampoco se
  // podría dar de alta—, pero la regla no debe depender de eso.
  if (!consulta.consultado) {
    const tableta = referencia.deLaTableta;
    const segunLaTableta =
      tableta && estadoReferencia(tableta, numero, regla) === "VERIFICADO"
        ? ` La tableta lo había verificado el ${formatFechaHora(tableta.en)} (${nombreConGrado(
            tableta
          )}), pero ahora no se puede volver a comprobar.`
        : "";
    return {
      avisos: [
        {
          campo,
          etiqueta: `${etiqueta} sin verificar`,
          valor: numero,
          bloquea: false,
          origen: "COHERENCIA",
          mensaje: `No se pudo comprobar en SAFI que el N.º ${numero} sea de ${
            REGLA_META[regla].exige
          } (${consulta.motivo.replace(/\.$/, "")}).${segunLaTableta} Compruébelo en el CRM antes de crear la ficha${
            referencia.sinComprobar
          }.`,
        },
      ],
      verificacion: null,
    };
  }

  const verificacion = verificacionDe(regla, numero, consulta.socio);
  const avisos: AvisoSafi[] = [];

  const rechazo = motivoRechazo(verificacion, numero, regla, referencia.papel);
  const noEncontrado = verificacion.resultado === "NO_ENCONTRADO";
  if (rechazo && !(noEncontrado && referencia.omitirNoEncontrado)) {
    avisos.push({
      campo,
      etiqueta: noEncontrado ? `${etiqueta}: no está en SAFI` : `${etiqueta}: no corresponde`,
      valor: numero,
      bloquea: true,
      origen: "COHERENCIA",
      mensaje: `${rechazo} ${referencia.comoCorregir ?? "Corríjalo desde la tableta."}`,
    });
  }

  if (!rechazo) {
    const cedulaSafi = verificacion.cedula ?? "";
    const declarada = referencia.cedulaDeclarada.replace(/\D/g, "");
    if (cedulaSafi && declarada && cedulaSafi !== declarada) {
      avisos.push({
        campo,
        etiqueta: `${etiqueta}: cédula distinta a la de SAFI`,
        valor: declarada,
        bloquea: false,
        origen: "COHERENCIA",
        mensaje: `El trámite declara la C.I. ${declarada} y el socio N.º ${numero} tiene en SAFI la ${cedulaSafi} (${nombreConGrado(
          verificacion
        )}). Compruebe que sea la misma persona.`,
      });
    }

    // Informa, no detiene: un estado distinto de «Activo» es frecuente en el
    // CRM (el 23/09/2026, 1.116 fichas «Inactivo»).
    const estado = estadoNoActivo(verificacion);
    if (estado) {
      avisos.push({
        campo,
        etiqueta: `${etiqueta}: estado «${estado}» en SAFI`,
        valor: numero,
        bloquea: false,
        origen: "COHERENCIA",
        mensaje: `En SAFI, el socio N.º ${numero} (${nombreConGrado(
          verificacion
        )}) tiene el estado «${estado}». No impide crear la ficha; es para tenerlo en cuenta.`,
      });
    }
  }

  return { avisos, verificacion };
}

/** Comprueba en el CRM todas las referencias del trámite, a la vez. */
export async function comprobarReferencias(
  adaptador: AdaptadorSafi,
  solicitud: SolicitudAfiliacion
): Promise<ReferenciasComprobadas> {
  const { datos } = solicitud;

  const reglaDep = reglaDependencia(datos.tipoMiembro);
  const numeroDep = normalizarNumeroSocio(datos.numeroSocioActivo);
  const dependencia =
    reglaDep && numeroDep
      ? comprobarUna(adaptador, {
          campo: "numeroSocioActivo",
          papel: reglaDep === "DEPENDIENTE_B" ? "el socio del que depende un D-C" : "el oficial del que depende",
          etiqueta: rotuloDependencia(datos.tipoMiembro),
          numero: numeroDep,
          regla: reglaDep,
          deLaTableta: datos.oficialDependencia,
          cedulaDeclarada: "",
          // En un D-C, el D-B del que depende no va al Parentesco: va el
          // oficial del que desciende, que se comprueba aparte.
          sinComprobar:
            reglaDep === "DEPENDIENTE_B"
              ? ""
              : ": el Parentesco quedará vacío y habrá que escribirlo a mano",
        })
      : null;

  // El oficial FAE del que desciende un D-C —su abuelo—, que es el que va a su
  // Parentesco (Coordinador, 23/09/2026). Si nadie lo ha indicado, el alta no
  // sigue: la Jefatura lo escribe en el panel, que es donde se resuelve.
  const esDC = datos.tipoMiembro === "DC";
  const numeroOficial = normalizarNumeroSocio(datos.numeroOficialFae ?? "");
  const oficialFae =
    esDC && numeroOficial
      ? comprobarUna(adaptador, {
          campo: "numeroOficialFae",
          papel: "el oficial FAE del que desciende",
          etiqueta: "Oficial FAE (abuelo)",
          numero: numeroOficial,
          regla: REGLA_OFICIAL,
          deLaTableta: datos.oficialFaeVerificado,
          cedulaDeclarada: "",
          sinComprobar: ": el Parentesco quedará vacío y habrá que escribirlo a mano",
          comoCorregir: "Corrija el número en este panel o desde la tableta.",
        })
      : null;
  const faltaOficial: AvisoSafi[] =
    esDC && !numeroOficial
      ? [
          {
            campo: "numeroOficialFae",
            etiqueta: "Falta el oficial FAE del que desciende",
            valor: "",
            bloquea: true,
            origen: "COHERENCIA",
            mensaje:
              "Escriba el número de socio del oficial FAE del que desciende este D-C —el padre o la madre de su socio D-B, Activo o Fundador—. Su grado y su nombre van al Parentesco de la ficha, que no puede quedar con el del D-B.",
          },
        ]
      : [];

  const reglaTit = reglaTitular(datos.tipoMiembro);
  const numeroTit = normalizarNumeroSocio(datos.titularNumeroSocio);
  const titular =
    reglaTit && numeroTit
      ? comprobarUna(adaptador, {
          campo: "titularNumeroSocio",
          papel: "el titular",
          etiqueta: "Socio titular",
          numero: numeroTit,
          regla: reglaTit,
          deLaTableta: datos.titularVerificado,
          cedulaDeclarada: datos.titularCedula,
          sinComprobar: ": el Parentesco se compondrá con los datos escritos en la tableta",
          // Sin titular en SAFI no hay Cuenta a la que colgarlo, y de eso ya
          // avisa `verificar`, con un aviso que también detiene el alta.
          omitirNoEncontrado: true,
        })
      : null;

  const cuantos = bloquesPara(datos.tipoMiembro, datos.estadoCivil)?.garantes ?? 0;
  const garantes = datos.garantes.slice(0, cuantos).map((garante, indice) => {
    const numero = normalizarNumeroSocio(garante.numeroSocio);
    if (!numero) return null;
    return comprobarUna(adaptador, {
      campo: `garante-${indice}`,
      papel: "el garante",
      etiqueta: cuantos > 1 ? `Garante ${indice + 1}` : "Garante",
      numero,
      regla: REGLA_GARANTE,
      deLaTableta: garante.verificacion,
      cedulaDeclarada: garante.cedula,
      sinComprobar: "",
    });
  });

  const [deDependencia, delOficial, delTitular, ...deGarantes] = await Promise.all([
    dependencia,
    oficialFae,
    titular,
    ...garantes,
  ]);

  return {
    avisos: [
      ...faltaOficial,
      ...[deDependencia, delOficial, delTitular, ...deGarantes].flatMap((resultado) => resultado?.avisos ?? []),
    ],
    dependencia: reglaDep ? { aplica: true, verificacion: deDependencia?.verificacion ?? null } : NO_APLICA,
    titular: reglaTit ? { aplica: true, verificacion: delTitular?.verificacion ?? null } : NO_APLICA,
    oficialFae: esDC ? { aplica: true, verificacion: delOficial?.verificacion ?? null } : NO_APLICA,
  };
}
