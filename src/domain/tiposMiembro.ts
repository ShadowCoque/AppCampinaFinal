/**
 * Catálogo de tipos de socio del Club La Campiña.
 *
 * Este archivo es la traducción literal de los formularios físicos vigentes
 * que reposan en `FORMULARIOS_TIPO_DE_SOCIOS/`. Cada tipo declara qué
 * formulario le corresponde (con su código de registro de calidad, tal como
 * está impreso en el pie del documento) y qué bloques de información contiene
 * ese formulario.
 *
 * La aplicación no inventa campos: muestra exactamente los bloques que declara
 * el tipo seleccionado, y el PDF que genera reproduce ese mismo formulario. Si
 * el Club modifica un formulario impreso, se ajusta aquí y tanto el asistente
 * como el documento generado se alinean solos.
 *
 * Fuente de cada definición:
 *   R-PGS1-1   Solicitud de Ingreso Socios Cadetes ......... Socio Activo
 *   PGS1-11    Formulario Ingreso Socios ................... Fundador y dependientes del titular
 *   R-PGS1-22  Solicitud de Ingreso Socios D-A ............. Dependiente A
 *   R-PGS1-23  Solicitud de Ingreso Socios DS .............. Dependiente B (soltero)
 *   R-PGS1-24  Solicitud de Ingreso Socios BC .............. Dependiente B (casado)
 *   R-PGS1-25  Solicitud de Ingreso Socios DC .............. Dependiente C
 *   R-PGS1-8   Solicitud de Ingreso Socios PA-PB ........... Particular A
 *   R-PGS1-9   Solicitud de Ingreso Socios PB .............. Particular B
 *   R-PGS1-26  Solicitud de Ingreso Socios CA .............. Corresponsal A
 *   R-PGS01-6  Solicitud de Ingreso Socios CB .............. Corresponsal B
 *   R-PGS01-7  Solicitud de Ingreso Socios CC .............. Corresponsal C
 *   R-PGS1-12  Formulario Suscriptor Tenis ................. Suscriptor de tenis
 *   R-PGS1-13  Formulario Suscriptor GYM ................... Suscriptor de gimnasio
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
/* Anatomía de los formularios físicos                                 */
/* ------------------------------------------------------------------ */

/**
 * Los catorce formularios del Club responden a dos maquetas:
 *
 * `SOLICITUD` — carta dirigida al Gerente («Señor GERENTE DEL CLUB LA CAMPIÑA
 * … Yo, ……… con C.I. ………»), seguida del recuadro DATOS PERSONALES ASPIRANTE y,
 * según el tipo, de los recuadros de cónyuge, hijos y socios garantes.
 *
 * `FICHA` — ficha de datos del socio encabezada por el tipo de socio y, cuando
 * corresponde, por el nombre y grado del socio principal.
 */
export type LayoutFormulario = "SOLICITUD" | "FICHA";

export type BloquesFormulario = {
  /** Recuadro «DATOS DEL CÓNYUGE» con cédula, nombres, contacto y trabajo. */
  conyuge: boolean;
  /** Rejilla «DATOS HIJOS»: nombres, fecha de nacimiento, sexo, estado civil y correo. */
  hijos: boolean;
  /** «SOCIO QUE LE GARANTIZA» / «SOCIOS QUE LE GARANTIZA»: 0, 1 ó 2 garantes con firma. */
  garantes: 0 | 1 | 2;
  /** Listado «Dependientes a su cargo» (padres, cónyuge, juvenil) del formulario del socio activo. */
  dependientesACargo: boolean;
  /** Grado militar, promoción y situación (activo / pasivo) del propio solicitante. */
  datosMilitares: boolean;
  /** Fuerza a la que pertenece: Terrestre, Naval o Aérea. */
  fuerza: boolean;
  /** Nombre del socio principal y su grado militar, para los dependientes del titular. */
  vinculoTitular: boolean;
  /** Profesión, cargo, lugar de trabajo. En la maqueta SOLICITUD se llama «OCUPACIÓN». */
  datosLaborales: boolean;
  /** Tipo de sangre: solo consta en la maqueta FICHA. */
  tipoSangre: boolean;
  /** Casilla «Hobbie»: solo consta en la maqueta FICHA. */
  hobbie: boolean;
  /** Casilla «Fecha de ingreso al Club»: solo consta en la maqueta FICHA. */
  fechaIngresoClub: boolean;
  /** Casilla «Sexo: Masculino / Femenino»: solo consta en la maqueta SOLICITUD. */
  sexo: boolean;
};

