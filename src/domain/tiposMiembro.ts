/**
 * Catálogo de tipos de socio del Club La Campiña.
 *
 * **Hay dos formularios principales, y cada categoría lleva uno solo:**
 *
 *   · El **R-PGS1-1** es exclusivo del **Socio Activo**. Su propio formulario
 *     es a la vez su solicitud de ingreso.
 *   · El **PGS1-11** es el formulario de todas las demás categorías:
 *     fundador, dependientes del titular, dependientes, particulares,
 *     corresponsales y suscriptores.
 *
 * Lo corrigió el Coordinador de TICs el 15 de septiembre de 2026, al ver que un
 * trámite de «Padres» generaba los dos: antes se imprimía el R-PGS1-1 para todos
 * y encima la hoja de la categoría. **Nunca deben salir los dos juntos.**
 *
 * Al formulario principal se le añade, cuando la categoría lo tiene:
 *
 *   · La **hoja de solicitud de ingreso** propia de la categoría, la que suma
 *     los recuadros de cónyuge, hijos y socios garantes. Los dependientes de un
 *     socio titular —cónyuge, padres, juvenil— y el fundador no llevan ninguna:
 *     su formulario es el PGS1-11 y basta.
 *   · La **carta de compromiso**, en los socios dependientes y particulares.
 *
 * La aplicación no inventa campos: pide lo que llevan el formulario principal y
 * la hoja de la categoría elegida, y el PDF que genera reproduce esos mismos
 * documentos. Si el Club modifica un formulario impreso, se ajusta aquí y tanto
 * el asistente como el documento generado se alinean solos.
 *
 * Fuente de cada hoja de solicitud (el formulario principal va aparte):
 *   (ninguna)  El R-PGS1-1 es su formulario y su solicitud ..... Socio Activo
 *   (ninguna)  El PGS1-11 es su formulario y su solicitud ...... Fundador y dependientes del titular
 *   R-PGS1-22  Solicitud de Ingreso Socios D-A ................. Dependiente A
 *   R-PGS1-23  Solicitud de Ingreso Socios DS .................. Dependiente B (soltero)
 *   R-PGS1-24  Solicitud de Ingreso Socios BC .................. Dependiente B (casado)
 *   R-PGS1-25  Solicitud de Ingreso Socios DC .................. Dependiente C
 *   R-PGS1-8   Solicitud de Ingreso Socios PA-PB ............... Particular A
 *   R-PGS1-9   Solicitud de Ingreso Socios PB .................. Particular B
 *   R-PGS1-26  Solicitud de Ingreso Socios CA .................. Corresponsal A
 *   R-PGS01-6  Solicitud de Ingreso Socios CB .................. Corresponsal B
 *   R-PGS01-7  Solicitud de Ingreso Socios CC .................. Corresponsal C
 *   R-PGS1-12  Formulario Suscriptor Tenis ..................... Suscriptor de tenis
 *   R-PGS1-13  Formulario Suscriptor GYM ....................... Suscriptor de gimnasio
 *
 * El PGS1-11 es el único formulario del Club que contempla a la vez todas las
 * categorías —su columna de tipos las lista—, el que reposa en
 * `DEPENDIENTES DE SOCIOS TITULARES/`, y el que declara de qué socio principal
 * depende la persona.
 */

export const TIPOS_MIEMBRO = [
  "SF",
  "SA",
  "CONYUGE",
  "PADRES",
  "JUVENIL",
  "DA",
  "DB",
  "DC",
  "PA",
  "PB",
  "CA",
  "CB",
  "CC",
  "SG",
  "ST",
] as const;

export type TipoMiembro = (typeof TIPOS_MIEMBRO)[number];

export type CategoriaMiembro =
  | "Socios titulares"
  | "Dependientes del socio titular"
  | "Socios dependientes"
  | "Socios particulares"
  | "Socios corresponsales"
  | "Suscriptores";

/* ------------------------------------------------------------------ */
/* Anatomía de los documentos                                          */
/* ------------------------------------------------------------------ */

/**
 * El formulario principal, común a todas las categorías.
 *
 * Su título impreso dice «como SOCIO ACTIVO» porque nació para los cadetes; al
 * servir ahora a todas las categorías, el documento generado nombra en ese
 * lugar la categoría del solicitante (ver `ingresoComo`).
 */
export const FORMULARIO_PRINCIPAL = {
  codigo: "R-PGS1-1",
  tituloRegistro: "Solicitud de Ingreso Socios",
} as const;

/** Título del R-PGS1-1 para una categoría concreta. */
export function tituloFormularioPrincipal(codigo: TipoMiembro | null): string {
  const como = codigo ? CATALOGO_TIPOS[codigo].ingresoComo : "SOCIO";
  return `FORMULARIO DE INGRESO COMO ${como} AL CLUB SOCIAL Y DEPORTIVO DE OFICIALES DE LA FUERZA AÉREA ECUATORIANA – CLUB LA CAMPIÑA`;
}

