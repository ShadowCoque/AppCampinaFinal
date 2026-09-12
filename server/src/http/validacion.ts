import { TIPOS_DOCUMENTO, type TipoDocumento } from "../../../src/domain/documentos";
import { EXTENSIONES_ACEPTADAS } from "../../../src/domain/expediente";
import {
  ROLES_ADJUNTO,
  confirmacionVacia,
  type ConfirmacionSafi,
  type RolAdjunto,
} from "../../../src/domain/solicitud";
import { normalizarNumeroSocio } from "../../../src/domain/texto";
import { esTipoMiembro } from "../../../src/domain/tiposMiembro";

/**
 * Validación de lo que llega por la API.
 *
 * Todo lo que entra al servidor pasa por aquí antes de tocar el disco o la base
 * de datos. No es desconfianza hacia el Área de Socios: es que un archivo mal
 * tipado o una extensión inesperada, servida después desde el mismo dominio en
 * el que vive la sesión de Contabilidad y de la Gerencia, es exactamente cómo se
 * cuela un problema de seguridad en un sistema por lo demás interno.
 */

/** Extensiones que el repositorio acepta, con su tipo de contenido real. */
const TIPOS_CONTENIDO: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

/**
 * Firmas binarias de los formatos aceptados.
 *
 * La extensión la pone quien sube el archivo; estos primeros bytes los pone el
 * propio formato. Comprobarlos evita que un documento con nombre `.pdf` sea en
 * realidad otra cosa.
 */
