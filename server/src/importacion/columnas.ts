import { formatearValor, tarifaDe } from "../../../src/domain/cuotas";
import { sinTildes } from "../../../src/domain/texto";

/**
 * Columnas de la plantilla de importación de socios oficiales.
 *
 * Es la única definición: de aquí salen los encabezados y las ayudas de la
 * plantilla que se descarga, la hoja de instrucciones y el reconocimiento de
 * las columnas al leer el archivo que se sube. Cambiar una columna aquí la
 * cambia en los tres sitios.
 *
 * Solo se piden los datos que viajan a SAFI (la Cuenta y la ficha del Socio) o
 * que hacen falta para elegir la cuota: la importación no genera el R-PGS1-1,
 * así que el lugar de nacimiento, la profesión o la situación, que solo
 * constan en el formulario en papel, no se piden.
 */

export type ClaveColumna =
  | "numeroSocio"
  | "cedula"
  | "apellidos"
  | "nombres"
  | "sexo"
  | "fechaNacimiento"
  | "estadoCivil"
  | "tipoSangre"
  | "grado"
  | "promocion"
  | "celular"
  | "convencional"
  | "correo"
  | "direccion"
  | "ciudad"
  | "provincia"
  | "pais"
  | "suscripcion"
  | "formaPago"
  | "grupoFacturacion"
  | "tipoContribuyente"
  | "valorMembresia"
  | "fechaIngreso"
  | "comunicaciones"
  | "hobbie";

/** Listas desplegables de la plantilla. Sus valores los da el CRM en vivo. */
export type ClaveLista =
  | "sexo"
  | "estadoCivil"
  | "tipoSangre"
  | "grado"
  | "provincia"
  | "suscripcion"
  | "formaPago"
  | "grupoFacturacion"
  | "tipoContribuyente"
  | "valorMembresia"
  | "siNo";

export type Columna = {
  clave: ClaveColumna;
  /** Encabezado en la plantilla. */
  titulo: string;
  /**
   * `true` obligatoria; `false` opcional; `"condicional"`, obligatoria solo en
   * algunos casos, que explica `descripcion`.
   */
  obligatoria: boolean | "condicional";
  formato: "texto" | "fecha" | "numero" | "lista";
  lista?: ClaveLista;
  /** Ancho de la columna en la plantilla, en caracteres. */
  ancho: number;
  /** Qué va en la columna, para la hoja de instrucciones y la nota del encabezado. */
  descripcion: string;
  ejemplo: string;
  /** Otros encabezados que se reconocen como esta columna. */
  alias: string[];
};

const TARIFA_ACTIVO = tarifaDe("SA", "");
const ANUAL = TARIFA_ACTIVO?.cuotas.ANUAL;
const MENSUAL = TARIFA_ACTIVO?.cuotas.MENSUAL;
const MEMBRESIA = TARIFA_ACTIVO?.membresia;

const importe = (valor: number | null | undefined) =>
  valor === null || valor === undefined ? "—" : formatearValor(valor);