/**
 * Las hojas de solicitud responden a dos maquetas:
 *
 * `SOLICITUD` — carta dirigida al Gerente («Señor GERENTE DEL CLUB LA CAMPIÑA
 * … Yo, ……… con C.I. ………»), seguida del recuadro DATOS PERSONALES ASPIRANTE y,
 * según la categoría, de los recuadros de cónyuge, hijos y socios garantes.
 *
 * `GENERAL` — el PGS1-11, encabezado por la columna de tipos de socio y, cuando
 * corresponde, por el nombre y el grado del socio principal.
 */
export type LayoutHoja = "SOLICITUD" | "GENERAL";

/** Recuadros que la hoja de solicitud añade al R-PGS1-1. */
export type BloquesHoja = {
  /** Recuadro «DATOS DEL CÓNYUGE» con cédula, nombres, contacto y trabajo. */
  conyuge: boolean;
  /** Rejilla «DATOS HIJOS»: nombres, fecha de nacimiento, sexo, estado civil y correo. */
  hijos: boolean;
  /** «SOCIO QUE LE GARANTIZA» / «SOCIOS QUE LE GARANTIZA»: 0, 1 ó 2 garantes con firma. */
  garantes: 0 | 1 | 2;
};

const SIN_RECUADROS: BloquesHoja = { conyuge: false, hijos: false, garantes: 0 };

export type HojaSolicitud = {
  /** Código del registro de calidad impreso al pie de la hoja. */
  codigo: string;
  /** Título tal como aparece en el encabezado de la hoja. */
  titulo: string;
  layout: LayoutHoja;
  bloques: BloquesHoja;
  /**
   * Algunas categorías tienen dos hojas según el estado civil del solicitante
   * (el Dependiente B tiene una para casados y otra para solteros). Cuando este
   * campo está presente, la hoja se elige comparando con el estado civil.
   */
  paraEstadoCivil?: "CASADO" | "SOLTERO";
};

/**
 * Todo lo que el trámite completo de un tipo de socio contiene: los recuadros
 * de su hoja de solicitud y los datos del R-PGS1-1 que dependen de la
 * categoría.
 */
export type BloquesFormulario = BloquesHoja & {
  /** Grado militar, promoción y situación (activo / pasivo) del propio solicitante. */
  datosMilitares: boolean;
  /** Fuerza a la que pertenece: Terrestre, Naval o Aérea. */
  fuerza: boolean;
  /** Nombre del socio principal y su grado militar, para los dependientes del titular. */
  vinculoTitular: boolean;
};

/** Modelos de carta de compromiso que acompañan a la solicitud de ingreso. */
export const MODELOS_CARTA = ["PARTICULAR", "DEPENDIENTE"] as const;
export type ModeloCarta = (typeof MODELOS_CARTA)[number];

/* ------------------------------------------------------------------ */
/* Reglas de negocio                                                   */
/* ------------------------------------------------------------------ */

export type ReglasTipoMiembro = {
  /** Exige nombre y cédula del socio titular al que se vincula la solicitud. */
  requiereSocioTitular: boolean;
  /** Exige grado militar, promoción y situación (activo / pasivo). */
  requiereDatosMilitares: boolean;
  /**
   * Exige la promoción de la Escuela Superior Militar de Aviación.
   *
   * Solo la tienen los oficiales de la Fuerza Aérea Ecuatoriana —el socio
   * fundador y el socio activo—, que son quienes egresaron de una promoción del
   * Club. Los dependientes, los particulares y los corresponsales no la tienen:
   * pedírsela obligaría a inventar un dato.
   */
  requierePromocion: boolean;
  /** Exige indicar la fuerza (Terrestre / Naval / Aérea). */
  requiereFuerza: boolean;
  /**
   * Exige la profesión u ocupación.
   *
   * El R-PGS1-1 tiene el recuadro para todos, pero solo se exige a quien abre
   * cuenta propia: a un hijo juvenil o a los padres del titular no se les puede
   * obligar a declarar una ocupación que quizá no tienen.
   */
  requiereDatosLaborales: boolean;
  /**
   * El reverso del formulario pide «Número de Socio Activo» para los socios
   * D-A y D-B: es el número del oficial FAE del que dependen.
   */
  requiereNumeroSocioActivo: boolean;
  /** Genera credencial de acceso al club al ser aprobado. */
  generaCredencial: boolean;
  /** Edad máxima permitida, si el tipo la tiene. */
  edadMaxima?: number;
  /** Edad mínima exigida, si el tipo la tiene. */
  edadMinima?: number;
  /** Estado civil exigido por el estatuto para ese tipo. */
  exigeSoltero?: boolean;
};

/** Datos del R-PGS1-1 que dependen de la categoría. */
type DatosDeCategoria = {
  datosMilitares: boolean;
  fuerza: boolean;
  vinculoTitular: boolean;
};

