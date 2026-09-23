import type { TipoMiembro } from "../../../src/domain/tiposMiembro";
import type { FormaPago } from "../../../src/domain/facturacion";
import {
  TIPO_SOCIO_SAFI,
  TIPO_SOCIO_SAFI_DB_CASADO,
  nombreConGrado,
} from "../../../src/domain/sociosSafi";

/**
 * Correspondencia entre los datos del Club y los campos del CRM de SAFI.
 *
 * SAFI es un vTiger 7 personalizado: los campos propios del Club se llaman
 * `cf_NNN` y sus etiquetas solo existen en la interfaz. Este archivo es la
 * traducción, levantada el 26 de agosto de 2026 navegando la instalación y
 * creando registros de prueba (ver `SAFI-INTEGRACION.md`).
 *
 * Si el Club añade un campo o cambia una lista de valores en SAFI, se ajusta
 * aquí y en ningún otro sitio.
 */

/* ------------------------------------------------------------------ */
/* Módulos                                                             */
/* ------------------------------------------------------------------ */

export const MODULOS = {
  /** «Cuenta»: el socio titular como cuenta de facturación. */
  cuenta: "Accounts",
  /** «Socio»: una ficha por persona, titular o dependiente. */
  socio: "Contacts",
  /** «Documentos»: los archivos del expediente. */
  documento: "Documents",
  /** Carpetas de documentos: SAFI tiene una sola, «Default». */
  carpetaDocumentos: "DocumentFolders",
} as const;

/**
 * Formato de las fechas, que depende de por dónde se escriba:
 *
 *   · El **formulario HTML** (modo HTTP) espera el formato configurado para el
 *     usuario del CRM, `dd-mm-yyyy`, igual que lo teclearía una persona.
 *   · La **API** (modo API) espera ISO, `yyyy-mm-dd`, y hace ella la
 *     conversión. Enviarle `26-08-2026` la haría leer el año 26.
 */
export type ViaSafi = "API" | "HTTP";

/** `2026-08-26` → `26-08-2026` (formulario) o `2026-08-26` (API). */
export function fechaSafi(iso: string, via: ViaSafi = "HTTP"): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!partes) return "";
  return via === "API" ? `${partes[1]}-${partes[2]}-${partes[3]}` : `${partes[3]}-${partes[2]}-${partes[1]}`;
}

/**
 * Secuencia del socio dentro de su Cuenta (`cf_909`).
 *
 * Es la misma numeración que usa el repositorio digital, y se comprobó sobre
 * 300 fichas reales de 259 cuentas: **`00` es siempre el titular** —ni una sola
 * excepción en la muestra— y `01`, `02`, `03`… son sus dependientes, en orden.
 * SAFI la escribe con dos dígitos.
 *
 *   Repositorio  `280`     →  No. Socio 280 · Secuencia 00
 *   Repositorio  `280-1`   →  No. Socio 280 · Secuencia 01
 *   Repositorio  `280-2`   →  No. Socio 280 · Secuencia 02
 *
 * De modo que el ordinal del nombre de archivo y la Secuencia de SAFI son el
 * mismo número: no hay dos numeraciones que conciliar.
 */
export function secuenciaSafi(ordinalDependiente: number | null): string {
  return String(ordinalDependiente ?? 0).padStart(2, "0");
}

/** El camino inverso: de la Secuencia de SAFI al ordinal del repositorio. */
export function ordinalDesdeSecuencia(secuencia: string): number | null {
  const numero = Number(secuencia.trim());
  if (!Number.isInteger(numero) || numero < 0) return null;
  return numero === 0 ? null : numero;
}

/* ------------------------------------------------------------------ */
/* Campos del módulo Cuenta                                            */
/* ------------------------------------------------------------------ */

export const CAMPOS_CUENTA = {
  nombre: "accountname",
  cedula: "siccode",
  correo: "email1",
  telefono: "phone",
  asignadoA: "assigned_user_id",
  tipoIdentificacion: "cf_965",
  grupoFacturacion: "cf_967",
  formaPago: "cf_969",
  tipoContribuyente: "cf_975",
  valorCuota: "cf_977",
  estadoSocio: "cf_865",
  direccion: "bill_street",
  ciudad: "bill_city",
  provincia: "bill_state",
  pais: "bill_country",
  /** «No Enviar Email»: 1 cuando el socio no acepta comunicaciones del Club. */
  noEnviarEmail: "emailoptout",
  descripcion: "description",
} as const;