export const COLUMNAS: Columna[] = [
  {
    clave: "numeroSocio",
    titulo: "N.º de socio",
    obligatoria: false,
    formato: "texto",
    ancho: 12,
    descripcion:
      "Número de socio. Déjelo vacío para que el sistema asigne números consecutivos a partir del que indique al subir el archivo, saltando los que ya estén ocupados en SAFI.",
    ejemplo: "2929",
    alias: ["no de socio", "numero de socio", "nro de socio", "n socio", "no socio", "numero socio", "num socio"],
  },
  {
    clave: "cedula",
    titulo: "Cédula",
    obligatoria: true,
    formato: "texto",
    ancho: 13,
    descripcion:
      "Cédula ecuatoriana, 10 dígitos. La columna ya está en formato de texto: así no se pierde el 0 inicial de las cédulas de Azuay a Cotopaxi.",
    ejemplo: "0912345675",
    alias: ["cedula de identidad", "ci", "c i", "numero de cedula", "identificacion", "cedula ciudadania"],
  },
  {
    clave: "apellidos",
    titulo: "Apellidos",
    obligatoria: true,
    formato: "texto",
    ancho: 24,
    descripcion: "Los dos apellidos. Se guardan en mayúsculas y sin tildes, como en SAFI.",
    ejemplo: "PÉREZ VILLACÍS",
    alias: ["apellido"],
  },
  {
    clave: "nombres",
    titulo: "Nombres",
    obligatoria: true,
    formato: "texto",
    ancho: 24,
    descripcion: "Los nombres. Se guardan en mayúsculas y sin tildes.",
    ejemplo: "JUAN CARLOS",
    alias: ["nombre"],
  },
  {
    clave: "sexo",
    titulo: "Sexo",
    obligatoria: true,
    formato: "lista",
    lista: "sexo",
    ancho: 12,
    descripcion: "Masculino o Femenino. Va al campo Género de SAFI.",
    ejemplo: "Masculino",
    alias: ["genero"],
  },
  {
    clave: "fechaNacimiento",
    titulo: "Fecha de nacimiento",
    obligatoria: true,
    formato: "fecha",
    ancho: 14,
    descripcion: "Fecha de Excel o texto en la forma dd/mm/aaaa. La edad se calcula sola.",
    ejemplo: "15/03/2003",
    alias: ["nacimiento", "fecha nacimiento", "f nacimiento", "fecha de nac"],
  },
  {
    clave: "estadoCivil",
    titulo: "Estado civil",
    obligatoria: true,
    formato: "lista",
    lista: "estadoCivil",
    ancho: 15,
    descripcion: "Soltero, Casado, Unión de hecho, Divorciado o Viudo.",
    ejemplo: "Soltero",
    alias: [],
  },
  {
    clave: "tipoSangre",
    titulo: "Tipo de sangre",
    obligatoria: false,
    formato: "lista",
    lista: "tipoSangre",
    ancho: 12,
    descripcion: "O+, O-, A+, A-, B+, B-, AB+ o AB-. Si no se conoce, déjelo vacío.",
    ejemplo: "O+",
    alias: ["sangre", "grupo sanguineo", "tipo sangre", "tipo sanguineo"],
  },
  {
    clave: "grado",
    titulo: "Grado",
    obligatoria: true,
    formato: "lista",
    lista: "grado",
    ancho: 22,
    descripcion:
      "Grado militar de la Fuerza Aérea, tal como está en la lista de SAFI (los cadetes que se gradúan, SUBTENIENTE). Un Socio Activo es oficial FAE: no se admiten grados de la Armada ni del Ejército.",
    ejemplo: "SUBTENIENTE",
    alias: ["grado militar"],
  },
  {
    clave: "promocion",
    titulo: "Promoción",
    obligatoria: true,
    formato: "numero",
    ancho: 11,
    descripcion: "Número de la promoción de la Escuela Superior Militar de Aviación.",
    ejemplo: "72",
    alias: ["promocion esma", "no de promocion", "numero de promocion"],
  },
  {
    clave: "celular",
    titulo: "Celular",
    obligatoria: true,
    formato: "texto",
    ancho: 13,
    descripcion: "10 dígitos que empiezan por 09. Es el teléfono principal de la Cuenta en SAFI.",
    ejemplo: "0991234567",
    alias: ["telefono celular", "movil", "celular personal"],
  },
  {
    clave: "convencional",
    titulo: "Teléfono convencional",
    obligatoria: false,
    formato: "texto",
    ancho: 14,
    descripcion: "9 dígitos con el código de provincia (022345678). Opcional.",
    ejemplo: "022345678",
    alias: ["convencional", "telefono", "telefono domicilio", "telefono fijo", "telefono convencional domicilio"],
  },
  {
    clave: "correo",
    titulo: "Correo electrónico",
    obligatoria: true,
    formato: "texto",
    ancho: 28,
    descripcion: "Correo personal. Es obligatorio en la Cuenta y en la ficha de SAFI.",
    ejemplo: "juan.perez@example.com",
    alias: ["correo", "email", "e mail", "mail", "correo personal"],
  },
  {
    clave: "direccion",
    titulo: "Dirección",
    obligatoria: true,
    formato: "texto",
    ancho: 34,
    descripcion: "Calle principal, número y calle secundaria (al menos 8 caracteres).",
    ejemplo: "AV. DE LA PRENSA N45-12 Y HOMERO SALAS",
    alias: ["direccion domiciliaria", "domicilio", "direccion de domicilio"],
  },
  {
    clave: "ciudad",
    titulo: "Ciudad",
    obligatoria: true,
    formato: "texto",
    ancho: 14,
    descripcion: "Ciudad de residencia.",
    ejemplo: "QUITO",
    alias: ["poblacion", "ciudad de residencia"],
  },
  {
    clave: "provincia",
    titulo: "Provincia",
    obligatoria: "condicional",
    formato: "lista",
    lista: "provincia",
    ancho: 16,
    descripcion: "Provincia del Ecuador, de la lista. Obligatoria si el país es Ecuador.",
    ejemplo: "Pichincha",
    alias: ["provincia de residencia"],
  },
  {
    clave: "pais",
    titulo: "País",
    obligatoria: false,
    formato: "texto",
    ancho: 11,
    descripcion: "País del domicilio. Vacío es Ecuador.",
    ejemplo: "Ecuador",
    alias: ["pais de residencia"],
  },
  {
    clave: "suscripcion",
    titulo: "Subscripción",
    obligatoria: false,
    formato: "lista",
    lista: "suscripcion",
    ancho: 13,
    descripcion: `Anual o Mensual. Vacío es Anual. La cuota sale del tarifario del Socio Activo: anual ${importe(
      ANUAL
    )} o mensual ${importe(MENSUAL)}, y es también el Valor Cuota de la Cuenta.`,
    ejemplo: "Anual",
    alias: ["suscripcion", "subscripciones", "suscripciones", "periodicidad"],
  },
  {
    clave: "formaPago",
    titulo: "Forma de pago",
    obligatoria: true,
    formato: "lista",
    lista: "formaPago",
    ancho: 36,
    descripcion:
      "Forma de pago de SAFI. También se reconocen «Transferencia FAE», «ISSFA», «Tarjeta de crédito», «Débito bancario» y «Efectivo».",
    ejemplo: "FAE – TRANSFERENCIA",
    alias: ["forma pago", "forma_pago", "modalidad de pago"],
  },
  {
    clave: "grupoFacturacion",
    titulo: "Grupo de facturación",
    obligatoria: "condicional",
    formato: "lista",
    lista: "grupoFacturacion",
    ancho: 20,
    descripcion:
      "Grupo de facturación de SAFI. Con tarjeta de crédito o débito bancario es obligatorio (el banco o la tarjeta). Con FAE, ISSFA o efectivo, si se deja vacío se pone FAE, ISFFA u OFICINA.",
    ejemplo: "FAE",
    alias: ["grupo facturacion", "grupo"],
  },
  {
    clave: "tipoContribuyente",
    titulo: "Tipo de contribuyente",
    obligatoria: false,
    formato: "lista",
    lista: "tipoContribuyente",
    ancho: 30,
    descripcion: "Vacío es CLIENTES LOCALES NO RELACIONADOS, el habitual.",
    ejemplo: "CLIENTES LOCALES NO RELACIONADOS",
    alias: ["tipo contribuyente"],
  },
  {
    clave: "valorMembresia",
    titulo: "Valor de membresía",
    obligatoria: false,
    formato: "lista",
    lista: "valorMembresia",
    ancho: 12,
    descripcion: `Valor de la membresía, de la lista de SAFI. Vacío es el del tarifario del Socio Activo (${importe(
      MEMBRESIA
    )}).`,
    ejemplo: MEMBRESIA !== null && MEMBRESIA !== undefined ? String(MEMBRESIA) : "",
    alias: ["membresia", "valor membresia"],
  },
  {
    clave: "fechaIngreso",
    titulo: "Fecha de ingreso al Club",
    obligatoria: false,
    formato: "fecha",
    ancho: 14,
    descripcion: "dd/mm/aaaa. Vacía es el día en que se crea en SAFI.",
    ejemplo: "01/10/2026",
    alias: ["fecha de ingreso", "ingreso", "fecha ingreso"],
  },
  {
    clave: "comunicaciones",
    titulo: "Acepta comunicaciones por correo",
    obligatoria: false,
    formato: "lista",
    lista: "siNo",
    ancho: 14,
    descripcion:
      "Sí si el socio autorizó recibir comunicaciones del Club por correo. Vacío es No, como la casilla sin marcar de la tableta: en SAFI queda con «No Enviar Email».",
    ejemplo: "Sí",
    alias: ["acepta comunicaciones", "comunicaciones", "autoriza comunicaciones"],
  },
  {
    clave: "hobbie",
    titulo: "Hobbie",
    obligatoria: false,
    formato: "texto",
    ancho: 16,
    descripcion: "Opcional.",
    ejemplo: "TENIS",
    alias: ["hobby", "pasatiempo"],
  },
];

