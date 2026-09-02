import { etiquetaEscaneo, etiquetasReconocidas, type TipoDocumento } from "./documentos";
import { claveComparacion, nombreArchivoSeguro, normalizarNombreFinal, sinTildes } from "./texto";

/**
 * Convención de nombres del repositorio digital de expedientes.
 *
 * La Jefatura del Área de Socios escanea la documentación física desde su
 * propio equipo a una carpeta compartida. El nombre del archivo es lo único que
 * el sistema necesita para saber a quién pertenece el documento, qué documento
 * es y a qué Cuenta del CRM de SAFI debe subirse. Por eso la convención es
 * estricta y se valida en los dos extremos: la aplicación nombra así los
 * documentos que ella misma genera, y el vigilante de la carpeta compartida
 * rechaza —sin borrar nada— lo que no se ajuste.
 *
 *   Carpeta del socio titular   280 COQUE VEGA JOEL SEBASTIAN
 *   Formulario del titular      280 COQUE VEGA JOEL SEBASTIAN.pdf
 *   Cédula del titular          280 COQUE VEGA JOEL SEBASTIAN CEDULA.pdf
 *   Formulario del dependiente  280-1 COQUE VEGA ANA MARIA.pdf
 *   Cédula del dependiente      280-1 COQUE VEGA ANA MARIA CEDULA.pdf
 *
 * El número que precede al nombre es el número de socio asignado en el CRM de
 * SAFI. El sufijo `-1`, `-2`, … identifica al dependiente dentro de la cuenta
 * del titular, en el mismo orden en que consta en SAFI. Un archivo sin etiqueta
 * de documento es el formulario de ingreso (con la carta de compromiso
 * incorporada, cuando el tipo de socio la exige).
 *
 * Los nombres van en MAYÚSCULAS y sin tildes porque así los almacena el CRM de
 * SAFI: si difirieran, la carpeta del expediente dejaría de corresponder al
 * socio (ver `texto.ts`).
 */

/** Extensiones que el repositorio acepta. */
export const EXTENSIONES_ACEPTADAS = [".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff"] as const;

/** Identificación de una persona dentro del repositorio. */
export type ClaveExpediente = {
  /** Número de socio del titular de la cuenta. */
  numeroSocio: string;
  /**
   * Orden del dependiente dentro de la cuenta del titular. `null` cuando el
   * documento pertenece al propio titular.
   */
  ordinalDependiente: number | null;
  /** Apellidos y nombres, en MAYÚSCULAS y sin tildes. */
  apellidosNombres: string;
};

/** `280` o `280-1`: prefijo que identifica a la persona en el repositorio. */
export function prefijoDe(clave: Pick<ClaveExpediente, "numeroSocio" | "ordinalDependiente">): string {
  return clave.ordinalDependiente === null
    ? clave.numeroSocio
    : `${clave.numeroSocio}-${clave.ordinalDependiente}`;
}

/**
 * Nombre de la carpeta del socio dentro del repositorio. Los documentos de los
 * dependientes se guardan en la carpeta del titular, que es la unidad que
 * corresponde a una Cuenta del CRM de SAFI.
 */
export function nombreCarpeta(clave: Pick<ClaveExpediente, "numeroSocio" | "apellidosNombres">): string {
  return nombreArchivoSeguro(`${clave.numeroSocio} ${normalizarNombreFinal(clave.apellidosNombres)}`);
}

/** Nombre del archivo de un documento, sin extensión. */
export function nombreBase(clave: ClaveExpediente, tipo: TipoDocumento): string {
  const etiqueta = etiquetaEscaneo(tipo);
  const partes = [prefijoDe(clave), normalizarNombreFinal(clave.apellidosNombres)];
  // El formulario de ingreso no lleva etiqueta: es el documento por defecto.
  if (tipo !== "FORMULARIO_FIRMADO" && etiqueta) partes.push(etiqueta);
  return nombreArchivoSeguro(partes.join(" "));
}

/** Nombre completo del archivo, con extensión. */
export function nombreArchivo(clave: ClaveExpediente, tipo: TipoDocumento, extension = ".pdf"): string {
  return `${nombreBase(clave, tipo)}${extension}`;
}

