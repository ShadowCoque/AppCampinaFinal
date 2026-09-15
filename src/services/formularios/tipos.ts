import type { Area } from "../../domain/solicitud";

/**
 * Recursos gráficos que necesita el generador de formularios.
 *
 * El dominio y las maquetas trabajan con `data:` URI ya resueltos: quien
 * construye el documento (`services/pdf.ts` en la aplicación, o el servidor
 * cuando regenera un formulario) es el responsable de leer los archivos del
 * expediente y convertirlos. Así las maquetas no dependen del sistema de
 * archivos y pueden ejecutarse igual en el dispositivo y en el servidor.
 */
export type RecursosFormulario = {
  /** Logotipo institucional como `data:` URI. Cadena vacía si no pudo cargarse. */
  logo: string;
  /** Firma del solicitante capturada en pantalla. */
  firmaSolicitante: string | null;
  /** Firmas de los socios garantes, en el mismo orden que `datos.garantes`. */
  firmasGarantes: (string | null)[];
  /**
   * Firma del funcionario de cada área, para las constancias del reverso.
   *
   * Solo las resuelve el servidor, que es quien tiene los archivos: la tableta
   * imprime el formulario antes de que exista ninguna constancia y pasa `{}`.
   */
  firmasFuncionarios: Partial<Record<Area, string | null>>;
};

export function recursosVacios(): RecursosFormulario {
  return { logo: "", firmaSolicitante: null, firmasGarantes: [], firmasFuncionarios: {} };
}