export type DefinicionTipoMiembro = {
  codigo: TipoMiembro;
  nombre: string;
  categoria: CategoriaMiembro;
  descripcion: string;
  /**
   * Glosa exacta con la que el tipo aparece en la columna de opciones del
   * formulario general PGS1-11. Se imprime tal cual en el documento generado.
   */
  glosaFormulario: string;
  /**
   * Cómo se nombra la categoría en el título del R-PGS1-1: «FORMULARIO DE
   * INGRESO COMO … AL CLUB SOCIAL Y DEPORTIVO…».
   */
  ingresoComo: string;
  /** Datos del R-PGS1-1 que se piden solo a esta categoría. */
  datos: DatosDeCategoria;
  /**
   * Hoja de solicitud de ingreso que acompaña al R-PGS1-1: ninguna, una, o dos
   * variantes según el estado civil.
   */
  hojasSolicitud: HojaSolicitud[];
  /** Carta de compromiso que se firma junto con la solicitud, si aplica. */
  cartaCompromiso: ModeloCarta | null;
  reglas: ReglasTipoMiembro;
  /** Disponible en el asistente de afiliación. */
  disponible: boolean;
};

/** Deriva las reglas de validación a partir de los datos de la categoría. */
function reglasDesde(
  datos: DatosDeCategoria,
  extra: Partial<ReglasTipoMiembro> = {}
): ReglasTipoMiembro {
  return {
    requiereSocioTitular: datos.vinculoTitular,
    requiereDatosMilitares: datos.datosMilitares,
    // La promoción acompaña siempre a los datos militares de la propia Fuerza
    // Aérea. Los formularios de corresponsal también piden grado militar, pero
    // de una fuerza extranjera o de otra rama: ahí no hay promoción del Club, y
    // por eso el dato `fuerza` la excluye.
    requierePromocion: datos.datosMilitares && !datos.fuerza,
    requiereFuerza: datos.fuerza,
    requiereDatosLaborales: !datos.vinculoTitular,
    requiereNumeroSocioActivo: false,
    generaCredencial: true,
    ...extra,
  };
}

/* ------------------------------------------------------------------ */
/* Catálogo                                                            */
/* ------------------------------------------------------------------ */

/** Datos de una categoría que no pide nada propio en el R-PGS1-1. */
const SOLO_PRINCIPAL: DatosDeCategoria = {
  datosMilitares: false,
  fuerza: false,
  vinculoTitular: false,
};

const MILITAR_FAE: DatosDeCategoria = { ...SOLO_PRINCIPAL, datosMilitares: true };
const MILITAR_OTRA_FUERZA: DatosDeCategoria = { ...SOLO_PRINCIPAL, datosMilitares: true, fuerza: true };
const DEPENDIENTE_DEL_TITULAR: DatosDeCategoria = { ...SOLO_PRINCIPAL, vinculoTitular: true };

/**
 * El PGS1-11: el formulario principal de todas las categorías salvo el Socio
 * Activo. No añade recuadros de cónyuge, hijos ni garantes.
 *
 * Se declara además como «hoja» de los dependientes del titular y del fundador
 * para que su maqueta salga por el mismo camino que las demás; al ser el
 * principal de esas categorías, no se imprime dos veces (ver `hojaAdicionalPara`).
 */
export const HOJA_GENERAL: HojaSolicitud = {
  codigo: "PGS1-11",
  titulo: "FORMULARIO DE INGRESO DE SOCIOS",
  layout: "GENERAL",
  bloques: SIN_RECUADROS,
};

