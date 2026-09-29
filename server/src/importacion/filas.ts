import {
  cuotaAnualSugerida,
  cuotaMensualSugerida,
  membresiaSugerida,
  periodicidadesDe,
  PERIODICIDAD_META,
} from "../../../src/domain/cuotas";
import type { FormaPago } from "../../../src/domain/facturacion";
import { calcularEdad } from "../../../src/domain/fechas";
import {
  confirmacionVacia,
  datosVacios,
  type ConfirmacionSafi,
  type DatosAfiliacion,
} from "../../../src/domain/solicitud";
import {
  normalizarNombreFinal,
  normalizarNumeroSocio,
  normalizarTextoInstitucional,
  sinTildes,
} from "../../../src/domain/texto";
import {
  ESTADOS_CIVILES,
  GRADOS_MILITARES,
  PAIS_POR_DEFECTO,
  PROVINCIAS,
  TIPOS_SANGRE,
  fuerzaFijaPara,
  type Sexo,
} from "../../../src/domain/tiposMiembro";
import {
  validarCedula,
  validarCelular,
  validarConvencional,
  validarCorreo,
  validarNombre,
} from "../../../src/domain/validaciones";
import type { ListasSafi } from "../safi/adaptador";
import {
  FORMAS_PAGO_SAFI,
  FORMA_PAGO_SAFI,
  GRUPOS_FACTURACION,
  MEMBRESIAS_SAFI,
  TIPOS_CONTRIBUYENTE,
  TIPO_CONTRIBUYENTE_POR_DEFECTO,
  VALORES_DE_RELLENO,
  importeEnLista,
} from "../safi/campos";
import { valorCuotaDe } from "../safi/registro";
import { COLUMNA_POR_CLAVE, type ClaveColumna } from "./columnas";
import type { CeldaLeida, FilaLeida, ListasPlantilla } from "./excel";
import type { MensajeFila } from "./lotes";

/**
 * Interpretación de una fila del Excel: de lo que se escribió a los datos de
 * una afiliación de Socio Activo, con los mismos criterios que la tableta y el
 * panel de la bandeja.
 *
 * Se normaliza lo que Excel suele estropear y tiene una sola lectura posible
 * —el 0 inicial que se come de la cédula y del celular, la fecha guardada como
 * número, un grado abreviado, «Sí» y «No»—; lo que no, se marca como error: es
 * preferible que la Jefatura corrija una celda a que SAFI reciba un dato
 * inventado.
 */

/** Tipo de socio de la importación. Solo oficiales FAE en esta versión. */
export const TIPO_IMPORTADO = "SA" as const;

/* ------------------------------------------------------------------ */
/* Catálogos                                                           */
/* ------------------------------------------------------------------ */

/** Las listas contra las que se comprueba cada fila: las del CRM, si responde. */
export type Catalogos = {
  grados: string[];
  formasPago: string[];
  gruposFacturacion: string[];
  tiposContribuyente: string[];
  membresias: string[];
  /** Si vienen del CRM en vivo o del respaldo de `campos.ts`. */
  enVivo: boolean;
};

/** Quita los marcadores de la carga histórica (`????`, `Complete Aqui`) y los importes repetidos. */
function sinRelleno(valores: readonly string[]): string[] {
  const vistos = new Set<string>();
  const limpios: string[] = [];
  for (const valor of valores) {
    if (VALORES_DE_RELLENO.has(valor) || !valor.trim()) continue;
    const numero = Number(valor.replace(",", "."));
    const clave = Number.isFinite(numero) ? String(numero) : valor;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    limpios.push(valor);
  }
  return limpios;
}

export function catalogosDe(listas: ListasSafi | null): Catalogos {
  const elegir = (vivas: string[] | undefined, respaldo: readonly string[]) =>
    sinRelleno(vivas && vivas.length > 0 ? vivas : respaldo);
  return {
    grados: elegir(listas?.gradoMilitar, GRADOS_MILITARES),
    formasPago: elegir(listas?.formaPago, FORMAS_PAGO_SAFI),
    gruposFacturacion: elegir(listas?.grupoFacturacion, GRUPOS_FACTURACION),
    tiposContribuyente: elegir(listas?.tipoContribuyente, TIPOS_CONTRIBUYENTE),
    membresias: elegir(listas?.valorMembresia, MEMBRESIAS_SAFI),
    enVivo: listas !== null,
  };
}