const FIRMAS: { extensiones: string[]; bytes: number[]; desplazamiento?: number }[] = [
  { extensiones: [".pdf"], bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { extensiones: [".jpg", ".jpeg"], bytes: [0xff, 0xd8, 0xff] },
  { extensiones: [".png"], bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { extensiones: [".tif", ".tiff"], bytes: [0x49, 0x49, 0x2a, 0x00] }, // little endian
  { extensiones: [".tif", ".tiff"], bytes: [0x4d, 0x4d, 0x00, 0x2a] }, // big endian
];

export type ResultadoValidacion<T> = { ok: true; valor: T } | { ok: false; error: string };

/** Extensión aceptada por el repositorio, en minúsculas y con punto. */
export function validarExtension(nombreArchivo: string): ResultadoValidacion<string> {
  const punto = nombreArchivo.lastIndexOf(".");
  const extension = punto > 0 ? nombreArchivo.slice(punto).toLowerCase() : "";

  if (!(EXTENSIONES_ACEPTADAS as readonly string[]).includes(extension)) {
    return {
      ok: false,
      error: `El expediente solo admite ${EXTENSIONES_ACEPTADAS.join(", ")}. Se recibió «${
        extension || "un archivo sin extensión"
      }».`,
    };
  }

  return { ok: true, valor: extension };
}

/** Comprueba que el contenido corresponda realmente a la extensión declarada. */
export function validarContenido(
  contenido: Buffer,
  extension: string
): ResultadoValidacion<string> {
  if (contenido.length === 0) {
    return { ok: false, error: "El archivo llegó vacío." };
  }

  const esperadas = FIRMAS.filter((f) => f.extensiones.includes(extension));
  const coincide = esperadas.some((firma) =>
    firma.bytes.every((byte, indice) => contenido[(firma.desplazamiento ?? 0) + indice] === byte)
  );

  if (!coincide) {
    return {
      ok: false,
      error: `El contenido del archivo no corresponde a un ${extension.slice(1).toUpperCase()}.`,
    };
  }

  return { ok: true, valor: TIPOS_CONTENIDO[extension] ?? "application/octet-stream" };
}

export function tipoContenidoDe(extension: string): string {
  return TIPOS_CONTENIDO[extension.toLowerCase()] ?? "application/octet-stream";
}

/** Tipo de documento del catálogo. Un valor inventado rompería el archivado. */
export function validarTipoDocumento(valor: unknown): ResultadoValidacion<TipoDocumento> {
  if (typeof valor !== "string" || !(TIPOS_DOCUMENTO as readonly string[]).includes(valor)) {
    return { ok: false, error: `Tipo de documento no reconocido: «${String(valor)}».` };
  }
  return { ok: true, valor: valor as TipoDocumento };
}

/** Papel del adjunto que envía la tableta: una firma o la fotografía. */
export function validarRolAdjunto(valor: unknown): ResultadoValidacion<RolAdjunto> {
  if (typeof valor !== "string" || !(ROLES_ADJUNTO as readonly string[]).includes(valor)) {
    return {
      ok: false,
      error: `No se reconoce qué es este archivo («${String(valor)}»). Valores válidos: ${ROLES_ADJUNTO.join(", ")}.`,
    };
  }
  return { ok: true, valor: valor as RolAdjunto };
}

/**
 * Tamaño máximo de una firma. El lienzo produce un PNG de unos 20 KB; medio
 * megabyte deja margen de sobra y descarta que llegue otra cosa por ese campo.
 */
const MAXIMO_FIRMA_BYTES = 512 * 1024;

/**
 * Firmas que acompañan al registro de una afiliación: la del solicitante y la
 * de cada socio garante, en PNG y codificadas en base64.
 *
 * Se comprueban los primeros bytes, no solo que el texto sea base64: lo que
 * llega por aquí se incrusta en el formulario que firma el socio, y ahí no
 * puede colarse un archivo de otro tipo.
 */
export function validarFirmas(valor: unknown): ResultadoValidacion<{
  solicitante: Buffer | null;
  garantes: (Buffer | null)[];
}> {
  const entrada = (valor ?? {}) as { solicitante?: unknown; garantes?: unknown };

  const aBuffer = (dato: unknown, quien: string): Buffer | null | string => {
    if (dato === null || dato === undefined || dato === "") return null;
    if (typeof dato !== "string") return `La firma ${quien} no llegó en el formato esperado.`;

    const limpio = dato.replace(/^data:[^;]+;base64,/, "");
    if (limpio.length > MAXIMO_FIRMA_BYTES * 2) return `La firma ${quien} es demasiado grande.`;

    let contenido: Buffer;
    try {
      contenido = Buffer.from(limpio, "base64");
    } catch {
      return `La firma ${quien} no se pudo leer.`;
    }
    if (contenido.length === 0) return null;
    if (contenido.length > MAXIMO_FIRMA_BYTES) return `La firma ${quien} es demasiado grande.`;

    const comprobacion = validarContenido(contenido, ".png");
    if (!comprobacion.ok) return `La firma ${quien} no es una imagen PNG.`;
    return contenido;
  };

  const solicitante = aBuffer(entrada.solicitante, "del solicitante");
  if (typeof solicitante === "string") return { ok: false, error: solicitante };

  const recibidas = Array.isArray(entrada.garantes) ? entrada.garantes.slice(0, 2) : [];
  const garantes: (Buffer | null)[] = [];
  for (const [indice, dato] of recibidas.entries()) {
    const firma = aBuffer(dato, `del socio garante ${indice + 1}`);
    if (typeof firma === "string") return { ok: false, error: firma };
    garantes.push(firma);
  }

  return { ok: true, valor: { solicitante, garantes } };
}

/**
 * Observación obligatoria: es lo que el Área de Socios tendrá que corregir, o
 * el motivo por el que un trámite se anula. Sin texto no se puede devolver ni
 * anular nada.
 */
export function validarObservacion(valor: unknown, minimo = 10): ResultadoValidacion<string> {
  const texto = recortarObservacion(valor);
  if (texto.length < minimo) {
    return {
      ok: false,
      error: `Escriba la observación con algo de detalle (al menos ${minimo} caracteres): es lo que verá quien deba actuar.`,
    };
  }
  return { ok: true, valor: texto };
}

/** Ordinal del dependiente dentro de la cuenta del titular: 1, 2, 3… o ninguno. */
export function validarOrdinal(valor: unknown): ResultadoValidacion<number | null> {
  if (valor === undefined || valor === null || valor === "") return { ok: true, valor: null };

  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1 || numero > 99) {
    return { ok: false, error: "El número de dependiente debe estar entre 1 y 99." };
  }
  return { ok: true, valor: numero };
}

/**
 * Comprobación de que el cuerpo recibido es una solicitud de afiliación y no
 * cualquier otro objeto. La validación completa del formulario la hace la
 * tableta con el dominio compartido; aquí se comprueba lo que, si viniera mal,
 * dejaría el expediente inservible: la identidad del solicitante y su tipo de
 * socio, del que dependen la carpeta, los documentos y la ficha de SAFI.
 */
export function validarSolicitudEntrante(cuerpo: unknown): ResultadoValidacion<{
  datos: { cedula: string; apellidos: string; nombres: string };
}> {
  const solicitud = (cuerpo as { solicitud?: Record<string, unknown> } | undefined)?.solicitud;
  if (!solicitud || typeof solicitud !== "object") {
    return { ok: false, error: "Falta el cuerpo de la solicitud." };
  }

  if (typeof solicitud.id !== "string" || !/^[a-zA-Z0-9_-]{6,64}$/.test(solicitud.id)) {
    return { ok: false, error: "El identificador del trámite no es válido." };
  }

  const datos = solicitud.datos as {
    cedula?: unknown;
    apellidos?: unknown;
    nombres?: unknown;
    tipoMiembro?: unknown;
  };
  if (!datos || typeof datos !== "object") {
    return { ok: false, error: "La solicitud no trae los datos del solicitante." };
  }

  if (typeof datos.cedula !== "string" || !/^\d{10}$/.test(datos.cedula)) {
    return { ok: false, error: "La cédula del solicitante no es válida." };
  }
  if (typeof datos.apellidos !== "string" || !datos.apellidos.trim()) {
    return { ok: false, error: "Falta el apellido del solicitante." };
  }
  if (typeof datos.nombres !== "string" || !datos.nombres.trim()) {
    return { ok: false, error: "Falta el nombre del solicitante." };
  }
  if (!esTipoMiembro(datos.tipoMiembro)) {
    return {
      ok: false,
      error: "La solicitud no indica un tipo de socio del catálogo del Club.",
    };
  }

  return {
    ok: true,
    valor: { datos: { cedula: datos.cedula, apellidos: datos.apellidos, nombres: datos.nombres } },
  };
}

/** Texto libre de una observación: se acota para que no crezca sin control. */
export function recortarObservacion(valor: unknown, maximo = 2000): string {
  return typeof valor === "string" ? valor.trim().slice(0, maximo) : "";
}

/* ------------------------------------------------------------------ */
/* Confirmación del alta en SAFI                                       */
/* ------------------------------------------------------------------ */

/** Campos de la confirmación, todos texto libre acotado a lo que SAFI admite. */
const CAMPOS_CONFIRMACION = [
  "grupoFacturacion",
  "formaPago",
  "tipoContribuyente",
  "valorCuota",
  "suscripcion",
  "cuotaAnual",
  "cuotaMensual",
  "valorMembresia",
] as const;

/**
 * Comprueba lo que el panel del Área de Socios envía para dar de alta a un
 * socio en el CRM.
 *
 * El número de socio y el ordinal se validan aquí porque de ellos dependen dos
 * cosas que no se pueden deshacer sin trabajo manual: el nombre de la carpeta
 * del expediente y la Secuencia con la que la persona queda colgada de su
 * Cuenta en SAFI. Los valores de las listas se comprueban después contra el
 * catálogo del propio CRM (ver `avisosDeConfirmacion`).
 */
export function validarConfirmacionSafi(cuerpo: unknown):
  | {
      ok: true;
      numeroSocio: string;
      ordinalDependiente: number | null;
      confirmacion: ConfirmacionSafi;
      /** Identificadores transcritos a mano, solo en modo manual. */
      cuentaSafiId: string | null;
      socioSafiId: string | null;
    }
  | { ok: false; error: string } {
  const entrada = (cuerpo ?? {}) as Record<string, unknown>;

  const numeroSocio = normalizarNumeroSocio(String(entrada.numeroSocio ?? ""));
  if (!numeroSocio) {
    return { ok: false, error: "Indique el número de socio con el que consta en el CRM." };
  }

  const ordinal = validarOrdinal(entrada.ordinalDependiente);
  if (!ordinal.ok) return { ok: false, error: ordinal.error };

  const recibida = (entrada.confirmacion ?? {}) as Record<string, unknown>;
  const confirmacion = confirmacionVacia();
  for (const campo of CAMPOS_CONFIRMACION) {
    const valor = recibida[campo];
    confirmacion[campo] = typeof valor === "string" ? valor.trim().slice(0, 120) : "";
  }

  // vTiger identifica sus registros con números; el del CRM se lee del `record=`
  // de la barra de direcciones. Se aceptan solo dígitos para que un pegado
  // accidental de la URL entera no acabe guardado como identificador.
  const identificador = (valor: unknown): string | null => {
    const texto = typeof valor === "string" ? valor.trim() : "";
    return /^\d{1,12}$/.test(texto) ? texto : null;
  };

  return {
    ok: true,
    numeroSocio,
    ordinalDependiente: ordinal.valor,
    confirmacion,
    cuentaSafiId: identificador(entrada.cuentaSafiId),
    socioSafiId: identificador(entrada.socioSafiId),
  };
}