export const CATALOGO_TIPOS: Record<TipoMiembro, DefinicionTipoMiembro> = {
  /* --- Socios titulares -------------------------------------------- */

  SF: {
    codigo: "SF",
    nombre: "Socio Fundador",
    glosaFormulario: "Socio Fundador",
    ingresoComo: "SOCIO FUNDADOR",
    categoria: "Socios titulares",
    descripcion: "Oficial de la Fuerza Aérea Ecuatoriana fundador del Club.",
    datos: MILITAR_FAE,
    hojasSolicitud: [HOJA_GENERAL],
    cartaCompromiso: null,
    reglas: reglasDesde(MILITAR_FAE),
    disponible: true,
  },

  SA: {
    codigo: "SA",
    nombre: "Socio Activo",
    glosaFormulario: "Socio Activo (Oficial FAE)",
    ingresoComo: "SOCIO ACTIVO",
    categoria: "Socios titulares",
    descripcion:
      "Oficial de la Fuerza Aérea Ecuatoriana en servicio activo o pasivo. Es el formulario que llenan los cadetes que ingresan cada octubre y los oficiales que se reincorporan.",
    datos: MILITAR_FAE,
    // El R-PGS1-1 es su propia solicitud de ingreso: no lleva hoja adicional.
    hojasSolicitud: [],
    cartaCompromiso: null,
    reglas: reglasDesde(MILITAR_FAE),
    disponible: true,
  },

  /* --- Dependientes del socio titular ------------------------------ */
  /* Su hoja es el PGS1-11: el recuadro superior indica de qué socio principal  */
  /* dependen y el grado militar de ese titular.                                */

  CONYUGE: {
    codigo: "CONYUGE",
    nombre: "Cónyuge",
    glosaFormulario: "Cónyuge",
    ingresoComo: "CÓNYUGE DE SOCIO",
    categoria: "Dependientes del socio titular",
    descripcion: "Cónyuge del socio titular, afiliado a la cuenta del titular.",
    datos: DEPENDIENTE_DEL_TITULAR,
    hojasSolicitud: [HOJA_GENERAL],
    cartaCompromiso: null,
    reglas: reglasDesde(DEPENDIENTE_DEL_TITULAR),
    disponible: true,
  },

  PADRES: {
    codigo: "PADRES",
    nombre: "Padres",
    glosaFormulario: "Padres (de Oficial FAE)",
    ingresoComo: "PADRE O MADRE DE SOCIO",
    categoria: "Dependientes del socio titular",
    descripcion: "Padre o madre del oficial FAE socio titular, afiliado a la cuenta del titular.",
    datos: DEPENDIENTE_DEL_TITULAR,
    hojasSolicitud: [HOJA_GENERAL],
    cartaCompromiso: null,
    reglas: reglasDesde(DEPENDIENTE_DEL_TITULAR),
    disponible: true,
  },

  JUVENIL: {
    codigo: "JUVENIL",
    nombre: "Juvenil",
    glosaFormulario: "Juvenil (hijo soltero < 21 años)",
    ingresoComo: "SOCIO JUVENIL",
    categoria: "Dependientes del socio titular",
    // El formulario PGS1-11 lo define como «Juvenil (hijo soltero < 21 años)».
    descripcion: "Hijo o hija soltero del socio titular, menor de 21 años.",
    datos: DEPENDIENTE_DEL_TITULAR,
    hojasSolicitud: [HOJA_GENERAL],
    cartaCompromiso: null,
    reglas: reglasDesde(DEPENDIENTE_DEL_TITULAR, { edadMaxima: 20, exigeSoltero: true }),
    disponible: true,
  },

  /* --- Socios dependientes (cuenta y facturación propias) ---------- */

  DA: {
    codigo: "DA",
    nombre: "Dependiente A",
    glosaFormulario: "Socio D - A (hijo de oficial FAE soltero < 24 años)",
    ingresoComo: "SOCIO DEPENDIENTE A",
    categoria: "Socios dependientes",
    // PGS1-11: «Socio D-A (hijo de oficial FAE soltero < 24 años)».
    descripcion: "Hijo soltero de oficial FAE, menor de 24 años, con cuenta propia.",
    datos: SOLO_PRINCIPAL,
    hojasSolicitud: [
      {
        codigo: "R-PGS1-22",
        titulo: "SOLICITUD DE INGRESO PARTICULAR DEPENDIENTE A",
        layout: "SOLICITUD",
        bloques: { ...SIN_RECUADROS, garantes: 1 },
      },
    ],
    cartaCompromiso: "DEPENDIENTE",
    reglas: reglasDesde(SOLO_PRINCIPAL, {
      requiereNumeroSocioActivo: true,
      edadMaxima: 23,
      exigeSoltero: true,
    }),
    disponible: true,
  },

  DB: {
    codigo: "DB",
    nombre: "Dependiente B",
    glosaFormulario: "Socio D - B (hijo de oficial FAE casado o soltero > 24 años)",
    ingresoComo: "SOCIO DEPENDIENTE B",
    categoria: "Socios dependientes",
    // PGS1-11: «Socio D-B (hijo de oficial FAE casado o soltero > 24 años)».
    descripcion:
      "Hijo de oficial FAE casado, o soltero mayor de 24 años, con cuenta propia. Tiene dos hojas de solicitud distintas según su estado civil.",
    datos: SOLO_PRINCIPAL,
    hojasSolicitud: [
      {
        codigo: "R-PGS1-24",
        titulo: "SOLICITUD DE INGRESO PARTICULAR DEPENDIENTE B (casado)",
        layout: "SOLICITUD",
        bloques: { conyuge: true, hijos: true, garantes: 1 },
        paraEstadoCivil: "CASADO",
      },
      {
        codigo: "R-PGS1-23",
        titulo: "SOLICITUD DE INGRESO PARTICULAR DEPENDIENTE B (soltero)",
        layout: "SOLICITUD",
        bloques: { conyuge: false, hijos: true, garantes: 1 },
        paraEstadoCivil: "SOLTERO",
      },
    ],
    cartaCompromiso: "DEPENDIENTE",
    reglas: reglasDesde(SOLO_PRINCIPAL, { requiereNumeroSocioActivo: true }),
    disponible: true,
  },

  DC: {
    codigo: "DC",
    nombre: "Dependiente C",
    glosaFormulario: "Socio D - C (hijo de un socio dependiente B > 24 años)",
    ingresoComo: "SOCIO DEPENDIENTE C",
    categoria: "Socios dependientes",
    // PGS1-11: «Socio D-C (hijo de un socio dependiente B > 24 años)».
    descripcion: "Hijo de un socio Dependiente B, mayor de 24 años, con cuenta propia.",
    datos: SOLO_PRINCIPAL,
    hojasSolicitud: [
      {
        codigo: "R-PGS1-25",
        titulo: "SOLICITUD DE INGRESO PARTICULAR DEPENDIENTE C",
        layout: "SOLICITUD",
        bloques: { conyuge: true, hijos: true, garantes: 1 },
      },
    ],
    cartaCompromiso: "DEPENDIENTE",
    reglas: reglasDesde(SOLO_PRINCIPAL),
    disponible: true,
  },

  /* --- Socios particulares ----------------------------------------- */

  PA: {
    codigo: "PA",
    nombre: "Particular A",
    glosaFormulario: "Socio P - A (Membresía)",
    ingresoComo: "SOCIO PARTICULAR A",
    categoria: "Socios particulares",
    descripcion: "Socio particular bajo la modalidad de membresía. Requiere dos socios garantes.",
    datos: SOLO_PRINCIPAL,
    hojasSolicitud: [
      {
        codigo: "R-PGS1-8",
        titulo: "SOLICITUD DE INGRESO SOCIOS PARTICULAR A",
        layout: "SOLICITUD",
        bloques: { conyuge: true, hijos: true, garantes: 2 },
      },
    ],
    cartaCompromiso: "PARTICULAR",
    reglas: reglasDesde(SOLO_PRINCIPAL),
    disponible: true,
  },

  PB: {
    codigo: "PB",
    nombre: "Particular B",
    glosaFormulario: "Socio P - B (Sociedad Individual)",
    ingresoComo: "SOCIO PARTICULAR B",
    categoria: "Socios particulares",
    descripcion:
      "Socio particular bajo la modalidad de sociedad individual. Requiere dos socios garantes.",
    datos: SOLO_PRINCIPAL,
    hojasSolicitud: [
      {
        codigo: "R-PGS1-9",
        titulo: "SOLICITUD DE INGRESO SOCIOS PARTICULAR B",
        layout: "SOLICITUD",
        bloques: { ...SIN_RECUADROS, garantes: 2 },
      },
    ],
    cartaCompromiso: "PARTICULAR",
    reglas: reglasDesde(SOLO_PRINCIPAL),
    disponible: true,
  },

  /* --- Socios corresponsales --------------------------------------- */

  CA: {
    codigo: "CA",
    nombre: "Corresponsal A",
    glosaFormulario: "Socio C - A (Diplomáticos)",
    ingresoComo: "SOCIO CORRESPONSAL A",
    categoria: "Socios corresponsales",
    // PGS1-11: «Socio C-A (Diplomáticos)».
    descripcion: "Personal diplomático acreditado, admitido en calidad de corresponsal.",
    datos: SOLO_PRINCIPAL,
    hojasSolicitud: [
      {
        codigo: "R-PGS1-26",
        titulo: "SOLICITUD DE INGRESO SOCIOS CORRESPONSAL A",
        layout: "SOLICITUD",
        bloques: { conyuge: true, hijos: true, garantes: 0 },
      },
    ],
    cartaCompromiso: null,
    reglas: reglasDesde(SOLO_PRINCIPAL),
    disponible: true,
  },

  CB: {
    codigo: "CB",
    nombre: "Corresponsal B",
    glosaFormulario: "Socio C - B (Agregados Militares)",
    ingresoComo: "SOCIO CORRESPONSAL B",
    categoria: "Socios corresponsales",
    // PGS1-11: «Socio C-B (Agregados Militares)».
    descripcion: "Agregado militar acreditado ante el Ecuador, admitido en calidad de corresponsal.",
    datos: MILITAR_OTRA_FUERZA,
    hojasSolicitud: [
      {
        codigo: "R-PGS01-6",
        titulo: "SOLICITUD DE INGRESO SOCIOS CORRESPONSAL B",
        layout: "SOLICITUD",
        bloques: { conyuge: true, hijos: true, garantes: 0 },
      },
    ],
    cartaCompromiso: null,
    reglas: reglasDesde(MILITAR_OTRA_FUERZA),
    disponible: true,
  },

  CC: {
    codigo: "CC",
    nombre: "Corresponsal C",
    glosaFormulario: "Socio C - C (Oficiales del Ejército)",
    ingresoComo: "SOCIO CORRESPONSAL C",
    categoria: "Socios corresponsales",
    // PGS1-11: «Socio C-C (Oficiales del Ejército)».
    descripcion: "Oficial del Ejército u otra fuerza, admitido en calidad de corresponsal.",
    datos: MILITAR_OTRA_FUERZA,
    hojasSolicitud: [
      {
        codigo: "R-PGS01-7",
        titulo: "SOLICITUD DE INGRESO SOCIOS CORRESPONSAL C",
        layout: "SOLICITUD",
        bloques: { conyuge: true, hijos: true, garantes: 0 },
      },
    ],
    cartaCompromiso: null,
    reglas: reglasDesde(MILITAR_OTRA_FUERZA),
    disponible: true,
  },

  /* --- Suscriptores ------------------------------------------------- */
  /* El suscriptor de golf estuvo aquí como tipo pendiente de formulario. La     */
  /* Jefatura de Socios confirmó que esa suscripción ya no existe, lo que        */
  /* explica que SAFI tampoco la tenga en su lista de tipos: se retiró del       */
  /* catálogo.                                                                   */

  SG: {
    codigo: "SG",
    nombre: "Suscriptor de gimnasio",
    glosaFormulario: "Suscripción Gimnasio",
    ingresoComo: "SUSCRIPTOR DEL GIMNASIO",
    categoria: "Suscriptores",
    descripcion: "Suscripción al servicio de gimnasio. Requiere un socio garante.",
    datos: SOLO_PRINCIPAL,
    hojasSolicitud: [
      {
        codigo: "R-PGS1-13",
        titulo: "SOLICITUD DE INGRESO SUSCRIPCIÓN GIMNASIO",
        layout: "SOLICITUD",
        bloques: { ...SIN_RECUADROS, garantes: 1 },
      },
    ],
    cartaCompromiso: null,
    reglas: reglasDesde(SOLO_PRINCIPAL),
    disponible: true,
  },

  ST: {
    codigo: "ST",
    nombre: "Suscriptor de tenis",
    glosaFormulario: "Suscripción Tenis",
    ingresoComo: "SUSCRIPTOR DE TENIS",
    categoria: "Suscriptores",
    descripcion: "Suscripción al servicio de tenis.",
    datos: SOLO_PRINCIPAL,
    hojasSolicitud: [
      {
        codigo: "R-PGS1-12",
        titulo: "SOLICITUD DE INGRESO SUSCRIPCIÓN DE TENIS",
        layout: "SOLICITUD",
        bloques: SIN_RECUADROS,
      },
    ],
    cartaCompromiso: null,
    reglas: reglasDesde(SOLO_PRINCIPAL),
    disponible: true,
  },
};