export const COLUMNA_POR_CLAVE = Object.fromEntries(COLUMNAS.map((c) => [c.clave, c])) as Record<
  ClaveColumna,
  Columna
>;

/**
 * Forma comparable de un encabezado: sin tildes, en minúsculas, sin signos,
 * sin «(opcional)» ni asteriscos. «N.º de socio», «Nº SOCIO» y «no. de socio»
 * quedan iguales.
 */
export function claveEncabezado(texto: string): string {
  return sinTildes(String(texto ?? ""))
    .toLowerCase()
    .replace(/\(opcional\)|\(obligatori[oa]\)|\*/g, " ")
    .replace(/[º°ª]/g, "o")
    .replace(/[^a-z0-9ñ]+/g, " ")
    .replace(/\bn o\b/g, "no")
    .replace(/\s+/g, " ")
    .trim();
}

const POR_ENCABEZADO = new Map<string, ClaveColumna>();
for (const columna of COLUMNAS) {
  for (const texto of [columna.titulo, columna.clave, ...columna.alias]) {
    POR_ENCABEZADO.set(claveEncabezado(texto), columna.clave);
  }
}

/** La columna que corresponde a un encabezado, o `null` si no se reconoce. */
export function columnaDeEncabezado(texto: string): ClaveColumna | null {
  return POR_ENCABEZADO.get(claveEncabezado(texto)) ?? null;
}

/** Columnas sin las cuales no se puede revisar ninguna fila. */
export const COLUMNAS_OBLIGATORIAS = COLUMNAS.filter((c) => c.obligatoria === true).map((c) => c.clave);

/** Máximo de filas de un lote: un octubre trae unas decenas de cadetes. */
export const MAXIMO_FILAS = 500;
