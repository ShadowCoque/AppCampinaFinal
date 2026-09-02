/**
 * Integración con el Sistema Nacional de Identificación Ciudadana (SNIC) de la
 * Dirección General de Registro Civil, Identificación y Cedulación (DIGERCIC).
 *
 * El socio ingresa únicamente su número de cédula; la consulta al SNIC devuelve
 * el resto de su información de identidad y, en el nivel biométrico, su
 * fotografía y su firma registradas, lo que permite verificar que la persona
 * presente es efectivamente el titular del documento.
 *
 * ESTADO: pendiente del contrato de adhesión con el DIGERCIC (actividades V-5 y
 * S-1 a S-3 del informe CLC-TI-009). Mientras no esté vigente, `NIVEL_ACCESO`
 * permanece en "NO_DISPONIBLE" y la aplicación pide los datos manualmente.
 *
 * El contrato exacto de los campos se define en la “ficha técnica de
 * interoperabilidad SNIC” que entrega el DIGERCIC al habilitar el servicio; el
 * mapeo de `DatosSnic` a los campos del formulario se ajusta en un solo lugar
 * (`aplicarDatosSnic`).
 */

import type { DatosAfiliacion } from "./solicitud";
import { ESTADOS_CIVILES } from "./tiposMiembro";

/* ------------------------------------------------------------------ */
/* Configuración del servicio                                          */
/* ------------------------------------------------------------------ */

export const NIVELES_ACCESO = ["NO_DISPONIBLE", "DEMOGRAFICO", "DEMOGRAFICO_BIOMETRICO"] as const;

export type NivelAccesoSnic = (typeof NIVELES_ACCESO)[number];

/**
 * Nivel de acceso efectivamente aprobado por el DIGERCIC para el Club.
 * Cambiar este valor es lo único necesario para habilitar el autocompletado.
 */
export const NIVEL_ACCESO: NivelAccesoSnic = "NO_DISPONIBLE";

/**
 * Permite demostrar el autocompletado antes de contar con el convenio. Los
 * datos son ficticios y la aplicación lo advierte de forma visible.
 * DEBE permanecer en `false` en producción.
 */
export const MODO_DEMOSTRACION = false;

/** Tarifas vigentes por consulta, sin IVA (tarifario DIGERCIC). */
export const TARIFA_CONSULTA: Record<Exclude<NivelAccesoSnic, "NO_DISPONIBLE">, number> = {
  DEMOGRAFICO: 0.08,
  DEMOGRAFICO_BIOMETRICO: 0.3,
};

export const NIVEL_META: Record<NivelAccesoSnic, { etiqueta: string; descripcion: string }> = {
  NO_DISPONIBLE: {
    etiqueta: "No habilitado",
    descripcion:
      "El contrato de adhesión con el Registro Civil aún no está vigente. Los datos se ingresan manualmente.",
  },
  DEMOGRAFICO: {
    etiqueta: "Demográfico",
    descripcion:
      "Devuelve los datos de identidad del ciudadano. No incluye fotografía, por lo que la identidad se verifica cotejando la cédula física.",
  },
  DEMOGRAFICO_BIOMETRICO: {
    etiqueta: "Demográfico y biométrico",
    descripcion:
      "Devuelve los datos de identidad más la fotografía y la firma registradas en el Registro Civil, lo que permite verificar la identidad del solicitante.",
  },
};

export function consultaDisponible(): boolean {
  return NIVEL_ACCESO !== "NO_DISPONIBLE" || MODO_DEMOSTRACION;
}

export function incluyeBiometria(): boolean {
  return NIVEL_ACCESO === "DEMOGRAFICO_BIOMETRICO";
}

/* ------------------------------------------------------------------ */
/* Datos devueltos                                                     */
/* ------------------------------------------------------------------ */

export type DatosSnic = {
  cedula: string;
  apellidos: string;
  nombres: string;
  fechaNacimiento: string;
  /** Tal como lo entrega el Registro Civil; se normaliza al catálogo del Club. */
  estadoCivil: string;
  sexo: string;
  nacionalidad: string;
  lugarNacimiento: string;
  /** Domicilio registrado. Puede venir vacío o desactualizado. */
  domicilio: string;
  profesion: string;
  /** `true` cuando el Registro Civil reporta fecha de defunción. */
  fallecido: boolean;
  /** Solo en el nivel biométrico: imágenes en base64. */
  fotografiaBase64?: string;
  firmaBase64?: string;
};

export type ResultadoConsulta =
  | { estado: "OK"; nivel: Exclude<NivelAccesoSnic, "NO_DISPONIBLE">; datos: DatosSnic }
  | { estado: "NO_ENCONTRADO"; mensaje: string }
  | { estado: "FALLECIDO"; mensaje: string }
  | { estado: "SIN_CONVENIO"; mensaje: string }
  | { estado: "ERROR"; mensaje: string };

/* ------------------------------------------------------------------ */
/* Aplicación de los datos al formulario                               */
/* ------------------------------------------------------------------ */

/** Campos del formulario que la consulta al SNIC puede llenar. */
export const CAMPOS_DESDE_SNIC = [
  "apellidos",
  "nombres",
  "fechaNacimiento",
  "estadoCivil",
  "lugarNacimiento",
] as const satisfies readonly (keyof DatosAfiliacion)[];

export type CampoDesdeSnic = (typeof CAMPOS_DESDE_SNIC)[number];

/** Subconjunto del formulario que la consulta al SNIC puede sobrescribir. */
export type ValoresDesdeSnic = Partial<Pick<DatosAfiliacion, CampoDesdeSnic>>;

/** Normaliza el estado civil del Registro Civil al catálogo del formulario. */
function normalizarEstadoCivil(valor: string): string {
  const limpio = valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .trim();

  const equivalencias: Record<string, (typeof ESTADOS_CIVILES)[number]> = {
    SOLTERO: "Soltero",
    SOLTERA: "Soltero",
    CASADO: "Casado",
    CASADA: "Casado",
    DIVORCIADO: "Divorciado",
    DIVORCIADA: "Divorciado",
    VIUDO: "Viudo",
    VIUDA: "Viudo",
    "UNION DE HECHO": "Unión de hecho",
    "UNION LIBRE": "Unión de hecho",
  };

  return equivalencias[limpio] ?? "";
}

/**
 * Vuelca los datos del SNIC sobre el formulario y devuelve qué campos se
 * llenaron, para poder marcarlos como verificados en la interfaz.
 */
export function aplicarDatosSnic(datos: DatosSnic): {
  valores: ValoresDesdeSnic;
  camposLlenos: CampoDesdeSnic[];
} {
  const valores: ValoresDesdeSnic = {};

  if (datos.apellidos.trim()) valores.apellidos = datos.apellidos.trim();
  if (datos.nombres.trim()) valores.nombres = datos.nombres.trim();
  if (datos.fechaNacimiento.trim()) valores.fechaNacimiento = datos.fechaNacimiento.trim();
  if (datos.lugarNacimiento?.trim()) valores.lugarNacimiento = datos.lugarNacimiento.trim();

  const estadoCivil = normalizarEstadoCivil(datos.estadoCivil);
  if (estadoCivil) valores.estadoCivil = estadoCivil;

  return {
    valores,
    camposLlenos: Object.keys(valores) as CampoDesdeSnic[],
  };
}