/* ------------------------------------------------------------------ */
/* Consultas sobre el catálogo                                         */
/* ------------------------------------------------------------------ */

/** Orden de presentación de las categorías en el selector. */
export const ORDEN_CATEGORIAS: CategoriaMiembro[] = [
  "Socios titulares",
  "Dependientes del socio titular",
  "Socios dependientes",
  "Socios particulares",
  "Socios corresponsales",
  "Suscriptores",
];

export const TIPOS_ORDENADOS: DefinicionTipoMiembro[] = ORDEN_CATEGORIAS.flatMap((categoria) =>
  TIPOS_MIEMBRO.map((codigo) => CATALOGO_TIPOS[codigo]).filter((t) => t.categoria === categoria)
);

/** Tipos que el asistente ofrece hoy. */
export const TIPOS_DISPONIBLES: DefinicionTipoMiembro[] = TIPOS_ORDENADOS.filter((t) => t.disponible);

export function getTipo(codigo: TipoMiembro): DefinicionTipoMiembro {
  return CATALOGO_TIPOS[codigo];
}

/** Si un valor recibido de fuera es un tipo de socio del catálogo. */
export function esTipoMiembro(valor: unknown): valor is TipoMiembro {
  return typeof valor === "string" && (TIPOS_MIEMBRO as readonly string[]).includes(valor);
}

