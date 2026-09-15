import { getTipo, reglasDe, type TipoMiembro } from "./tiposMiembro";

/**
 * Documentos que conforman el expediente digital del socio.
 *
 * Cada tipo declara además la etiqueta con la que la Jefatura del Área de
 * Socios nombra el archivo cuando lo escanea a la carpeta compartida. Esa
 * etiqueta es lo que permite que el archivo depositado se clasifique solo,
 * sin que nadie tenga que subirlo a mano (ver `expediente.ts`).
 *
 * Los requisitos se derivan de la lista impresa al pie de cada formulario:
 * «Requisitos para carnetización: Cédula de Ciudadanía, Tarjeta Militar (de ser
 * el caso), formulario de información del socio lleno y firmado, credencial
 * anterior (opcional), factura de pago de la credencial ($5,00 c/u), copia de
 * la cédula del Oficial de FAE en caso de ser socio D-A o D-B».
 */

export const TIPOS_DOCUMENTO = [
  "FORMULARIO_FIRMADO",
  "CARTA_COMPROMISO",
  "CEDULA_SOLICITANTE",
  "CEDULA_TITULAR",
  "TARJETA_MILITAR",
  "PARTIDA_MATRIMONIO",
  "PARTIDA_NACIMIENTO",
  "CREDENCIAL_ANTERIOR",
  "FACTURA_CREDENCIAL",
  "OTRO",
] as const;

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export type RequisitoDocumental = {
  tipo: TipoDocumento;
  nombre: string;
  descripcion: string;
  obligatorio: boolean;
  /** Permite adjuntar más de un archivo (p. ej. anverso y reverso). */
  multiple: boolean;
  /** Sugerir cámara en lugar de galería/archivos. */
  preferirCamara: boolean;
  /**
   * Sufijo del nombre del archivo escaneado. Cadena vacía para el formulario,
   * que se nombra solo con el número de socio y el nombre del socio.
   */
  etiquetaEscaneo: string;
  /** Otras formas de escribir la etiqueta que el sistema también reconoce. */
  aliasEscaneo: string[];
  /**
   * El documento llega escaneado desde la Jefatura de Socios, no se captura con
   * la cámara de la tableta durante la afiliación.
   */
  llegaPorEscaneo: boolean;
  /**
   * Lo genera el propio sistema con los datos y las firmas capturadas: no se
   * escanea ni se fotografía. Es el caso del formulario de ingreso y de la
   * carta de compromiso, que viajan juntos en un solo documento.
   */
  generadoPorElSistema: boolean;
};