const SIN_BLOQUES: BloquesFormulario = {
  conyuge: false,
  hijos: false,
  garantes: 0,
  dependientesACargo: false,
  datosMilitares: false,
  fuerza: false,
  vinculoTitular: false,
  datosLaborales: true,
  tipoSangre: false,
  hobbie: false,
  fechaIngresoClub: false,
  sexo: false,
};

/** Bloques comunes a las once solicitudes con maqueta de carta al Gerente. */
const BLOQUES_SOLICITUD: BloquesFormulario = { ...SIN_BLOQUES, sexo: true };

/** Bloques comunes a las fichas de socio (R-PGS1-1 y PGS1-11). */
const BLOQUES_FICHA: BloquesFormulario = {
  ...SIN_BLOQUES,
  tipoSangre: true,
  hobbie: true,
  fechaIngresoClub: true,
};

export type VarianteFormulario = {
  /** Código del registro de calidad impreso al pie del formulario. */
  codigo: string;
  /** Título tal como aparece en el encabezado del documento. */
  titulo: string;
  layout: LayoutFormulario;
  bloques: BloquesFormulario;
  /**
   * Algunos tipos tienen dos formularios distintos según el estado civil del
   * solicitante (el Dependiente B tiene uno para casados y otro para solteros).
   * Cuando este campo está presente, la variante se elige comparando con el
   * estado civil capturado.
   */
  paraEstadoCivil?: "CASADO" | "SOLTERO";
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
  /** Exige uno o dos socios que garanticen la afiliación, con su firma. */
  requiereGarantes: 0 | 1 | 2;
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
  /** Exige información laboral (profesión, lugar de trabajo, cargo). */
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
  /** Uno o dos formularios físicos. Vacío si el Club aún no proporcionó el formato. */
  formularios: VarianteFormulario[];
  /** Carta de compromiso que se firma junto con la solicitud, si aplica. */
  cartaCompromiso: ModeloCarta | null;
  reglas: ReglasTipoMiembro;
  /**
   * Disponible en el asistente de afiliación. Un tipo sin formulario físico
   * confirmado permanece en el catálogo pero no se ofrece, para no generar un
   * documento que el Club no reconoce.
   */
  disponible: boolean;
};

/** Deriva las reglas de validación a partir de los bloques del formulario. */
function reglasDesde(
  bloques: BloquesFormulario,
  extra: Partial<ReglasTipoMiembro> = {}
): ReglasTipoMiembro {
  return {
    requiereSocioTitular: bloques.vinculoTitular,
    requiereGarantes: bloques.garantes,
    requiereDatosMilitares: bloques.datosMilitares,
    // La promoción acompaña siempre a los datos militares de la propia Fuerza
    // Aérea. Los formularios de corresponsal también piden grado militar, pero
    // de una fuerza extranjera o de otra rama: ahí no hay promoción del Club, y
    // por eso el bloque `fuerza` la excluye.
    requierePromocion: bloques.datosMilitares && !bloques.fuerza,
    requiereFuerza: bloques.fuerza,
    requiereDatosLaborales: bloques.datosLaborales,
    requiereNumeroSocioActivo: false,
    generaCredencial: true,
    ...extra,
  };
}