/* ------------------------------------------------------------------ */
/* Campos del módulo Socio                                             */
/* ------------------------------------------------------------------ */

export const CAMPOS_SOCIO = {
  /** Id de la Cuenta del titular. Es lo que agrupa a la familia. */
  cuentaId: "account_id",
  cuentaNombre: "account_id_display",
  numeroSocio: "cf_901",
  /** Ordinal dentro de la cuenta: `00` el titular, `01`, `02`… los dependientes. */
  secuencia: "cf_909",
  cedula: "cf_927",
  nombres: "firstname",
  apellidos: "lastname",
  parentesco: "cf_943",
  fechaNacimiento: "birthday",
  segmento: "cf_925",
  genero: "cf_907",
  estadoSocio: "cf_911",
  tipoSocio: "cf_917",
  fechaIngreso: "cf_913",
  fechaRegistro: "cf_915",
  gradoMilitar: "cf_953",
  fuerza: "cf_955",
  estadoCivil: "cf_921",
  promocion: "cf_957",
  tipoSangre: "cf_959",
  hobbie: "cf_919",
  correo: "email",
  correoSecundario: "secondaryemail",
  telefonoDomicilio: "homephone",
  celular: "mobile",
  suscripcion: "cf_951",
  cuotaAnual: "cf_947",
  cuotaMensual: "cf_949",
  valorMembresia: "cf_945",
  direccion: "mailingstreet",
  ciudad: "mailingcity",
  provincia: "mailingstate",
  pais: "mailingcountry",
  /**
   * «Edad.» del CRM. La calculamos nosotros a partir de la fecha de nacimiento:
   * dejada al CRM, la primera ficha real salió con «25.15» para alguien de 24
   * años. Es la edad al registrarse, no se recalcula sola.
   */
  edad: "cf_1151",
  /** «No Enviar Email»: 1 cuando el socio no acepta comunicaciones del Club. */
  noEnviarEmail: "emailoptout",
  asignadoA: "assigned_user_id",
} as const;

/**
 * Campos de la ficha del Socio que existen en SAFI y que el sistema **no**
 * escribe, con el motivo. Están aquí para que nadie los añada por descuido
 * pensando que se olvidaron.
 *
 *   `cf_905` No. Tarjeta — va siempre vacío. El número de la credencial lo
 *     lleva el control de accesos, no el CRM.
 *   `imagename[]` Imagen del Contacto — el Club no trabaja las fotografías en
 *     SAFI. La fotografía tipo carnet queda en el expediente digital y su
 *     destino natural es el sistema de control de accesos, si la Gerencia
 *     aprueba la exposición de endpoints de Autoparking.
 */
export const CAMPOS_SOCIO_NO_USADOS = {
  numeroTarjeta: "cf_905",
  fotografia: "imagename[]",
} as const;

/* ------------------------------------------------------------------ */
/* Campos del módulo Documentos                                        */
/* ------------------------------------------------------------------ */

export const CAMPOS_DOCUMENTO = {
  titulo: "notes_title",
  carpeta: "folderid",
  /** `I` archivo interno subido · `E` enlace externo. */
  tipoUbicacion: "filelocationtype",
  estado: "filestatus",
  archivo: "filename",
  nota: "notecontent",
  version: "fileversion",
  asignadoA: "assigned_user_id",
} as const;

/**
 * SAFI tiene una sola carpeta de documentos, «Default».
 *
 * De ahí que el título sea lo único que identifica un documento, y que la
 * convención de nombres del repositorio (`280 APELLIDOS NOMBRES CEDULA`) se
 * use tal cual como título: la relación con la Cuenta lo ordena, el título lo
 * identifica.
 */
export const CARPETA_POR_DEFECTO = "1";

/* ------------------------------------------------------------------ */
/* Listas de valores                                                   */
/* ------------------------------------------------------------------ */

/**
 * Tipo de socio (`cf_917`). La correspondencia vive en el dominio
 * (`src/domain/sociosSafi.ts`) desde el 23/09/2026, porque la tableta también
 * necesita reconocer la categoría de un socio que consultó en SAFI; se
 * reexporta aquí para que este archivo siga siendo la traducción completa.
 */