const REQUISITOS: Record<TipoDocumento, Omit<RequisitoDocumental, "obligatorio">> = {
  FORMULARIO_FIRMADO: {
    tipo: "FORMULARIO_FIRMADO",
    nombre: "Formulario de ingreso firmado",
    descripcion:
      "R-PGS1-1, hoja de solicitud de la categoría, carta de compromiso cuando corresponde y reverso con las tres constancias. Lo genera el sistema con las firmas capturadas en la tableta y lo archiva solo al aprobarse el ingreso.",
    multiple: false,
    preferirCamara: false,
    etiquetaEscaneo: "",
    aliasEscaneo: ["FORMULARIO", "SOLICITUD"],
    llegaPorEscaneo: false,
    generadoPorElSistema: true,
  },
  CARTA_COMPROMISO: {
    tipo: "CARTA_COMPROMISO",
    nombre: "Carta de compromiso",
    descripcion:
      "Carta de compromiso firmada por el socio y sus garantes. Va incluida en el formulario de ingreso que genera el sistema.",
    multiple: false,
    preferirCamara: false,
    etiquetaEscaneo: "CARTA DE COMPROMISO",
    aliasEscaneo: ["CARTA COMPROMISO", "CARTA"],
    llegaPorEscaneo: false,
    generadoPorElSistema: true,
  },
  CEDULA_SOLICITANTE: {
    tipo: "CEDULA_SOLICITANTE",
    nombre: "Cédula de ciudadanía",
    descripcion: "Anverso y reverso, legibles y sin reflejos.",
    multiple: true,
    preferirCamara: true,
    etiquetaEscaneo: "CEDULA",
    aliasEscaneo: ["CEDULA DE CIUDADANIA", "CI"],
    llegaPorEscaneo: true,
    generadoPorElSistema: false,
  },
  CEDULA_TITULAR: {
    tipo: "CEDULA_TITULAR",
    nombre: "Cédula del oficial FAE del que depende",
    descripcion:
      "Exigida por el formulario para los socios D-A y D-B, y para los dependientes de un socio titular.",
    multiple: true,
    preferirCamara: true,
    etiquetaEscaneo: "CEDULA TITULAR",
    aliasEscaneo: ["CEDULA DEL TITULAR", "CEDULA OFICIAL"],
    llegaPorEscaneo: true,
    generadoPorElSistema: false,
  },
  TARJETA_MILITAR: {
    tipo: "TARJETA_MILITAR",
    nombre: "Tarjeta militar",
    descripcion: "Credencial militar del oficial. Exigida «de ser el caso» por el formulario.",
    multiple: true,
    preferirCamara: true,
    etiquetaEscaneo: "TARJETA MILITAR",
    aliasEscaneo: ["CREDENCIAL MILITAR", "CERTIFICADO MILITAR"],
    llegaPorEscaneo: true,
    generadoPorElSistema: false,
  },
  PARTIDA_MATRIMONIO: {
    tipo: "PARTIDA_MATRIMONIO",
    nombre: "Acta de matrimonio o unión de hecho",
    descripcion: "Documento que acredita el vínculo con el socio titular.",
    multiple: false,
    preferirCamara: true,
    etiquetaEscaneo: "ACTA DE MATRIMONIO",
    aliasEscaneo: ["PARTIDA DE MATRIMONIO", "MATRIMONIO", "UNION DE HECHO"],
    llegaPorEscaneo: true,
    generadoPorElSistema: false,
  },
  PARTIDA_NACIMIENTO: {
    tipo: "PARTIDA_NACIMIENTO",
    nombre: "Partida de nacimiento",
    descripcion: "Documento que acredita el parentesco con el socio titular.",
    multiple: false,
    preferirCamara: true,
    etiquetaEscaneo: "PARTIDA DE NACIMIENTO",
    aliasEscaneo: ["PARTIDA NACIMIENTO", "NACIMIENTO"],
    llegaPorEscaneo: true,
    generadoPorElSistema: false,
  },
  CREDENCIAL_ANTERIOR: {
    tipo: "CREDENCIAL_ANTERIOR",
    nombre: "Credencial anterior",
    descripcion: "Opcional. Credencial de socio previamente emitida.",
    multiple: false,
    preferirCamara: true,
    etiquetaEscaneo: "CREDENCIAL ANTERIOR",
    aliasEscaneo: ["CREDENCIAL"],
    llegaPorEscaneo: true,
    generadoPorElSistema: false,
  },
  FACTURA_CREDENCIAL: {
    tipo: "FACTURA_CREDENCIAL",
    nombre: "Factura de la credencial",
    descripcion: "Comprobante del pago de la credencial (USD 5,00).",
    multiple: false,
    preferirCamara: false,
    etiquetaEscaneo: "FACTURA",
    aliasEscaneo: ["FACTURA CREDENCIAL"],
    llegaPorEscaneo: true,
    generadoPorElSistema: false,
  },
  OTRO: {
    tipo: "OTRO",
    nombre: "Documento adicional",
    descripcion: "Cualquier otro documento solicitado por el Área de Socios.",
    multiple: true,
    preferirCamara: false,
    etiquetaEscaneo: "OTROS",
    aliasEscaneo: ["ANEXO", "ADICIONAL"],
    llegaPorEscaneo: true,
    generadoPorElSistema: false,
  },
};