/* ------------------------------------------------------------------ */
/* Catálogo                                                            */
/* ------------------------------------------------------------------ */

const FICHA_INGRESO_SOCIOS: Omit<VarianteFormulario, "bloques"> = {
  codigo: "PGS1-11",
  titulo: "FORMULARIO DE INGRESO DE SOCIOS",
  layout: "FICHA",
};

export const CATALOGO_TIPOS: Record<TipoMiembro, DefinicionTipoMiembro> = {
  /* --- Socios titulares -------------------------------------------- */

  SF: {
    codigo: "SF",
    nombre: "Socio Fundador",
    glosaFormulario: "Socio Fundador",
    categoria: "Socios titulares",
    descripcion: "Oficial de la Fuerza Aérea Ecuatoriana fundador del Club.",
    formularios: [
      { ...FICHA_INGRESO_SOCIOS, bloques: { ...BLOQUES_FICHA, datosMilitares: true } },
    ],
    cartaCompromiso: null,
    reglas: reglasDesde({ ...BLOQUES_FICHA, datosMilitares: true }),
    disponible: true,
  },

  SA: {
    codigo: "SA",
    nombre: "Socio Activo",
    glosaFormulario: "Socio Activo (Oficial FAE)",
    categoria: "Socios titulares",
    descripcion:
      "Oficial de la Fuerza Aérea Ecuatoriana en servicio activo o pasivo. Es el formulario que llenan los cadetes que ingresan cada octubre y los oficiales que se reincorporan.",
    formularios: [
      {
        codigo: "R-PGS1-1",
        titulo:
          "FORMULARIO DE INGRESO COMO SOCIO ACTIVO AL CLUB SOCIAL Y DEPORTIVO DE OFICIALES DE LA FUERZA AÉREA ECUATORIANA – CLUB LA CAMPIÑA",
        layout: "FICHA",
        bloques: { ...BLOQUES_FICHA, datosMilitares: true, dependientesACargo: true },
      },
    ],
    cartaCompromiso: null,
    reglas: reglasDesde({ ...BLOQUES_FICHA, datosMilitares: true, dependientesACargo: true }),
    disponible: true,
  },

  /* --- Dependientes del socio titular ------------------------------ */
  /* Comparten el formulario general PGS1-11: el recuadro superior indica de   */
  /* qué socio principal dependen y el grado militar de ese titular.           */

  CONYUGE: {
    codigo: "CONYUGE",
    nombre: "Cónyuge",
    glosaFormulario: "Cónyuge",
    categoria: "Dependientes del socio titular",
    descripcion: "Cónyuge del socio titular, afiliado a la cuenta del titular.",
    formularios: [
      {
        ...FICHA_INGRESO_SOCIOS,
        bloques: { ...BLOQUES_FICHA, vinculoTitular: true, datosLaborales: false },
      },
    ],
    cartaCompromiso: null,
    reglas: reglasDesde({ ...BLOQUES_FICHA, vinculoTitular: true, datosLaborales: false }),
    disponible: true,
  },

  PADRES: {
    codigo: "PADRES",
    nombre: "Padres",
    glosaFormulario: "Padres (de Oficial FAE)",
    categoria: "Dependientes del socio titular",
    descripcion: "Padre o madre del oficial FAE socio titular, afiliado a la cuenta del titular.",
    formularios: [
      {
        ...FICHA_INGRESO_SOCIOS,
        bloques: { ...BLOQUES_FICHA, vinculoTitular: true, datosLaborales: false },
      },
    ],
    cartaCompromiso: null,
    reglas: reglasDesde({ ...BLOQUES_FICHA, vinculoTitular: true, datosLaborales: false }),
    disponible: true,
  },

  JUVENIL: {
    codigo: "JUVENIL",
    nombre: "Juvenil",
    glosaFormulario: "Juvenil (hijo soltero < 21 años)",
    categoria: "Dependientes del socio titular",
    // El formulario PGS1-11 lo define como «Juvenil (hijo soltero < 21 años)».
    descripcion: "Hijo o hija soltero del socio titular, menor de 21 años.",
    formularios: [
      {
        ...FICHA_INGRESO_SOCIOS,
        bloques: { ...BLOQUES_FICHA, vinculoTitular: true, datosLaborales: false },
      },
    ],
    cartaCompromiso: null,
    reglas: reglasDesde(
      { ...BLOQUES_FICHA, vinculoTitular: true, datosLaborales: false },
      { edadMaxima: 20, exigeSoltero: true }
    ),
    disponible: true,
  },

  /* --- Socios dependientes (cuenta y facturación propias) ---------- */

  DA: {
    codigo: "DA",
    nombre: "Dependiente A",
    glosaFormulario: "Socio D - A (hijo de oficial FAE soltero < 24 años)",
    categoria: "Socios dependientes",
    // PGS1-11: «Socio D-A (hijo de oficial FAE soltero < 24 años)».
    descripcion: "Hijo soltero de oficial FAE, menor de 24 años, con cuenta propia.",
    formularios: [
      {
        codigo: "R-PGS1-22",
        titulo: "SOLICITUD DE INGRESO PARTICULAR DEPENDIENTE A",
        layout: "SOLICITUD",
        bloques: { ...BLOQUES_SOLICITUD, garantes: 1 },
      },
    ],
    cartaCompromiso: "DEPENDIENTE",
    reglas: reglasDesde(
      { ...BLOQUES_SOLICITUD, garantes: 1 },
      { requiereNumeroSocioActivo: true, edadMaxima: 23, exigeSoltero: true }
    ),
    disponible: true,
  },

  DB: {
    codigo: "DB",
    nombre: "Dependiente B",
    glosaFormulario: "Socio D - B (hijo de oficial FAE casado o soltero > 24 años)",
    categoria: "Socios dependientes",
    // PGS1-11: «Socio D-B (hijo de oficial FAE casado o soltero > 24 años)».
    descripcion:
      "Hijo de oficial FAE casado, o soltero mayor de 24 años, con cuenta propia. Tiene dos formularios distintos según su estado civil.",
    formularios: [
      {
        codigo: "R-PGS1-24",
        titulo: "SOLICITUD DE INGRESO PARTICULAR DEPENDIENTE B (casado)",
        layout: "SOLICITUD",
        bloques: { ...BLOQUES_SOLICITUD, conyuge: true, hijos: true, garantes: 1 },
        paraEstadoCivil: "CASADO",
      },
      {
        codigo: "R-PGS1-23",
        titulo: "SOLICITUD DE INGRESO PARTICULAR DEPENDIENTE B (soltero)",
        layout: "SOLICITUD",
        bloques: { ...BLOQUES_SOLICITUD, hijos: true, garantes: 1 },
        paraEstadoCivil: "SOLTERO",
      },
    ],
    cartaCompromiso: "DEPENDIENTE",
    reglas: reglasDesde(
      { ...BLOQUES_SOLICITUD, conyuge: true, hijos: true, garantes: 1 },
      { requiereNumeroSocioActivo: true }
    ),
    disponible: true,
  },

  DC: {
    codigo: "DC",
    nombre: "Dependiente C",
    glosaFormulario: "Socio D - C (hijo de un socio dependiente B > 24 años)",
    categoria: "Socios dependientes",
    // PGS1-11: «Socio D-C (hijo de un socio dependiente B > 24 años)».
    descripcion: "Hijo de un socio Dependiente B, mayor de 24 años, con cuenta propia.",
    formularios: [
      {
        codigo: "R-PGS1-25",
        titulo: "SOLICITUD DE INGRESO PARTICULAR DEPENDIENTE C",
        layout: "SOLICITUD",
        bloques: { ...BLOQUES_SOLICITUD, conyuge: true, hijos: true, garantes: 1 },
      },
    ],
    cartaCompromiso: "DEPENDIENTE",
    reglas: reglasDesde({ ...BLOQUES_SOLICITUD, conyuge: true, hijos: true, garantes: 1 }),
    disponible: true,
  },

  /* --- Socios particulares ----------------------------------------- */

  PA: {
    codigo: "PA",
    nombre: "Particular A",
    glosaFormulario: "Socio P - A (Membresía)",
    categoria: "Socios particulares",
    descripcion: "Socio particular bajo la modalidad de membresía. Requiere dos socios garantes.",
    formularios: [
      {
        codigo: "R-PGS1-8",
        titulo: "SOLICITUD DE INGRESO SOCIOS PARTICULAR A",
        layout: "SOLICITUD",
        bloques: { ...BLOQUES_SOLICITUD, conyuge: true, hijos: true, garantes: 2 },
      },
    ],
    cartaCompromiso: "PARTICULAR",
    reglas: reglasDesde({ ...BLOQUES_SOLICITUD, conyuge: true, hijos: true, garantes: 2 }),
    disponible: true,
  },

  PB: {
    codigo: "PB",
    nombre: "Particular B",
    glosaFormulario: "Socio P - B (Sociedad Individual)",
    categoria: "Socios particulares",
    descripcion:
      "Socio particular bajo la modalidad de sociedad individual. Requiere dos socios garantes.",
    formularios: [
      {
        codigo: "R-PGS1-9",
        titulo: "SOLICITUD DE INGRESO SOCIOS PARTICULAR B",
        layout: "SOLICITUD",
        bloques: { ...BLOQUES_SOLICITUD, garantes: 2 },
      },
    ],
    cartaCompromiso: "PARTICULAR",
    reglas: reglasDesde({ ...BLOQUES_SOLICITUD, garantes: 2 }),
    disponible: true,
  },

  /* --- Socios corresponsales --------------------------------------- */

  CA: {
    codigo: "CA",
    nombre: "Corresponsal A",
    glosaFormulario: "Socio C - A (Diplomáticos)",
    categoria: "Socios corresponsales",
    // PGS1-11: «Socio C-A (Diplomáticos)».
    descripcion: "Personal diplomático acreditado, admitido en calidad de corresponsal.",
    formularios: [
      {
        codigo: "R-PGS1-26",
        titulo: "SOLICITUD DE INGRESO SOCIOS CORRESPONSAL A",
        layout: "SOLICITUD",
        bloques: { ...BLOQUES_SOLICITUD, conyuge: true, hijos: true },
      },
    ],
    cartaCompromiso: null,
    reglas: reglasDesde({ ...BLOQUES_SOLICITUD, conyuge: true, hijos: true }),
    disponible: true,
  },

  CB: {
    codigo: "CB",
    nombre: "Corresponsal B",
    glosaFormulario: "Socio C - B (Agregados Militares)",
    categoria: "Socios corresponsales",
    // PGS1-11: «Socio C-B (Agregados Militares)».
    descripcion: "Agregado militar acreditado ante el Ecuador, admitido en calidad de corresponsal.",
    formularios: [
      {
        codigo: "R-PGS01-6",
        titulo: "SOLICITUD DE INGRESO SOCIOS CORRESPONSAL B",
        layout: "SOLICITUD",
        bloques: { ...BLOQUES_SOLICITUD, conyuge: true, hijos: true, datosMilitares: true, fuerza: true },
      },
    ],
    cartaCompromiso: null,
    reglas: reglasDesde({
      ...BLOQUES_SOLICITUD,
      conyuge: true,
      hijos: true,
      datosMilitares: true,
      fuerza: true,
    }),
    disponible: true,
  },

  CC: {
    codigo: "CC",
    nombre: "Corresponsal C",
    glosaFormulario: "Socio C - C (Oficiales del Ejército)",
    categoria: "Socios corresponsales",
    // PGS1-11: «Socio C-C (Oficiales del Ejército)».
    descripcion: "Oficial del Ejército u otra fuerza, admitido en calidad de corresponsal.",
    formularios: [
      {
        codigo: "R-PGS01-7",
        titulo: "SOLICITUD DE INGRESO SOCIOS CORRESPONSAL C",
        layout: "SOLICITUD",
        bloques: { ...BLOQUES_SOLICITUD, conyuge: true, hijos: true, datosMilitares: true, fuerza: true },
      },
    ],
    cartaCompromiso: null,
    reglas: reglasDesde({
      ...BLOQUES_SOLICITUD,
      conyuge: true,
      hijos: true,
      datosMilitares: true,
      fuerza: true,
    }),
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
    categoria: "Suscriptores",
    descripcion: "Suscripción al servicio de gimnasio. Requiere un socio garante.",
    formularios: [
      {
        codigo: "R-PGS1-13",
        titulo: "SOLICITUD DE INGRESO SUSCRIPCIÓN GIMNASIO",
        layout: "SOLICITUD",
        bloques: { ...BLOQUES_SOLICITUD, garantes: 1 },
      },
    ],
    cartaCompromiso: null,
    reglas: reglasDesde({ ...BLOQUES_SOLICITUD, garantes: 1 }),
    disponible: true,
  },

  ST: {
    codigo: "ST",
    nombre: "Suscriptor de tenis",
    glosaFormulario: "Suscripción Tenis",
    categoria: "Suscriptores",
    descripcion: "Suscripción al servicio de tenis.",
    formularios: [
      {
        codigo: "R-PGS1-12",
        titulo: "SOLICITUD DE INGRESO SUSCRIPCIÓN DE TENIS",
        layout: "SOLICITUD",
        bloques: { ...BLOQUES_SOLICITUD },
      },
    ],
    cartaCompromiso: null,
    reglas: reglasDesde({ ...BLOQUES_SOLICITUD }),
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

/** Tipos que el asistente ofrece hoy: los que tienen formulario físico confirmado. */
export const TIPOS_DISPONIBLES: DefinicionTipoMiembro[] = TIPOS_ORDENADOS.filter((t) => t.disponible);

export function getTipo(codigo: TipoMiembro): DefinicionTipoMiembro {
  return CATALOGO_TIPOS[codigo];
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
 * Formulario que corresponde a una solicitud concreta. Devuelve `null` si el
 * Club aún no ha proporcionado el formato físico de ese tipo de socio.
 */
export function formularioPara(
  codigo: TipoMiembro | null,
  estadoCivil: string
): VarianteFormulario | null {
  if (!codigo) return null;
  const { formularios } = CATALOGO_TIPOS[codigo];
  if (formularios.length === 0) return null;
  if (formularios.length === 1) return formularios[0];

  const buscado = esEstadoCivilCasado(estadoCivil) ? "CASADO" : "SOLTERO";
  return formularios.find((f) => f.paraEstadoCivil === buscado) ?? formularios[0];
}

/**
 * Bloques del formulario aplicables a una solicitud concreta. Es la función que
 * consultan el asistente (para decidir qué pasos mostrar) y el generador del
 * PDF (para decidir qué recuadros dibujar), de modo que ambos no puedan
 * discrepar.
 */
export function bloquesPara(codigo: TipoMiembro | null, estadoCivil: string): BloquesFormulario | null {
  return formularioPara(codigo, estadoCivil)?.bloques ?? null;
}

export const TIPOS_SANGRE = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"] as const;

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

/** Vínculo implícito de cada tipo de dependiente del titular. */
export const VINCULO_POR_TIPO: Partial<Record<TipoMiembro, VinculoDependiente>> = {
  CONYUGE: "Cónyuge",
  JUVENIL: "Hijo/a",
  PADRES: "Padre/Madre",
};