export { TIPO_SOCIO_SAFI };

/**
 * Valores de `cf_917` que se comprobaron presentes en el CRM el 26 de agosto de
 * 2026.
 *
 * Es solo el **respaldo**: cuando hay conexión manda la lista que devuelve
 * `operation=describe`, de modo que un valor añadido en SAFI se admite sin
 * tocar este archivo. Esta constante sirve para avisar con sentido cuando el
 * CRM no responde o la integración está en modo manual.
 */
const TIPOS_SOCIO_EN_SAFI = new Set([
  "FUNDADOR",
  "ACTIVO",
  "CONYUGE",
  "DEPENDIENTE JUVENIL O PADRES",
  "PARTICULAR DEPENDIENTE A",
  "PARTICULAR DEPENDIENTE B SOLTERO",
  "PARTICULAR DEPENDIENTE B CASADO",
  "PARTICULAR DEPENDIENTE C",
  "PARTICULAR A",
  "PARTICULAR B",
  "CORRESPONSAL B",
  "CORRESPONSAL C",
  "SUSCRIPTOR GIMNASIO",
  "SUSCRIPTOR TENIS",
  // Los tres siguientes existen en el CRM y no en nuestro catálogo. «CONYUGE Y
  // PADRES TITULARES» es el código 114 del tarifario —quien recibió por traspaso
  // la titularidad de la membresía—; los otros dos son restos de la carga
  // histórica. Constan aquí para que la comprobación refleje el CRM tal cual es.
  "CONYUGE Y PADRES TITULARES",
  "OTRO",
  "Complete Aqui",
]);

/**
 * SAFI distingue el Dependiente B casado del soltero, igual que los dos
 * formularios físicos.
 */
export function tipoSocioSafi(tipo: TipoMiembro | null, esCasado: boolean): string | null {
  if (!tipo) return null;
  if (tipo === "DB") return esCasado ? TIPO_SOCIO_SAFI_DB_CASADO : TIPO_SOCIO_SAFI.DB;
  return TIPO_SOCIO_SAFI[tipo];
}

/** Si ese tipo de socio ya tiene su valor creado en la lista `cf_917` del CRM. */
export function tipoSocioExisteEnSafi(valor: string | null): boolean {
  return valor !== null && TIPOS_SOCIO_EN_SAFI.has(valor);
}

/**
 * Segmento (`cf_925`): distingue al titular de sus dependientes.
 *
 * No hace falta pedirlo en la aplicación —«Segmento» no le dice nada a quien
 * llena el formulario—: se deduce del tipo de socio, igual que el tipo de socio
 * de SAFI. Un solo campo del asistente llena los dos del CRM.
 */
export const SEGMENTO_SAFI: Record<TipoMiembro, string> = {
  SF: "Socio",
  SA: "Socio",
  CONYUGE: "Conyuge",
  JUVENIL: "Juvenil",
  // Se afina con el sexo en `segmentoSafi`: la lista del CRM distingue los dos.
  PADRES: "Padre",
  DA: "Socio",
  DB: "Socio",
  DC: "Socio",
  PA: "Socio",
  PB: "Socio",
  CA: "Socio",
  CB: "Socio",
  CC: "Socio",
  SG: "OTROS",
  ST: "OTROS",
};

/**
 * Segmento de una persona concreta.
 *
 * La lista `cf_925` del CRM tiene `Padre` y `Madre` por separado, así que un
 * solo tipo de socio nuestro —«Padres»— se reparte entre los dos según el sexo
 * de la persona. Sin este matiz, la madre de un oficial quedaría registrada
 * como padre.
 */
export function segmentoSafi(tipo: TipoMiembro | null, sexo: string | null): string {
  if (!tipo) return "";
  if (tipo === "PADRES") return sexo === "Femenino" ? "Madre" : "Padre";
  return SEGMENTO_SAFI[tipo];
}

/**
 * Forma de pago (`cf_969`).
 *
 * Cubre las cinco opciones de SAFI. La transferencia FAE se añadió al catálogo
 * del Club a raíz de este levantamiento: SAFI ya la contemplaba.
 */
