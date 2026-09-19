import type { OficialDependencia, SolicitudAfiliacion } from "../../../src/domain/solicitud";
import { normalizarNumeroSocio } from "../../../src/domain/texto";
import { reglasDe } from "../../../src/domain/tiposMiembro";
import type { AdaptadorSafi } from "./adaptador";
import type { AvisoSafi } from "./registro";

/**
 * Comprobación del oficial FAE del que depende un socio D-A o D-B, antes de
 * crear su ficha en SAFI.
 *
 * La tableta ya lo consulta al escribir el número, pero trabaja sin red: si
 * entonces no pudo, el trámite llega «sin verificar» y es aquí donde se
 * comprueba (decisión del Coordinador, 19/09/2026). Si el CRM dice que ese
 * número no existe o que no es de un Socio Activo ni de un Fundador, el alta
 * se detiene; si el CRM no se puede consultar, se avisa sin detenerla, para
 * que la Jefatura lo compruebe a mano.
 *
 * Devuelve además al oficial tal como consta en SAFI: su grado, nombres y
 * apellidos van al campo Parentesco de la ficha del D-A o D-B.
 */
export async function comprobarOficial(
  adaptador: AdaptadorSafi,
  solicitud: SolicitudAfiliacion
): Promise<{ avisos: AvisoSafi[]; oficial: OficialDependencia | null }> {
  const { datos } = solicitud;
  if (!reglasDe(datos.tipoMiembro)?.requiereNumeroSocioActivo) return { avisos: [], oficial: null };

  const numero = normalizarNumeroSocio(datos.numeroSocioActivo);
  const deLaTableta =
    datos.oficialDependencia?.numeroSocio === numero ? datos.oficialDependencia : null;

  const consulta = await adaptador
    .consultarOficial(numero)
    .catch((error: unknown) => ({
      consultado: false as const,
      motivo: error instanceof Error ? error.message : String(error),
    }));

  if (!consulta.consultado) {
    const yaVerificado = deLaTableta?.resultado === "VERIFICADO";
    return {
      avisos: yaVerificado
        ? []
        : [
            {
              campo: "numeroSocioActivo",
              etiqueta: "Oficial FAE sin verificar",
              valor: numero,
              bloquea: false,
              origen: "COHERENCIA",
              mensaje: `No se pudo comprobar en SAFI que el N.º ${numero} sea de un Socio Activo o de un Fundador (${consulta.motivo.replace(/\.$/, "")}). Compruébelo en el CRM antes de crear la ficha: su grado y su nombre van en el Parentesco.`,
            },
          ],
      oficial: yaVerificado ? deLaTableta : null,
    };
  }

  const { oficial } = consulta;
  if (oficial.resultado === "VERIFICADO") return { avisos: [], oficial };

  return {
    avisos: [
      {
        campo: "numeroSocioActivo",
        etiqueta: "El oficial no es Socio Activo ni Fundador",
        valor: numero,
        bloquea: true,
        origen: "COHERENCIA",
        mensaje:
          oficial.resultado === "NO_ENCONTRADO"
            ? `SAFI no tiene un socio con el N.º ${numero}. Un D-A o D-B depende de un Socio Activo o de un Fundador: corrija el número desde la tableta.`
            : `El N.º ${numero} es de ${[oficial.nombres, oficial.apellidos].join(" ").trim()}, socio ${oficial.tipoSocioSafi || "de otra categoría"}: no es Socio Activo ni Fundador. Corrija el número desde la tableta.`,
      },
    ],
    oficial,
  };
}