export function reglasDe(codigo: TipoMiembro | null): ReglasTipoMiembro | null {
  return codigo ? CATALOGO_TIPOS[codigo].reglas : null;
}

export function nombreTipo(codigo: TipoMiembro | null): string {
  return codigo ? CATALOGO_TIPOS[codigo].nombre : "—";
}

/**
 * Si el socio abre Cuenta propia en el CRM de SAFI o se cuelga de la de su
 * titular.
 *
 * Es la regla de oro del mapeo con SAFI: **hay una sola Cuenta por socio
 * titular, y a esa misma Cuenta apuntan tanto su ficha como las de todos sus
 * dependientes**. El cónyuge, los padres y los hijos juveniles no tienen Cuenta
 * propia; el resto —incluidos los dependientes D-A, D-B y D-C, que conservan
 * facturación separada— sí.
 *
 * Coincide con la carpeta del repositorio digital, que también es una por
 * titular con la documentación de toda la familia dentro.
 */
export function tieneCuentaPropia(codigo: TipoMiembro | null): boolean {
  return codigo ? !CATALOGO_TIPOS[codigo].reglas.requiereSocioTitular : false;
}

/* ------------------------------------------------------------------ */
/* Catálogos auxiliares                                                */
/* ------------------------------------------------------------------ */

export const ESTADOS_CIVILES = ["Soltero", "Casado", "Unión de hecho", "Divorciado", "Viudo"] as const;

export type EstadoCivil = (typeof ESTADOS_CIVILES)[number];

/**
 * Para efectos del formulario, «casado» agrupa al casado y al conviviente en
 * unión de hecho: ambos llenan el recuadro DATOS DEL CÓNYUGE.
 */
export function esEstadoCivilCasado(estadoCivil: string): boolean {
  return estadoCivil === "Casado" || estadoCivil === "Unión de hecho";
}

/**
 * Hoja de solicitud que corresponde a una solicitud concreta, o `null` si la
 * categoría no lleva hoja (el Socio Activo).
 */
export function hojaSolicitudPara(
  codigo: TipoMiembro | null,
  estadoCivil: string
): HojaSolicitud | null {
  if (!codigo) return null;
  const { hojasSolicitud } = CATALOGO_TIPOS[codigo];
  if (hojasSolicitud.length === 0) return null;
  if (hojasSolicitud.length === 1) return hojasSolicitud[0];

  const buscado = esEstadoCivilCasado(estadoCivil) ? "CASADO" : "SOLTERO";
  return hojasSolicitud.find((h) => h.paraEstadoCivil === buscado) ?? hojasSolicitud[0];
}