/* ------------------------------------------------------------------ */
/* Grados de la Fuerza Aérea                                           */
/* ------------------------------------------------------------------ */

/** Los grados de oficial de la FAE, sin el «S.P.» del servicio pasivo. */
const GRADOS_FAE = [
  "SUBTENIENTE",
  "TENIENTE",
  "CAPITAN",
  "MAYOR",
  "TENIENTE CORONEL",
  "CORONEL",
  "BRIGADIER GENERAL",
  "TENIENTE GENERAL",
  "GENERAL DEL AIRE",
];

/** Abreviaturas habituales de los grados FAE, sin puntos ni espacios. */
const ABREVIATURAS_GRADO: Record<string, string> = {
  SUBT: "SUBTENIENTE",
  SUBTTE: "SUBTENIENTE",
  SBTE: "SUBTENIENTE",
  STTE: "SUBTENIENTE",
  TNTE: "TENIENTE",
  TTE: "TENIENTE",
  CPTN: "CAPITAN",
  CAPT: "CAPITAN",
  MAYO: "MAYOR",
  MAY: "MAYOR",
  TCRN: "TENIENTE CORONEL",
  TCNL: "TENIENTE CORONEL",
  CRNL: "CORONEL",
  CNEL: "CORONEL",
  BGRL: "BRIGADIER GENERAL",
  BRIG: "BRIGADIER GENERAL",
  TGRL: "TENIENTE GENERAL",
  GRAL: "GENERAL DEL AIRE",
};