/** Requisitos documentales aplicables al tipo de socio indicado. */
export function requisitosPara(tipo: TipoMiembro | null): RequisitoDocumental[] {
  const reglas = reglasDe(tipo);
  if (!tipo || !reglas) return [];

  const definicion = getTipo(tipo);
  const lista: RequisitoDocumental[] = [
    { ...REQUISITOS.FORMULARIO_FIRMADO, obligatorio: true },
    { ...REQUISITOS.CEDULA_SOLICITANTE, obligatorio: true },
  ];

  if (definicion.cartaCompromiso) {
    lista.push({ ...REQUISITOS.CARTA_COMPROMISO, obligatorio: true });
  }

  // El formulario exige la cédula del oficial FAE para los dependientes del
  // titular y para los socios D-A y D-B.
  if (reglas.requiereSocioTitular || reglas.requiereNumeroSocioActivo) {
    lista.push({ ...REQUISITOS.CEDULA_TITULAR, obligatorio: true });
  }

  if (tipo === "CONYUGE") lista.push({ ...REQUISITOS.PARTIDA_MATRIMONIO, obligatorio: true });
  if (tipo === "JUVENIL" || tipo === "PADRES" || tipo === "DA" || tipo === "DB" || tipo === "DC") {
    lista.push({ ...REQUISITOS.PARTIDA_NACIMIENTO, obligatorio: tipo !== "DC" });
  }

  if (reglas.requiereDatosMilitares) {
    lista.push({ ...REQUISITOS.TARJETA_MILITAR, obligatorio: false });
  }

  lista.push({ ...REQUISITOS.CREDENCIAL_ANTERIOR, obligatorio: false });
  lista.push({ ...REQUISITOS.OTRO, obligatorio: false });
  return lista;
}

/**
 * Documentos que deben llegar escaneados desde la Jefatura de Socios. Son los
 * que el sistema vigila en la carpeta compartida para avisar, en la bandeja del
 * Área de Socios, cuáles faltan por depositar.
 *
 * El formulario y la carta de compromiso no están aquí: los genera el sistema
 * con las firmas capturadas en la tableta, así que no hay que imprimirlos,
 * firmarlos ni escanearlos.
 */
export function escaneosEsperados(tipo: TipoMiembro | null): TipoDocumento[] {
  return requisitosPara(tipo)
    .filter((r) => r.obligatorio && r.llegaPorEscaneo)
    .map((r) => r.tipo);
}

/*
 * Aquí vivía `requisitosCapturables`: lo que la tableta capturaba durante la
 * afiliación. Era únicamente la fotografía tipo carnet, retirada el 15/09/2026
 * (ver `docs/RETIRADO-fotografia-carnet.md`), así que la lista quedaba siempre
 * vacía y la función se eliminó. Hoy la tableta solo captura firmas; todo lo
 * demás llega escaneado a la carpeta compartida o lo genera el sistema.
 */

export function requisitoDe(tipo: TipoDocumento): Omit<RequisitoDocumental, "obligatorio"> {
  return REQUISITOS[tipo];
}

export function nombreDocumento(tipo: TipoDocumento): string {
  return REQUISITOS[tipo].nombre;
}

/** Etiqueta con la que se nombra el archivo escaneado de este documento. */
export function etiquetaEscaneo(tipo: TipoDocumento): string {
  return REQUISITOS[tipo].etiquetaEscaneo;
}

/** Todas las etiquetas reconocidas, de la más larga a la más corta. */
export function etiquetasReconocidas(): { tipo: TipoDocumento; etiqueta: string }[] {
  return TIPOS_DOCUMENTO.flatMap((tipo) => {
    const requisito = REQUISITOS[tipo];
    const todas = [requisito.etiquetaEscaneo, ...requisito.aliasEscaneo].filter(Boolean);
    return todas.map((etiqueta) => ({ tipo, etiqueta }));
  }).sort((a, b) => b.etiqueta.length - a.etiqueta.length);
}