/**
 * El formulario principal de una categoría: el R-PGS1-1 del Socio Activo o el
 * PGS1-11 de todas las demás. Nunca los dos.
 *
 * `general` distingue la maqueta: el R-PGS1-1 tiene la suya propia y el PGS1-11
 * se dibuja con la maqueta GENERAL, encabezada por la columna de categorías.
 */
export function formularioPrincipalPara(codigo: TipoMiembro | null): {
  codigo: string;
  titulo: string;
  general: boolean;
} {
  if (codigo === "SA") {
    return {
      codigo: FORMULARIO_PRINCIPAL.codigo,
      titulo: "Formulario de ingreso (información del socio)",
      general: false,
    };
  }
  return { codigo: HOJA_GENERAL.codigo, titulo: HOJA_GENERAL.titulo, general: true };
}

/**
 * Hoja de solicitud que se añade **detrás** del formulario principal, o `null`
 * si la categoría no lleva ninguna.
 *
 * Devuelve `null` cuando la hoja de la categoría es el propio PGS1-11: en esas
 * categorías el PGS1-11 ya es el formulario principal, y repetirlo era
 * justamente el fallo corregido el 15/09/2026.
 */
export function hojaAdicionalPara(
  codigo: TipoMiembro | null,
  estadoCivil: string
): HojaSolicitud | null {
  const hoja = hojaSolicitudPara(codigo, estadoCivil);
  if (!hoja) return null;
  return hoja.codigo === HOJA_GENERAL.codigo ? null : hoja;
}

/**
 * Recuadros aplicables a una solicitud concreta. Es la función que consultan el
 * asistente (para decidir qué pasos mostrar), la validación y el generador del
 * PDF (para decidir qué recuadros dibujar), de modo que no puedan discrepar.
 */
export function bloquesPara(codigo: TipoMiembro | null, estadoCivil: string): BloquesFormulario | null {
  if (!codigo) return null;
  const { datos } = CATALOGO_TIPOS[codigo];
  const hoja = hojaSolicitudPara(codigo, estadoCivil);
  return { ...(hoja?.bloques ?? SIN_RECUADROS), ...datos };
}

/** Un documento del trámite, para mostrar qué se va a generar. */
export type DocumentoGenerado = { codigo: string; titulo: string };

/**
 * Los documentos que forman el trámite de una solicitud, en el orden en que se
 * generan: el formulario principal de la categoría —R-PGS1-1 en el Socio Activo,
 * PGS1-11 en las demás—, su hoja de solicitud cuando la tiene y la carta de
 * compromiso. El reverso de INFORMACIÓN INTERNA DEL CLUB acompaña siempre y no
 * se enumera.
 */
export function documentosDelTramite(
  codigo: TipoMiembro | null,
  estadoCivil: string
): DocumentoGenerado[] {
  if (!codigo) return [];
  const principal = formularioPrincipalPara(codigo);
  const lista: DocumentoGenerado[] = [{ codigo: principal.codigo, titulo: principal.titulo }];
  const hoja = hojaAdicionalPara(codigo, estadoCivil);
  if (hoja) lista.push({ codigo: hoja.codigo, titulo: hoja.titulo });
  const carta = CATALOGO_TIPOS[codigo].cartaCompromiso;
  if (carta) {
    lista.push({
      codigo: "Carta",
      titulo: carta === "PARTICULAR" ? "Carta de compromiso del socio particular" : "Carta de compromiso del socio dependiente",
    });
  }
  return lista;
}

export const TIPOS_SANGRE = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"] as const;

/**
 * País del domicilio por defecto.
 *
 * Casi todos los socios viven en el Ecuador, así que el asistente lo trae
 * puesto; quien viva fuera —un corresponsal diplomático, por ejemplo— lo cambia
 * y entonces la provincia y la ciudad se escriben libres, porque la lista
 * `PROVINCIAS` es la del Ecuador.
 */
export const PAIS_POR_DEFECTO = "Ecuador";

/**
 * Provincias del Ecuador, en el orden de la División Político Administrativa.
 *
 * Es una lista cerrada y no un campo libre porque el valor viaja al recuadro
 * «Provincia (Factura)» de la Cuenta de SAFI: escrita a mano, la misma
 * provincia acabaría guardada de tres maneras distintas.
 */
export const PROVINCIAS = [
  "Azuay",
  "Bolívar",
  "Cañar",
  "Carchi",
  "Chimborazo",
  "Cotopaxi",
  "El Oro",
  "Esmeraldas",
  "Galápagos",
  "Guayas",
  "Imbabura",
  "Loja",
  "Los Ríos",
  "Manabí",
  "Morona Santiago",
  "Napo",
  "Orellana",
  "Pastaza",
  "Pichincha",
  "Santa Elena",
  "Santo Domingo de los Tsáchilas",
  "Sucumbíos",
  "Tungurahua",
  "Zamora Chinchipe",
] as const;

export type Provincia = (typeof PROVINCIAS)[number];

export const SEXOS = ["Masculino", "Femenino"] as const;
export type Sexo = (typeof SEXOS)[number];