export const FORMA_PAGO_SAFI: Record<FormaPago, string> = {
  TRANSFERENCIA_FAE: "FAE – TRANSFERENCIA",
  DESCUENTO_ISFA: "ISSFA – TRANSFERENCIA",
  TARJETA_CREDITO: "TARJETAS DE CREDITO – DEBITO A LA CUENTA",
  DEBITO_BANCARIO: "DEBITOS BANCARIOS – DEBITO A LA CUENTA",
  VENTANILLA: "OTROS – EFECTIVO",
};

/** Estado civil (`cf_921`). SAFI llama «Unión Libre» a la unión de hecho. */
export const ESTADO_CIVIL_SAFI: Record<string, string> = {
  Soltero: "Soltero",
  Casado: "Casado",
  Viudo: "Viudo",
  Divorciado: "Divorciado",
  "Unión de hecho": "Unión Libre",
};

/** Fuerza (`cf_955`). */
export const FUERZA_SAFI: Record<string, string> = {
  Aérea: "FUERZA AEREA",
  Naval: "FUERZA NAVAL O ARMADA",
  Terrestre: "FUERZA TERRESTRE O EJERCITO",
};

/** Valor que SAFI usa cuando el socio no es militar. */
export const SIN_DATO_MILITAR = "NO APLICA";

/** Estado del socio al crearlo. */
export const ESTADO_SOCIO_ACTIVO = "Activo";

/** Tipo de identificación: el Club afilia personas naturales con cédula. */
export const TIPO_IDENTIFICACION_CEDULA = "C.C";

/** Tipo de contribuyente habitual. */
export const TIPO_CONTRIBUYENTE_POR_DEFECTO = "CLIENTES LOCALES NO RELACIONADOS";

/* ------------------------------------------------------------------ */
/* Listas cerradas que confirma la Jefatura de Socios                  */
/* ------------------------------------------------------------------ */

/**
 * Las cuatro listas que la Jefatura de Socios selecciona en su bandeja antes de
 * que el sistema cree el socio en SAFI, más las tres de importes.
 *
 * Se declaran aquí, y no en el dominio compartido, porque son el catálogo del
 * CRM y no una regla del Club: si SAFI añade un valor, se añade en este archivo
 * y aparece solo en el panel.
 */

/** «Grupo Facturación» (`cf_967`) de la Cuenta. */
export const GRUPOS_FACTURACION = [
  "FAE",
  "ISFFA",
  "OTROS",
  "BGR",
  "OFICINA",
  "TARJETA DINERS CLUB",
  "TARJETA VISA",
  "TARJETA MASTERCARD",
] as const;

/**
 * «Tipo Contribuyente» (`cf_975`) de la Cuenta. Los nueve valores del CRM,
 * leídos con `describe` el 2 de septiembre de 2026.
 *
 * Obsérvese «CLIENTES EXTERIOR NO RELACIONADOS», sin «DEL». Es un buen recordatorio
 * de por qué estas listas se leen y no se deducen: escrito de memoria habría
 * salido mal y SAFI lo habría rechazado.
 */
export const TIPOS_CONTRIBUYENTE = [
  "CLIENTES LOCALES NO RELACIONADOS",
  "CLIENTES LOCALES RELACIONADOS",
  "CLIENTES EXTERIOR NO RELACIONADOS",
  "CLIENTES EXTERIOR RELACIONADOS",
  "PROVEEDORES LOCALES NO RELACIONADOS",
  "PROVEEDORES EXTERIOR NO RELACIONADOS",
  "PROVEEDORES LOCALES RELACIONADOS",
  "PROVEEDORES EXTERIOR RELACIONADOS",
  "EMPLEADOS",
] as const;

/** «FORMA_PAGO» (`cf_969`) de la Cuenta, en la glosa exacta del CRM. */
export const FORMAS_PAGO_SAFI = [
  "FAE – TRANSFERENCIA",
  "ISSFA – TRANSFERENCIA",
  "TARJETAS DE CREDITO – DEBITO A LA CUENTA",
  "DEBITOS BANCARIOS – DEBITO A LA CUENTA",
  "OTROS – EFECTIVO",
] as const;

/** «Subscriciones» (`cf_951`) de la ficha del Socio. */
export const SUSCRIPCIONES_SAFI = ["Mensual", "Trimestral", "Semestral", "Anual"] as const;