/** «GENERAL  DEL AIRE S.P.» → «GENERAL DEL AIRE»: el grado base, sin espacios dobles. */
function gradoBase(grado: string): { base: string; pasivo: boolean } {
  const plano = sinTildes(grado).toUpperCase().replace(/\s+/g, " ").trim();
  const pasivo = /(\bS\.? ?P\.?|\(S\.? ?P\.?\)|SERVICIO PASIVO)$/.test(plano);
  const base = plano
    .replace(/\(?\bS\.? ?P\.?\)?$|SERVICIO PASIVO$/, "")
    .replace(/[.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { base, pasivo };
}

/** Los grados FAE que se ofrecen en la plantilla, tal como los escribe el CRM. */
export function gradosFae(catalogo: string[]): string[] {
  return catalogo.filter((grado) => GRADOS_FAE.includes(gradoBase(grado).base));
}

/* ------------------------------------------------------------------ */
/* Utilidades de lectura                                               */
/* ------------------------------------------------------------------ */

/** Forma compacta para comparar valores de lista: sin tildes, signos ni espacios. */
function compacta(valor: string): string {
  return sinTildes(valor).toUpperCase().replace(/[^A-Z0-9Ñ]+/g, "");
}

/**
 * El valor de la lista que corresponde a lo escrito. Primero la coincidencia
 * exacta; después, sin tildes, mayúsculas ni signos, prefiriendo el valor sin
 * espacios dobles (SAFI tiene «GENERAL DEL AIRE» y «GENERAL  DEL AIRE»).
 */
function elegirDeLista(texto: string, opciones: readonly string[], alias: Record<string, string> = {}): string | null {
  const limpio = texto.trim();
  if (!limpio) return null;
  if (opciones.includes(limpio)) return limpio;
  const clave = compacta(limpio);
  const iguales = opciones.filter((opcion) => compacta(opcion) === clave);
  if (iguales.length > 0) return iguales.find((opcion) => !/\s{2,}/.test(opcion)) ?? iguales[0];
  const destino = alias[clave];
  if (destino) {
    return opciones.find((opcion) => compacta(opcion) === compacta(destino)) ?? null;
  }
  return null;
}

/** Hoy en el Ecuador (UTC−5 fija), como `AAAA-MM-DD`. */
export function hoyEcuador(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function iso(anio: number, mes: number, dia: number): string | null {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) return null;
  if (anio < 1900 || anio > 2100 || mes < 1 || mes > 12 || dia < 1) return null;
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  if (dia > diasDelMes) return null;
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Una fecha escrita en Excel: celda de fecha, número de serie o texto
 * dd/mm/aaaa (también con guiones o puntos, o aaaa-mm-dd).
 */
function leerFecha(celda: CeldaLeida | undefined): { iso: string; aviso?: string } | { error: string } | null {
  // Una celda con error de Excel ya la señala `interpretarFila` una vez.
  if (!celda || (!celda.texto && !celda.fecha && celda.numero === undefined)) return null;

  if (celda.fecha) {
    const valor = iso(celda.fecha.anio, celda.fecha.mes, celda.fecha.dia);
    return valor ? { iso: valor } : { error: "La fecha no es válida." };
  }

  if (celda.numero !== undefined && celda.numero >= 1 && celda.numero < 80000) {
    // Número de serie de Excel: días desde el 30/12/1899.
    const fecha = new Date(Date.UTC(1899, 11, 30) + Math.floor(celda.numero) * 86400000);
    const valor = iso(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, fecha.getUTCDate());
    return valor ? { iso: valor } : { error: "La fecha no es válida." };
  }

  const texto = celda.texto.trim();
  let coincidencia = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(texto);
  if (coincidencia) {
    const dia = Number(coincidencia[1]);
    const mes = Number(coincidencia[2]);
    let anio = Number(coincidencia[3]);
    let aviso: string | undefined;
    if (mes > 12 && dia <= 12) {
      return { error: `«${texto}» parece escrita mes/día. Escríbala como dd/mm/aaaa.` };
    }
    if (coincidencia[3].length === 2) {
      const siglo = anio <= Number(hoyEcuador().slice(2, 4)) ? 2000 : 1900;
      anio += siglo;
      aviso = `El año se escribió con dos cifras: se entendió ${anio}.`;
    }
    const valor = iso(anio, mes, dia);
    return valor ? { iso: valor, aviso } : { error: `«${texto}» no es una fecha válida (dd/mm/aaaa).` };
  }

  coincidencia = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/.exec(texto);
  if (coincidencia) {
    const valor = iso(Number(coincidencia[1]), Number(coincidencia[2]), Number(coincidencia[3]));
    return valor ? { iso: valor } : { error: `«${texto}» no es una fecha válida.` };
  }

  return { error: `«${texto}» no es una fecha. Escríbala como dd/mm/aaaa.` };
}

/** Solo los dígitos de una celda que Excel pudo haber guardado como número. */
function digitos(celda: CeldaLeida | undefined): string {
  return (celda?.texto ?? "").replace(/\D/g, "");
}

/* ------------------------------------------------------------------ */
/* Correspondencias de valores                                         */
/* ------------------------------------------------------------------ */

const SEXOS: Record<string, Sexo> = {
  M: "Masculino",
  MASCULINO: "Masculino",
  HOMBRE: "Masculino",
  H: "Masculino",
  VARON: "Masculino",
  F: "Femenino",
  FEMENINO: "Femenino",
  MUJER: "Femenino",
};

const ESTADOS_CIVILES_ALIAS: Record<string, string> = {
  S: "Soltero",
  SOLTERA: "Soltero",
  C: "Casado",
  CASADA: "Casado",
  D: "Divorciado",
  DIVORCIADA: "Divorciado",
  V: "Viudo",
  VIUDA: "Viudo",
  U: "Unión de hecho",
  UNIONLIBRE: "Unión de hecho",
  UNIONDEHECHO: "Unión de hecho",
};

/** Formas de pago escritas con su nombre corriente, hacia la glosa exacta de SAFI. */
const FORMAS_PAGO_ALIAS: Record<string, string> = {
  FAE: FORMA_PAGO_SAFI.TRANSFERENCIA_FAE,
  TRANSFERENCIAFAE: FORMA_PAGO_SAFI.TRANSFERENCIA_FAE,
  ISSFA: FORMA_PAGO_SAFI.DESCUENTO_ISFA,
  ISFA: FORMA_PAGO_SAFI.DESCUENTO_ISFA,
  ISFFA: FORMA_PAGO_SAFI.DESCUENTO_ISFA,
  DESCUENTOISSFA: FORMA_PAGO_SAFI.DESCUENTO_ISFA,
  DESCUENTOAUTOMATICOISFA: FORMA_PAGO_SAFI.DESCUENTO_ISFA,
  TARJETA: FORMA_PAGO_SAFI.TARJETA_CREDITO,
  TARJETADECREDITO: FORMA_PAGO_SAFI.TARJETA_CREDITO,
  DEBITO: FORMA_PAGO_SAFI.DEBITO_BANCARIO,
  DEBITOBANCARIO: FORMA_PAGO_SAFI.DEBITO_BANCARIO,
  EFECTIVO: FORMA_PAGO_SAFI.VENTANILLA,
  VENTANILLA: FORMA_PAGO_SAFI.VENTANILLA,
  PAGOENVENTANILLA: FORMA_PAGO_SAFI.VENTANILLA,
};

/** Grupo de facturación que se deduce sin ambigüedad de la forma de pago. */
const GRUPO_POR_FORMA: Partial<Record<FormaPago, string>> = {
  TRANSFERENCIA_FAE: "FAE",
  DESCUENTO_ISFA: "ISFFA",
  VENTANILLA: "OFICINA",
};

function formaPagoDeGlosa(glosa: string): FormaPago | null {
  const entrada = (Object.entries(FORMA_PAGO_SAFI) as [FormaPago, string][]).find(
    ([, valor]) => compacta(valor) === compacta(glosa)
  );
  return entrada ? entrada[0] : null;
}

const SI = new Set(["SI", "S", "X", "1", "VERDADERO", "TRUE", "ACEPTA", "YES"]);
const NO = new Set(["NO", "N", "0", "FALSO", "FALSE", "NOACEPTA"]);

/* ------------------------------------------------------------------ */
/* Una fila                                                            */
/* ------------------------------------------------------------------ */

export type FilaInterpretada = {
  fila: number;
  /** Número de socio escrito en el archivo, normalizado. Vacío si no trae. */
  numeroDelArchivo: string;
  datos: DatosAfiliacion;
  confirmacion: ConfirmacionSafi;
  comunicaciones: boolean;
  errores: MensajeFila[];
  avisos: MensajeFila[];
};

export function interpretarFila(leida: FilaLeida, catalogos: Catalogos): FilaInterpretada {
  const errores: MensajeFila[] = [];
  const avisos: MensajeFila[] = [];
  const celda = (clave: ClaveColumna) => leida.celdas[clave];
  const texto = (clave: ClaveColumna) => (celda(clave)?.texto ?? "").trim();
  const error = (columna: ClaveColumna, mensaje: string) => errores.push({ columna, texto: mensaje });
  const aviso = (columna: ClaveColumna, mensaje: string) => avisos.push({ columna, texto: mensaje });
  const falta = (columna: ClaveColumna) =>
    error(columna, `Falta «${COLUMNA_POR_CLAVE[columna].titulo}».`);

  for (const [clave, leido] of Object.entries(leida.celdas) as [ClaveColumna, CeldaLeida][]) {
    if (leido.error) error(clave, `La celda tiene un error de Excel (${leido.error}).`);
  }

  const datos = datosVacios();
  datos.tipoMiembro = TIPO_IMPORTADO;
  datos.fuerza = fuerzaFijaPara(TIPO_IMPORTADO);

  /* --- Número de socio ---------------------------------------------- */

  let numeroDelArchivo = "";
  if (texto("numeroSocio")) {
    if (!/^\d+$/.test(texto("numeroSocio").replace(/\s/g, ""))) {
      error(
        "numeroSocio",
        `«${texto("numeroSocio")}» no es un número de socio. Escriba solo el número del titular, sin guiones ni letras.`
      );
    } else {
      numeroDelArchivo = normalizarNumeroSocio(texto("numeroSocio"));
      if (!numeroDelArchivo || Number(numeroDelArchivo) === 0 || numeroDelArchivo.length > 6) {
        error("numeroSocio", `«${texto("numeroSocio")}» no es un número de socio válido.`);
        numeroDelArchivo = "";
      }
    }
  }

  /* --- Identificación ----------------------------------------------- */

  let cedula = digitos(celda("cedula"));
  // Excel guarda la cédula como número si la columna no es de texto, y se come
  // el 0 inicial de las provincias 01 a 09: 0912345678 queda en 912345678.
  if (cedula.length === 9 && celda("cedula")?.numero !== undefined) cedula = `0${cedula}`;
  if (!texto("cedula")) falta("cedula");
  else {
    const problema = validarCedula(cedula);
    if (problema) error("cedula", `${problema} (se leyó «${texto("cedula")}»).`);
  }
  datos.cedula = cedula;

  for (const [clave, etiqueta] of [
    ["apellidos", "apellido"],
    ["nombres", "nombre"],
  ] as const) {
    const valor = texto(clave).replace(/\s+/g, " ");
    const problema = validarNombre(valor, etiqueta);
    if (problema) error(clave, problema);
    datos[clave] = normalizarNombreFinal(valor);
  }

  const sexo = SEXOS[compacta(texto("sexo"))] ?? null;
  if (!texto("sexo")) falta("sexo");
  else if (!sexo) error("sexo", `«${texto("sexo")}» no es un sexo reconocido: escriba Masculino o Femenino.`);
  datos.sexo = sexo;

  const nacimiento = leerFecha(celda("fechaNacimiento"));
  if (!nacimiento) falta("fechaNacimiento");
  else if ("error" in nacimiento) error("fechaNacimiento", nacimiento.error);
  else {
    const edad = calcularEdad(nacimiento.iso);
    if (edad === null || edad < 18) {
      error("fechaNacimiento", `Con esa fecha tendría ${edad ?? "—"} años: un oficial es mayor de edad. Revise la fecha.`);
    } else if (edad > 100) {
      error("fechaNacimiento", `Con esa fecha tendría ${edad} años. Revise la fecha.`);
    } else {
      datos.fechaNacimiento = nacimiento.iso;
      if (nacimiento.aviso) aviso("fechaNacimiento", nacimiento.aviso);
    }
  }

  const estadoCivil = elegirDeLista(texto("estadoCivil"), ESTADOS_CIVILES, ESTADOS_CIVILES_ALIAS);
  if (!texto("estadoCivil")) falta("estadoCivil");
  else if (!estadoCivil) {
    error("estadoCivil", `«${texto("estadoCivil")}» no es un estado civil de la lista (${ESTADOS_CIVILES.join(", ")}).`);
  }
  datos.estadoCivil = estadoCivil ?? "";

  if (texto("tipoSangre")) {
    const sangre = sinTildes(texto("tipoSangre"))
      .toUpperCase()
      .replace(/\s+|RH|FACTOR/g, "")
      .replace(/POSITIVO|POS$/, "+")
      .replace(/NEGATIVO|NEG$/, "-")
      .replace(/^0/, "O");
    if ((TIPOS_SANGRE as readonly string[]).includes(sangre)) datos.tipoSangre = sangre;
    else if (["DESCONOCIDO", "NA", "ND", "SN"].includes(sangre)) {
      aviso("tipoSangre", "Tipo de sangre desconocido: la ficha se crea sin él.");
    } else {
      error("tipoSangre", `«${texto("tipoSangre")}» no es un tipo de sangre (${TIPOS_SANGRE.join(", ")}).`);
    }
  }

  /* --- Datos militares ---------------------------------------------- */

  if (!texto("grado")) falta("grado");
  else {
    const { base, pasivo } = gradoBase(texto("grado"));
    const completo = ABREVIATURAS_GRADO[compacta(base)] ?? base;
    const grado = elegirDeLista(`${completo}${pasivo ? " S.P." : ""}`, catalogos.grados);
    if (!grado) {
      error("grado", `«${texto("grado")}» no está en la lista de grados de SAFI. Elíjalo del desplegable de la plantilla.`);
    } else if (!GRADOS_FAE.includes(gradoBase(grado).base)) {
      error("grado", `${grado} no es un grado de la Fuerza Aérea: un Socio Activo es oficial FAE.`);
    } else {
      datos.gradoMilitar = grado;
      datos.situacion = pasivo ? "Pasivo" : "Activo";
    }
  }

  const promocion = digitos(celda("promocion"));
  if (!texto("promocion")) falta("promocion");
  else if (!promocion || promocion.length > 4 || Number(promocion) === 0) {
    error("promocion", `«${texto("promocion")}» no es un número de promoción.`);
  } else {
    datos.promocion = String(Number(promocion));
    if (/[a-z]/i.test(sinTildes(texto("promocion")).replace(/promocion/gi, ""))) {
      aviso("promocion", `Se tomó solo el número: ${datos.promocion}.`);
    }
  }

  /* --- Contacto ----------------------------------------------------- */

  let celular = digitos(celda("celular"));
  if (celular.startsWith("593") && celular.length === 12) celular = `0${celular.slice(3)}`;
  if (celular.length === 9 && celular.startsWith("9")) celular = `0${celular}`;
  if (!texto("celular")) falta("celular");
  else {
    const problema = validarCelular(celular);
    if (problema) error("celular", `${problema} (se leyó «${texto("celular")}»).`);
  }
  datos.celular = celular;

  let convencional = digitos(celda("convencional"));
  if (convencional) {
    if (convencional.startsWith("593") && convencional.length === 11) convencional = `0${convencional.slice(3)}`;
    if (convencional.length === 8 && /^[2-7]/.test(convencional)) convencional = `0${convencional}`;
    if (convencional.length === 7) {
      error("convencional", `«${texto("convencional")}» no tiene el código de provincia: escríbalo con él (022345678).`);
    } else {
      const problema = validarConvencional(convencional, false);
      if (problema) error("convencional", `${problema} (se leyó «${texto("convencional")}»).`);
    }
    datos.telefonoDomicilio = convencional;
  }

  const correo = texto("correo").replace(/^mailto:/i, "").trim().toLowerCase();
  if (!correo) falta("correo");
  else {
    const problema = validarCorreo(correo);
    if (problema) error("correo", `${problema} (se leyó «${texto("correo")}»).`);
  }
  datos.correo = correo;

  const direccion = normalizarTextoInstitucional(texto("direccion")).trim();
  if (!direccion) falta("direccion");
  else if (direccion.length < 8) {
    error("direccion", "Detalle la dirección: calle principal, número y calle secundaria.");
  }
  datos.direccion = direccion;

  const ciudad = normalizarTextoInstitucional(texto("ciudad")).trim();
  if (!ciudad) falta("ciudad");
  datos.ciudad = ciudad;

  const paisEscrito = texto("pais");
  const esEcuador = !paisEscrito || compacta(paisEscrito) === compacta(PAIS_POR_DEFECTO);
  datos.pais = esEcuador ? PAIS_POR_DEFECTO : paisEscrito;

  if (esEcuador) {
    const provincia = elegirDeLista(texto("provincia"), PROVINCIAS);
    if (!texto("provincia")) falta("provincia");
    else if (!provincia) error("provincia", `«${texto("provincia")}» no es una provincia del Ecuador.`);
    datos.provincia = provincia ?? "";
  } else {
    datos.provincia = texto("provincia");
  }

  datos.hobbie = texto("hobbie").slice(0, 100);

  /* --- Fechas del Club ---------------------------------------------- */

  const ingreso = leerFecha(celda("fechaIngreso"));
  if (ingreso) {
    if ("error" in ingreso) error("fechaIngreso", ingreso.error);
    else {
      datos.fechaIngresoClub = ingreso.iso;
      if (ingreso.aviso) aviso("fechaIngreso", ingreso.aviso);
      if (ingreso.iso > hoyEcuador()) aviso("fechaIngreso", "La fecha de ingreso es posterior a hoy.");
    }
  }

  let comunicaciones = false;
  if (texto("comunicaciones")) {
    const clave = compacta(texto("comunicaciones"));
    if (SI.has(clave)) comunicaciones = true;
    else if (!NO.has(clave)) {
      error("comunicaciones", `«${texto("comunicaciones")}»: escriba Sí o No.`);
    }
  }

  /* --- Facturación y cuota ------------------------------------------ */

  const confirmacion = confirmacionVacia();

  const periodicidades = periodicidadesDe(TIPO_IMPORTADO, datos.estadoCivil).map((p) => PERIODICIDAD_META[p].safi);
  const suscripcion = texto("suscripcion") ? elegirDeLista(texto("suscripcion"), periodicidades) : "Anual";
  if (!suscripcion) {
    error("suscripcion", `«${texto("suscripcion")}»: un Socio Activo paga ${periodicidades.join(" o ")}.`);
  }
  confirmacion.suscripcion = suscripcion ?? "";

  const anual = cuotaAnualSugerida(TIPO_IMPORTADO, datos.estadoCivil);
  const mensual = cuotaMensualSugerida(TIPO_IMPORTADO, datos.estadoCivil);
  confirmacion.cuotaAnual = suscripcion === "Anual" && anual !== null ? String(anual) : "";
  confirmacion.cuotaMensual = suscripcion === "Mensual" && mensual !== null ? String(mensual) : "";

  const formaPago = elegirDeLista(texto("formaPago"), catalogos.formasPago, FORMAS_PAGO_ALIAS);
  if (!texto("formaPago")) falta("formaPago");
  else if (!formaPago) {
    error("formaPago", `«${texto("formaPago")}» no es una forma de pago de SAFI. Elíjala del desplegable.`);
  }
  confirmacion.formaPago = formaPago ?? "";
  const forma = formaPago ? formaPagoDeGlosa(formaPago) : null;
  datos.formaPago = forma;

  if (texto("grupoFacturacion")) {
    const grupo = elegirDeLista(texto("grupoFacturacion"), catalogos.gruposFacturacion);
    if (!grupo) {
      error("grupoFacturacion", `«${texto("grupoFacturacion")}» no es un grupo de facturación de SAFI.`);
    } else {
      confirmacion.grupoFacturacion = grupo;
      if (forma === "TARJETA_CREDITO" && !/^TARJETA/.test(grupo)) {
        aviso("grupoFacturacion", `Paga con tarjeta de crédito y el grupo es ${grupo}: compruébelo.`);
      }
      if (forma === "DEBITO_BANCARIO" && /^TARJETA/.test(grupo)) {
        aviso("grupoFacturacion", `Paga con débito bancario y el grupo es ${grupo}: compruébelo.`);
      }
    }
  } else if (forma) {
    const deducido = GRUPO_POR_FORMA[forma];
    if (deducido && catalogos.gruposFacturacion.includes(deducido)) {
      confirmacion.grupoFacturacion = deducido;
    } else {
      error(
        "grupoFacturacion",
        "Con tarjeta de crédito o débito bancario indique el grupo de facturación: el banco o la tarjeta."
      );
    }
  }

  const tipoContribuyente = texto("tipoContribuyente")
    ? elegirDeLista(texto("tipoContribuyente"), catalogos.tiposContribuyente)
    : TIPO_CONTRIBUYENTE_POR_DEFECTO;
  if (!tipoContribuyente) {
    error("tipoContribuyente", `«${texto("tipoContribuyente")}» no es un tipo de contribuyente de SAFI.`);
  }
  confirmacion.tipoContribuyente = tipoContribuyente ?? "";

  const membresiaTarifario = membresiaSugerida(TIPO_IMPORTADO, datos.estadoCivil);
  const membresia = texto("valorMembresia")
    ? texto("valorMembresia").replace(/[$\s]/g, "")
    : membresiaTarifario !== null
      ? String(membresiaTarifario)
      : "0";
  if (!importeEnLista(membresia, catalogos.membresias)) {
    error(
      "valorMembresia",
      `${membresia} no está en la lista de membresías de SAFI (${catalogos.membresias.join(", ")}).`
    );
  } else {
    confirmacion.valorMembresia = String(Number(membresia.replace(",", ".")));
  }

  confirmacion.valorCuota = valorCuotaDe(confirmacion, {
    tipoMiembro: TIPO_IMPORTADO,
    estadoCivil: datos.estadoCivil,
  });

  return { fila: leida.fila, numeroDelArchivo, datos, confirmacion, comunicaciones, errores, avisos };
}

/* ------------------------------------------------------------------ */
/* Plantilla                                                           */
/* ------------------------------------------------------------------ */

/** Las listas desplegables de la plantilla, a partir de los catálogos. */
export function listasDePlantilla(catalogos: Catalogos): ListasPlantilla {
  return {
    sexo: ["Masculino", "Femenino"],
    estadoCivil: [...ESTADOS_CIVILES],
    tipoSangre: [...TIPOS_SANGRE],
    grado: gradosFae(catalogos.grados),
    provincia: [...PROVINCIAS],
    suscripcion: periodicidadesDe(TIPO_IMPORTADO, "").map((p) => PERIODICIDAD_META[p].safi),
    formaPago: catalogos.formasPago,
    grupoFacturacion: catalogos.gruposFacturacion,
    tipoContribuyente: catalogos.tiposContribuyente,
    valorMembresia: catalogos.membresias,
    siNo: ["Sí", "No"],
  };
}