/* ------------------------------------------------------------------ */
/* Análisis de un archivo depositado en la carpeta compartida          */
/* ------------------------------------------------------------------ */

export const MOTIVOS_RECHAZO = [
  "EXTENSION_NO_ACEPTADA",
  "SIN_NUMERO_DE_SOCIO",
  "SIN_NOMBRE",
  "NOMBRE_CON_CARACTERES_NO_VALIDOS",
] as const;

export type MotivoRechazo = (typeof MOTIVOS_RECHAZO)[number];

export const MOTIVO_RECHAZO_META: Record<MotivoRechazo, string> = {
  EXTENSION_NO_ACEPTADA: `El archivo debe ser PDF o imagen (${EXTENSIONES_ACEPTADAS.join(", ")}).`,
  SIN_NUMERO_DE_SOCIO:
    "El nombre debe empezar con el número de socio, opcionalmente seguido del guion y el número del dependiente (ej. «280» o «280-1»).",
  SIN_NOMBRE: "Falta el nombre del socio después del número (ej. «280 COQUE VEGA JOEL SEBASTIAN»).",
  NOMBRE_CON_CARACTERES_NO_VALIDOS:
    "El nombre solo debe contener letras y espacios, en mayúsculas y sin tildes.",
};

export type ArchivoReconocido = {
  ok: true;
  clave: ClaveExpediente;
  tipo: TipoDocumento;
  extension: string;
  /** El nombre traía tildes o minúsculas y se normalizó. */
  seNormalizo: boolean;
  /** Nombre canónico con el que debe archivarse. */
  nombreCanonico: string;
};

export type ArchivoRechazado = { ok: false; motivo: MotivoRechazo; detalle: string };

export type ResultadoAnalisis = ArchivoReconocido | ArchivoRechazado;

const PATRON_PREFIJO = /^(\d{1,8})(?:-(\d{1,3}))?\s+(.+)$/;

/**
 * Interpreta el nombre de un archivo depositado en la carpeta compartida.
 *
 * Es tolerante con lo que un operador puede equivocarse sin ambigüedad
 * (minúsculas, tildes, espacios de más, ceros a la izquierda del número de
 * socio) y estricto con lo que sí sería ambiguo (falta del número de socio o
 * del nombre). Nunca modifica el archivo original: quien decide qué hacer con
 * el resultado es el vigilante de la carpeta.
 */
export function analizarNombreArchivo(nombreCompleto: string): ResultadoAnalisis {
  const punto = nombreCompleto.lastIndexOf(".");
  if (punto <= 0) {
    return {
      ok: false,
      motivo: "EXTENSION_NO_ACEPTADA",
      detalle: MOTIVO_RECHAZO_META.EXTENSION_NO_ACEPTADA,
    };
  }

  const extension = nombreCompleto.slice(punto).toLowerCase();
  if (!(EXTENSIONES_ACEPTADAS as readonly string[]).includes(extension)) {
    return {
      ok: false,
      motivo: "EXTENSION_NO_ACEPTADA",
      detalle: MOTIVO_RECHAZO_META.EXTENSION_NO_ACEPTADA,
    };
  }

  const sinExtension = nombreCompleto.slice(0, punto).replace(/\s+/g, " ").trim();
  const coincidencia = PATRON_PREFIJO.exec(sinExtension);
  if (!coincidencia) {
    return {
      ok: false,
      motivo: "SIN_NUMERO_DE_SOCIO",
      detalle: MOTIVO_RECHAZO_META.SIN_NUMERO_DE_SOCIO,
    };
  }

  const [, socioBruto, dependienteBruto, resto] = coincidencia;
  const numeroSocio = socioBruto.replace(/^0+(?=\d)/, "");
  const ordinalDependiente = dependienteBruto ? Number(dependienteBruto) : null;

  // La etiqueta del documento, si existe, va al final del nombre. Se prueban de
  // la más larga a la más corta para que «CEDULA TITULAR» gane sobre «CEDULA».
  let tipo: TipoDocumento = "FORMULARIO_FIRMADO";
  let nombrePersona = resto;

  const restoNormalizado = sinTildes(resto).toUpperCase();
  for (const { tipo: candidato, etiqueta } of etiquetasReconocidas()) {
    const sufijo = ` ${etiqueta}`;
    if (restoNormalizado.endsWith(sufijo)) {
      tipo = candidato;
      nombrePersona = resto.slice(0, resto.length - sufijo.length);
      break;
    }
  }

  const apellidosNombres = normalizarNombreFinal(nombrePersona);
  if (!apellidosNombres) {
    return { ok: false, motivo: "SIN_NOMBRE", detalle: MOTIVO_RECHAZO_META.SIN_NOMBRE };
  }
  if (apellidosNombres.split(" ").length < 2) {
    return {
      ok: false,
      motivo: "SIN_NOMBRE",
      detalle: "Indique apellidos y nombres completos del socio o del dependiente.",
    };
  }

  const clave: ClaveExpediente = { numeroSocio, ordinalDependiente, apellidosNombres };
  const nombreCanonico = nombreArchivo(clave, tipo, extension);

  return {
    ok: true,
    clave,
    tipo,
    extension,
    seNormalizo: nombreCanonico !== nombreCompleto,
    nombreCanonico,
  };
}