/**
 * Importes admitidos por las tres listas cerradas de la ficha del Socio, leídos
 * del CRM con `describe` el 2 de septiembre de 2026.
 *
 * El tarifario del Club (`src/domain/cuotas.ts`) es el que manda sobre cuánto
 * paga cada tipo de socio; estas listas dicen únicamente qué puede guardar SAFI
 * hoy. Cuando el tarifario pide un importe que no está aquí, el panel lo avisa
 * para que se añada al CRM: es preferible a redondear al valor más cercano y
 * dejar al socio clasificado con una cuota que no es la suya.
 *
 * Hoy falta exactamente lo del **Corresponsal A** —480 anual y 40 mensual—,
 * coherente con que ese tipo de socio tampoco exista todavía en `cf_917`.
 *
 * Se transcriben tal cual están en el CRM, **incluidos los valores basura**
 * (`0,00`, `????`, o el `1200` que alguien metió en la lista de importes
 * mensuales). Existen, así que una ficha antigua puede tenerlos y el sistema
 * debe reconocerlos; lo que hace el panel es no ofrecerlos para elegir, que es
 * distinto. Ver `VALORES_DE_RELLENO`.
 */
export const CUOTAS_ANUALES_SAFI = [
  "0",
  "120",
  "130",
  "240",
  "250",
  "288",
  "400",
  "420",
  "450",
  "540",
  "600",
  "1200",
  "0,00",
  "????",
] as const;

export const CUOTAS_MENSUALES_SAFI = [
  "0",
  "10",
  "20",
  "24",
  "35",
  "45",
  "50",
  "100",
  "1200",
] as const;

export const MEMBRESIAS_SAFI = [
  "0",
  "625",
  "3500",
  "7000",
  "0,00",
  "7000,00",
  "3500,00",
  "????",
] as const;

/**
 * Valores que existen en las listas de SAFI pero que nadie debería elegir: son
 * marcadores a medio llenar de la carga histórica.
 *
 * El panel los oculta en lugar de borrarlos del CRM, que no nos corresponde. Si
 * la Jefatura de Socios los limpia algún día, esto deja de tener efecto solo.
 */
export const VALORES_DE_RELLENO = new Set(["????", "Complete Aqui", "Completar Aqui", "OTRO"]);

/**
 * Si un importe está en una de esas listas.
 *
 * Compara por valor numérico y no por texto: el tarifario escribe `288.00` y
 * SAFI guarda `288`, y son el mismo importe.
 */
export function importeEnLista(valor: string, lista: readonly string[]): boolean {
  const numero = Number(String(valor).replace(",", "."));
  if (!Number.isFinite(numero)) return false;
  return lista.some((admitido) => Number(admitido) === numero);
}

/* ------------------------------------------------------------------ */
/* Composición de campos                                               */
/* ------------------------------------------------------------------ */

/**
 * Teléfono principal de la Cuenta (`phone`).
 *
 * Se prefiere el celular: hoy es el número que casi todo socio tiene y usa, y
 * el convencional del domicilio es cada vez más raro. Si no hubiera celular se
 * toma el del domicilio antes que dejar la Cuenta sin teléfono.
 */
export function telefonoPrincipal(celular: string, telefonoDomicilio: string): string {
  return celular.trim() || telefonoDomicilio.trim();
}

/**
 * «Parentesco» (`cf_943`) de la ficha del Socio.
 *
 * No guarda la palabra del vínculo —de eso ya se encarga el Segmento— sino la
 * identificación del socio titular del que depende esa persona: su grado
 * militar, si lo tiene, seguido de sus nombres y luego de sus apellidos. Es
 * cómo la Jefatura de Socios reconoce en pantalla de quién cuelga cada ficha.
 *
 * Va vacío en la ficha del propio titular, que no depende de nadie. Es la misma
 * composición que la línea «de …» del PGS1-11 (`nombreConGrado`), que tampoco
 * escribe el «NO APLICA» de quien no es militar.
 */
export function parentescoSafi(entrada: {
  gradoMilitarTitular: string;
  nombresTitular: string;
  apellidosTitular: string;
}): string {
  return nombreConGrado({
    gradoMilitar: entrada.gradoMilitarTitular,
    nombres: entrada.nombresTitular,
    apellidos: entrada.apellidosTitular,
  });
}