export const FUERZAS = ["Terrestre", "Naval", "Aérea"] as const;
export type Fuerza = (typeof FUERZAS)[number];

/**
 * Fuerza fijada por la categoría, o `null` si la persona la declara.
 *
 * El Socio Activo y el Socio Fundador son oficiales de la Fuerza Aérea
 * Ecuatoriana —por eso su formulario pide la promoción de la Escuela Superior
 * Militar de Aviación—: su fuerza es **siempre la Aérea**. La tableta la muestra
 * ya puesta y sin poder cambiarla, la validación rechaza cualquier otra y el
 * servidor la impone aunque llegue distinta. Decisión del Coordinador de TICs,
 * 16/09/2026.
 *
 * Los corresponsales B y C, que también son militares, sí la declaran: pueden
 * venir de cualquier fuerza.
 */
export function fuerzaFijaPara(codigo: TipoMiembro | null): Fuerza | null {
  return codigo === "SA" || codigo === "SF" ? "Aérea" : null;
}

export const SITUACIONES_MILITARES = ["Activo", "Pasivo"] as const;
export type SituacionMilitar = (typeof SITUACIONES_MILITARES)[number];

/**
 * Grados militares, transcritos **literalmente** de la lista `cf_953` del CRM de
 * SAFI, leída con `operation=describe` el 2 de septiembre de 2026.
 *
 * En SAFI este campo es una lista cerrada y obligatoria: un grado escrito a mano
 * —«MAYO.», «TCRN.», «Mayor»— hace que el CRM rechace la ficha entera. Por eso
 * aquí es un desplegable y no un campo de texto.
 *
 * **Se copian tal cual, con sus rarezas.** Hay dos entradas para el general del
 * aire, una de ellas con doble espacio (`GENERAL  DEL AIRE`), y otra en
 * `CONTRALMIRANTE  S.P.`. Corregirlas aquí produciría un valor que SAFI no
 * reconoce: si algún día se limpian en el CRM, se limpian también aquí.
 *
 * `NO APLICA` es el valor para quien no es militar, y es el que se envía cuando
 * el tipo de socio no pide datos militares.
 */
export const GRADOS_MILITARES = [
  "SUBTENIENTE",
  "SUBTENIENTE S.P.",
  "TENIENTE",
  "TENIENTE S.P.",
  "CAPITAN",
  "CAPITAN S.P.",
  "MAYOR",
  "MAYOR S.P.",
  "TENIENTE CORONEL",
  "TENIENTE CORONEL S.P.",
  "CORONEL",
  "CORONEL S.P.",
  "BRIGADIER GENERAL",
  "BRIGADIER GENERAL S.P.",
  "TENIENTE GENERAL",
  "TENIENTE GENERAL S.P.",
  "GENERAL  DEL AIRE",
  "GENERAL  DEL AIRE S.P.",
  "ALFEREZ DE FRAGATA",
  "ALFEREZ DE FRAGATA S.P.",
  "TENIENTE DE FRAGATA",
  "TENIENTE DE FRAGATA S.P.",
  "TENIENTE DE NAVIO",
  "TENIENTE DE NAVIO S.P.",
  "CAPITAN DE CORBETA",
  "CAPITAN DE CORBETA S.P.",
  "CAPITAN DE FRAGATA",
  "CAPITAN DE FRAGATA S.P.",
  "CAPITAN DE NAVIO",
  "CAPITAN DE NAVIO S.P.",
  "CONTRALMIRANTE",
  "CONTRALMIRANTE  S.P.",
  "VICEALMIRANTE",
  "VICEALMIRANTE S.P.",
  "ALMIRANTE",
  "ALMIRANTE S.P.",
  "GENERAL DE BRIGADA",
  "NO APLICA",
  "GENERAL DEL AIRE",
  "CAPITAN NAVIO",
  "GENERAL DEL EJERCITO",
  "GENERAL DE DIVISION",
] as const;

export type GradoMilitar = (typeof GRADOS_MILITARES)[number];

/** Valor de `cf_953` para quien no es militar. */
export const GRADO_NO_APLICA = "NO APLICA";

/** Los grados que se ofrecen al elegir, sin el «no aplica» que no es un grado. */
export const GRADOS_OFRECIDOS = GRADOS_MILITARES.filter((g) => g !== GRADO_NO_APLICA);

/**
 * Grado familiar del dependiente respecto del socio titular. El formulario
 * PGS1-11 admite únicamente estos tres vínculos.
 */
export const VINCULOS_DEPENDIENTE = ["Cónyuge", "Hijo/a", "Padre/Madre"] as const;
export type VinculoDependiente = (typeof VINCULOS_DEPENDIENTE)[number];

/**
 * Vínculo de cada tipo de dependiente del titular. No se pregunta: lo fija el
 * tipo elegido, y pedirlo aparte permitiría declarar una cónyuge como «Hijo/a».
 */
export const VINCULO_POR_TIPO: Partial<Record<TipoMiembro, VinculoDependiente>> = {
  CONYUGE: "Cónyuge",
  JUVENIL: "Hijo/a",
  PADRES: "Padre/Madre",
};