/**
 * Interpreta el nombre de una subcarpeta de la carpeta compartida. Se acepta
 * tanto la carpeta del titular como una carpeta propia del dependiente.
 */
export function analizarNombreCarpeta(nombre: string):
  | { ok: true; clave: Omit<ClaveExpediente, "apellidosNombres"> & { apellidosNombres: string } }
  | ArchivoRechazado {
  const coincidencia = PATRON_PREFIJO.exec(nombre.replace(/\s+/g, " ").trim());
  if (!coincidencia) {
    return {
      ok: false,
      motivo: "SIN_NUMERO_DE_SOCIO",
      detalle: MOTIVO_RECHAZO_META.SIN_NUMERO_DE_SOCIO,
    };
  }

  const [, socioBruto, dependienteBruto, resto] = coincidencia;
  const apellidosNombres = normalizarNombreFinal(resto);
  if (!apellidosNombres) {
    return { ok: false, motivo: "SIN_NOMBRE", detalle: MOTIVO_RECHAZO_META.SIN_NOMBRE };
  }

  return {
    ok: true,
    clave: {
      numeroSocio: socioBruto.replace(/^0+(?=\d)/, ""),
      ordinalDependiente: dependienteBruto ? Number(dependienteBruto) : null,
      apellidosNombres,
    },
  };
}

/**
 * Comprueba que el nombre del archivo corresponda a la persona esperada. Un
 * dígito equivocado en el número de socio archivaría el documento de un socio
 * en el expediente de otro, así que el nombre se contrasta antes de aceptarlo.
 */
export function nombreCoincide(esperado: string, encontrado: string): boolean {
  return claveComparacion(esperado) === claveComparacion(encontrado);
}

/**
 * Texto de ayuda que se entrega a la Jefatura de Socios y que también se
 * muestra en la bandeja de tareas cuando un archivo no pudo clasificarse.
 */
export const INSTRUCTIVO_ESCANEO = [
  "Cree una carpeta por socio titular con el formato: número de socio, un espacio y los apellidos y nombres. Ejemplo: «280 COQUE VEGA JOEL SEBASTIAN».",
  "Guarde dentro de esa carpeta la documentación del titular y la de todos sus dependientes.",
  "Nombre el formulario de ingreso igual que la carpeta. Ejemplo: «280 COQUE VEGA JOEL SEBASTIAN.pdf».",
  "Para los demás documentos, añada la etiqueta al final. Ejemplo: «280 COQUE VEGA JOEL SEBASTIAN CEDULA.pdf».",
  "Para un dependiente, escriba el número del titular, un guion y el número del dependiente, seguido de sus propios apellidos y nombres. Ejemplo: «280-1 COQUE VEGA ANA MARIA.pdf».",
  "Escriba siempre en MAYÚSCULAS y sin tildes, tal como consta el nombre en el CRM de SAFI.",
  "Etiquetas reconocidas: CEDULA, CEDULA TITULAR, FOTO, TARJETA MILITAR, ACTA DE MATRIMONIO, PARTIDA DE NACIMIENTO, CARTA DE COMPROMISO, CREDENCIAL ANTERIOR, FACTURA, OTROS.",
];
