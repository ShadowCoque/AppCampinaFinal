import { esEstadoCivilCasado, type TipoMiembro } from "./tiposMiembro";

/**
 * Tarifario del Club por tipo de socio.
 *
 * Transcripción literal de `FORMULARIOS_TIPO_DE_SOCIOS/CUOTAS TIPO SOCIOS.pdf`,
 * que es el documento que fija los valores vigentes. Cada tipo declara qué
 * modalidades de pago admite: no todos aceptan las mismas, y ahí está el motivo
 * de este archivo.
 *
 *   · El socio fundador no paga nada.
 *   · El particular B paga una sola cuota anual: no tiene mensualización.
 *   · El suscriptor de tenis paga anual o semestral, pero no mensual.
 *   · El suscriptor de gimnasio es el único con las cuatro periodicidades.
 *   · Los dependientes del titular (cónyuge, padres, juvenil) no pagan cuota
 *     propia: se facturan dentro de la del titular.
 *
 * El valor que la Jefatura de Socios confirma antes de crear el socio en SAFI
 * sale de aquí; ver `server/src/safi/campos.ts` para su correspondencia con las
 * listas cerradas del CRM.
 */

/* ------------------------------------------------------------------ */
/* Periodicidades                                                      */
/* ------------------------------------------------------------------ */

export const PERIODICIDADES = ["ANUAL", "MENSUAL", "TRIMESTRAL", "SEMESTRAL"] as const;

export type Periodicidad = (typeof PERIODICIDADES)[number];

/**
 * Etiqueta de cada periodicidad y su equivalente en la lista «Subscriciones»
 * (`cf_951`) de SAFI, que usa esas mismas cuatro palabras.
 */
export const PERIODICIDAD_META: Record<Periodicidad, { etiqueta: string; safi: string }> = {
  ANUAL: { etiqueta: "Anual", safi: "Anual" },
  MENSUAL: { etiqueta: "Mensual", safi: "Mensual" },
  TRIMESTRAL: { etiqueta: "Trimestral", safi: "Trimestral" },
  SEMESTRAL: { etiqueta: "Semestral", safi: "Semestral" },
};

/* ------------------------------------------------------------------ */
/* Tarifario                                                           */
/* ------------------------------------------------------------------ */

export type Tarifa = {
  /** Código con el que el tipo consta en el tarifario del Club (100–115). */
  codigoClub: string;
  /** Descripción del tarifario, que no siempre coincide con nuestro nombre. */
  descripcion: string;
  /** Valor de membresía por una sola vez. `null` cuando el tipo no la tiene. */
  membresia: number | null;
  /**
   * Valor de cada periodicidad admitida. Una periodicidad ausente del objeto es
   * una que ese tipo de socio no puede contratar: en el tarifario consta `N/A`.
   */
  cuotas: Partial<Record<Periodicidad, number>>;
};

/**
 * Clave del tarifario. El Dependiente B se desdobla por estado civil porque el
 * tarifario le fija dos valores distintos —240 el soltero, 420 el casado—,
 * igual que tiene dos formularios físicos distintos.
 */
export type ClaveTarifa = Exclude<TipoMiembro, "DB"> | "DB_SOLTERO" | "DB_CASADO";

export const TARIFARIO: Record<ClaveTarifa, Tarifa> = {
  SF: {
    codigoClub: "100",
    descripcion: "Fundadores",
    membresia: 0,
    cuotas: { ANUAL: 0, MENSUAL: 0 },
  },
  SA: {
    codigoClub: "101",
    descripcion: "Activos",
    membresia: 625,
    cuotas: { ANUAL: 288, MENSUAL: 24 },
  },

  // Los dependientes del socio titular no tienen cuota propia: el tarifario los
  // marca N/A porque quedan cubiertos por la del titular del que dependen.
  CONYUGE: { codigoClub: "112", descripcion: "Cónyuge", membresia: null, cuotas: {} },
  PADRES: {
    codigoClub: "111",
    descripcion: "Dependientes juveniles y padres",
    membresia: null,
    cuotas: {},
  },
  JUVENIL: {
    codigoClub: "111",
    descripcion: "Dependientes juveniles y padres",
    membresia: null,
    cuotas: {},
  },

  DA: {
    codigoClub: "102",
    descripcion: "Dependiente A",
    membresia: 0,
    cuotas: { ANUAL: 120, MENSUAL: 10 },
  },
  DB_SOLTERO: {
    codigoClub: "103",
    descripcion: "Dependiente B soltero",
    membresia: 0,
    cuotas: { ANUAL: 240, MENSUAL: 20 },
  },
  DB_CASADO: {
    codigoClub: "104",
    descripcion: "Dependiente B casado",
    membresia: 0,
    cuotas: { ANUAL: 420, MENSUAL: 35 },
  },
  DC: {
    codigoClub: "105",
    descripcion: "Dependiente C",
    membresia: 625,
    cuotas: { ANUAL: 600, MENSUAL: 50 },
  },

  PA: {
    codigoClub: "106",
    descripcion: "Particular A",
    membresia: 7000,
    cuotas: { ANUAL: 600, MENSUAL: 50 },
  },
  // El particular B se afilia por un año y solo para el titular: paga una cuota
  // anual única, sin membresía y sin posibilidad de mensualizar.
  PB: { codigoClub: "107", descripcion: "Particular B", membresia: null, cuotas: { ANUAL: 1200 } },

  CA: {
    codigoClub: "108",
    descripcion: "Corresponsal A",
    membresia: null,
    cuotas: { ANUAL: 480, MENSUAL: 40 },
  },
  CB: {
    codigoClub: "109",
    descripcion: "Corresponsal B",
    membresia: null,
    cuotas: { ANUAL: 240, MENSUAL: 20 },
  },
  CC: {
    codigoClub: "110",
    descripcion: "Corresponsal C",
    membresia: 3500,
    cuotas: { ANUAL: 540, MENSUAL: 45 },
  },

  // El suscriptor de tenis no tiene cuota mensual: paga anual o semestral.
  ST: {
    codigoClub: "113",
    descripcion: "Suscriptor tenis",
    membresia: 0,
    cuotas: { ANUAL: 450, SEMESTRAL: 240 },
  },
  SG: {
    codigoClub: "115",
    descripcion: "Suscriptor gimnasio",
    membresia: 0,
    cuotas: { ANUAL: 400, MENSUAL: 50, TRIMESTRAL: 130, SEMESTRAL: 250 },
  },
};

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

/** Clave del tarifario de una solicitud concreta, resolviendo el Dependiente B. */
export function claveTarifa(tipo: TipoMiembro | null, estadoCivil: string): ClaveTarifa | null {
  if (!tipo) return null;
  if (tipo === "DB") return esEstadoCivilCasado(estadoCivil) ? "DB_CASADO" : "DB_SOLTERO";
  return tipo;
}

export function tarifaDe(tipo: TipoMiembro | null, estadoCivil: string): Tarifa | null {
  const clave = claveTarifa(tipo, estadoCivil);
  return clave ? TARIFARIO[clave] : null;
}

/** Periodicidades que ese tipo de socio puede contratar, en orden de menú. */
export function periodicidadesDe(tipo: TipoMiembro | null, estadoCivil: string): Periodicidad[] {
  const tarifa = tarifaDe(tipo, estadoCivil);
  if (!tarifa) return [];
  return PERIODICIDADES.filter((p) => tarifa.cuotas[p] !== undefined);
}

/** Valor de una periodicidad concreta, o `null` si ese tipo no la admite. */
export function valorCuota(
  tipo: TipoMiembro | null,
  estadoCivil: string,
  periodicidad: Periodicidad
): number | null {
  return tarifaDe(tipo, estadoCivil)?.cuotas[periodicidad] ?? null;
}

/**
 * Cuota anual sugerida para la carta de compromiso. La carta reconoce siempre el
 * valor anual y, aparte, el mensualizado al que el socio puede acogerse.
 */
export function cuotaAnualSugerida(tipo: TipoMiembro | null, estadoCivil: string): number | null {
  return valorCuota(tipo, estadoCivil, "ANUAL");
}

export function cuotaMensualSugerida(tipo: TipoMiembro | null, estadoCivil: string): number | null {
  return valorCuota(tipo, estadoCivil, "MENSUAL");
}

export function membresiaSugerida(tipo: TipoMiembro | null, estadoCivil: string): number | null {
  return tarifaDe(tipo, estadoCivil)?.membresia ?? null;
}

/**
 * Formato con el que los valores viajan a SAFI y se muestran en el panel.
 * Las listas del CRM guardan los importes con dos decimales.
 */
export function formatearValor(valor: number): string {
  return valor.toFixed(2);
}
