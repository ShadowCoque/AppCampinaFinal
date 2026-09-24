import { normalizarNumeroSocio } from "./texto";
import { GRADO_NO_APLICA, GRADOS_OFRECIDOS, type TipoMiembro } from "./tiposMiembro";
import { validarCelular, validarConvencional } from "./validaciones";

/**
 * Socios del Club a los que un trámite hace referencia, según el CRM de SAFI.
 *
 * Una afiliación nombra a otros socios: los **garantes**, el **socio titular**
 * de un cónyuge, unos padres o un juvenil, y el **socio del que depende** un
 * D-A, un D-B o un D-C. La tableta los busca en SAFI por su número de socio o
 * por su cédula —a través del servidor, que es quien tiene acceso al CRM— y
 * trae sus datos en lugar de que el operador los escriba (pedido del
 * Coordinador, 23/09/2026; el oficial de los D-A y D-B se consultaba así desde
 * el 19/09).
 *
 * Cada papel admite solo ciertas categorías (decisiones del Coordinador):
 *
 *   · garantes, D-A y D-B → un **Socio Activo o Fundador**;
 *   · D-C → un **Socio Dependiente B**, como dice el PGS1-11 («hijo de un socio
 *     dependiente B»). Su Parentesco, en cambio, es el del **oficial FAE del
 *     que desciende** —su abuelo—, que también se comprueba (ver
 *     `oficialDelParentesco`);
 *   · cónyuge, juvenil y padres → un titular que pueda afiliarlos, según su
 *     categoría (ver `ReglaSocio`, revisado el 24/09/2026).
 *
 * Sin red, la tableta deja avanzar y la bandeja lo vuelve a consultar antes de
 * crear la ficha. Lo único que cuenta es lo que el servidor consulta él mismo:
 * lo que trae la tableta se muestra, nunca se da por verificado.
 */

/* ------------------------------------------------------------------ */
/* Tipo de Socio de SAFI                                               */
/* ------------------------------------------------------------------ */

/**
 * «Tipo de Socio» (`cf_917`) de SAFI de cada categoría del Club.
 *
 * **`CORRESPONSAL A` hay que crearlo en SAFI.** El levantamiento del 26 de
 * agosto encontró que la lista del CRM no lo tiene, pese a que el formulario
 * R-PGS1-26 existe y el PGS1-11 lo lista como «Socio C - A (Diplomáticos)». La
 * Jefatura de Socios confirmó que la categoría sí debe existir, de modo que se
 * mapea aquí con su nombre natural y queda pendiente añadir ese valor a la lista
 * del CRM; hasta entonces SAFI rechazará el alta de un Corresponsal A y el
 * motivo aparecerá en la bandeja del Área de Socios.
 *
 * El suscriptor de golf desapareció del catálogo: la Jefatura confirmó que esa
 * suscripción ya no existe, lo que explica que SAFI tampoco la tuviera.
 *
 * Vive en el dominio, y no solo en `server/src/safi/campos.ts`, porque la
 * tableta también necesita reconocer la categoría de un socio que consultó.
 */
export const TIPO_SOCIO_SAFI: Record<TipoMiembro, string> = {
  SF: "FUNDADOR",
  SA: "ACTIVO",
  CONYUGE: "CONYUGE",
  PADRES: "DEPENDIENTE JUVENIL O PADRES",
  JUVENIL: "DEPENDIENTE JUVENIL O PADRES",
  DA: "PARTICULAR DEPENDIENTE A",
  // El Dependiente B se resuelve por estado civil: ver `tipoSocioSafi`.
  DB: "PARTICULAR DEPENDIENTE B SOLTERO",
  DC: "PARTICULAR DEPENDIENTE C",
  PA: "PARTICULAR A",
  PB: "PARTICULAR B",
  CA: "CORRESPONSAL A",
  CB: "CORRESPONSAL B",
  CC: "CORRESPONSAL C",
  SG: "SUSCRIPTOR GIMNASIO",
  ST: "SUSCRIPTOR TENIS",
};

/** SAFI distingue el Dependiente B casado del soltero, igual que los dos formularios. */
export const TIPO_SOCIO_SAFI_DB_CASADO = "PARTICULAR DEPENDIENTE B CASADO";

/**
 * Quien recibió por traspaso la titularidad de la membresía (código 114 del
 * tarifario). Existe en el CRM y no en nuestro catálogo, porque no se afilia
 * con un formulario propio; pero es un socio titular, y puede tener cónyuge e
 * hijos afiliados.
 */
export const TIPO_SOCIO_SAFI_TITULAR_POR_TRASPASO = "CONYUGE Y PADRES TITULARES";

/* ------------------------------------------------------------------ */
/* Quién puede ocupar cada papel                                       */
/* ------------------------------------------------------------------ */

/**
 * Qué tiene que ser en SAFI el socio al que se refiere el trámite.
 *
 *   ACTIVO_O_FUNDADOR  El oficial FAE: garantes, D-A, D-B y el abuelo de un D-C.
 *   DEPENDIENTE_B      El padre o la madre de un D-C.
 *   TITULAR_CONYUGE    El titular de un cónyuge.
 *   TITULAR_JUVENIL    El titular de un juvenil.
 *   TITULAR_PADRES     El titular de unos padres.
 *
 * Quién puede afiliar a quién (Coordinador y Jefatura de Socios, 24/09/2026):
 *
 *   · Activo y Fundador: cónyuge, juveniles y padres.
 *   · D-B casado, D-C, Particular A y corresponsales: cónyuge y juveniles.
 *   · D-B soltero: solo juveniles, sus hijos menores de 21 años.
 *   · D-A, Particular B y suscriptores: nadie. El D-A y el Particular B son
 *     afiliaciones individuales; los suscriptores no son socios.
 *   · Quien heredó la titularidad de un Activo o Fundador fallecido
 *     («CONYUGE Y PADRES TITULARES»): lo mismo que el socio al que sustituye,
 *     pero solo para la familia de ese socio (ver `avisoTraspaso`).
 */
export type ReglaSocio =
  | "ACTIVO_O_FUNDADOR"
  | "DEPENDIENTE_B"
  | "TITULAR_CONYUGE"
  | "TITULAR_JUVENIL"
  | "TITULAR_PADRES";

const OFICIALES = [TIPO_SOCIO_SAFI.SA, TIPO_SOCIO_SAFI.SF];

/** Titulares que pueden afiliar a su cónyuge. */
const CON_CONYUGE = [
  ...OFICIALES,
  TIPO_SOCIO_SAFI_DB_CASADO,
  TIPO_SOCIO_SAFI.DC,
  TIPO_SOCIO_SAFI.PA,
  TIPO_SOCIO_SAFI.CA,
  TIPO_SOCIO_SAFI.CB,
  TIPO_SOCIO_SAFI.CC,
  TIPO_SOCIO_SAFI_TITULAR_POR_TRASPASO,
];

const ADMITIDOS: Record<ReglaSocio, ReadonlySet<string>> = {
  ACTIVO_O_FUNDADOR: new Set(OFICIALES),
  DEPENDIENTE_B: new Set([TIPO_SOCIO_SAFI.DB, TIPO_SOCIO_SAFI_DB_CASADO]),
  TITULAR_CONYUGE: new Set(CON_CONYUGE),
  // El D-B soltero no tiene cónyuge, pero sí puede afiliar a sus hijos.
  TITULAR_JUVENIL: new Set([...CON_CONYUGE, TIPO_SOCIO_SAFI.DB]),
  TITULAR_PADRES: new Set([...OFICIALES, TIPO_SOCIO_SAFI_TITULAR_POR_TRASPASO]),
};

/** Cómo se dice, en un aviso, lo que el papel exige. */
export const REGLA_META: Record<ReglaSocio, { exige: string; noEs: string }> = {
  ACTIVO_O_FUNDADOR: {
    exige: "un Socio Activo o un Fundador",
    noEs: "no es Socio Activo ni Fundador",
  },
  DEPENDIENTE_B: {
    exige: "un Socio Dependiente B",
    noEs: "no es Socio Dependiente B",
  },
  TITULAR_CONYUGE: {
    exige:
      "un socio que pueda afiliar a su cónyuge (Activo, Fundador, D-B casado, D-C, Particular A o corresponsal)",
    noEs: "esa categoría no puede afiliar a un cónyuge",
  },
  TITULAR_JUVENIL: {
    exige:
      "un socio que pueda afiliar juveniles (no lo pueden el D-A, el Particular B ni los suscriptores)",
    noEs: "esa categoría no puede afiliar juveniles",
  },
  TITULAR_PADRES: {
    exige: "un Socio Activo o un Fundador (o quien heredó su titularidad)",
    noEs: "esa categoría no puede afiliar a sus padres",
  },
};

/**
 * El titular heredó la titularidad de un Activo o Fundador fallecido: solo
 * mantiene el beneficio para la familia de ese socio (su cónyuge, sus hijos y
 * sus padres), no para la suya propia. El sistema no puede comprobar el
 * parentesco con el fallecido; lo recuerda para que lo compruebe la Jefatura.
 */
export function avisoTraspaso(verificacion: VerificacionSocio | null | undefined): string | null {
  return verificacion?.tipoSocioSafi.trim().toUpperCase() === TIPO_SOCIO_SAFI_TITULAR_POR_TRASPASO
    ? "Es titular por traspaso de un socio fallecido: solo puede afiliar a la familia de ese socio (su cónyuge, sus hijos y sus padres), no a la suya propia. Compruébelo antes de continuar."
    : null;
}

/** Si el socio es un oficial FAE (Activo o Fundador), y tiene grado y situación militar. */
export function esOficial(verificacion: VerificacionSocio | null | undefined): boolean {
  return Boolean(verificacion && OFICIALES.includes(verificacion.tipoSocioSafi.trim().toUpperCase()));
}

/** Si un Tipo de Socio de SAFI puede ocupar el papel. */
export function admiteSocio(regla: ReglaSocio, tipoSocioSafi: string): boolean {
  return ADMITIDOS[regla].has(tipoSocioSafi.trim().toUpperCase());
}

/** Los garantes son siempre oficiales: Socio Activo o Fundador. */
export const REGLA_GARANTE: ReglaSocio = "ACTIVO_O_FUNDADOR";

/**
 * De quién depende un socio dependiente con Cuenta propia. Su número va en la
 * casilla `numeroSocioActivo` y lo que SAFI dice de él, en `oficialDependencia`.
 */
export function reglaDependencia(tipo: TipoMiembro | null): ReglaSocio | null {
  switch (tipo) {
    case "DA":
    case "DB":
      return "ACTIVO_O_FUNDADOR";
    case "DC":
      return "DEPENDIENTE_B";
    default:
      return null;
  }
}

/**
 * El oficial FAE cuyo grado, nombres y apellidos van al **Parentesco** de un
 * socio dependiente con Cuenta propia, y a la línea «de …» del PGS1-11.
 *
 *   · D-A y D-B: el oficial del que dependen (`numeroSocioActivo`).
 *   · D-C: el oficial del que **desciende** —su abuelo— (`numeroOficialFae`),
 *     **no** el D-B del que depende. El Parentesco es siempre el del socio
 *     oficial con el que la persona tiene relación (Coordinador, 23/09/2026).
 *
 * `null` en los demás tipos. El oficial ha de ser siempre Activo o Fundador.
 */
export function oficialDelParentesco(datos: {
  tipoMiembro: TipoMiembro | null;
  numeroSocioActivo: string;
  oficialDependencia: VerificacionSocio | null;
  numeroOficialFae?: string;
  oficialFaeVerificado?: VerificacionSocio | null;
}): { numero: string; verificacion: VerificacionSocio | null | undefined } | null {
  switch (datos.tipoMiembro) {
    case "DA":
    case "DB":
      return { numero: datos.numeroSocioActivo, verificacion: datos.oficialDependencia };
    case "DC":
      return { numero: datos.numeroOficialFae ?? "", verificacion: datos.oficialFaeVerificado };
    default:
      return null;
  }
}

/** El oficial del Parentesco es siempre un Socio Activo o un Fundador. */
export const REGLA_OFICIAL: ReglaSocio = "ACTIVO_O_FUNDADOR";

/** Qué tiene que ser el socio titular de un dependiente sin Cuenta propia. */
export function reglaTitular(tipo: TipoMiembro | null): ReglaSocio | null {
  switch (tipo) {
    case "PADRES":
      return "TITULAR_PADRES";
    case "CONYUGE":
      return "TITULAR_CONYUGE";
    case "JUVENIL":
      return "TITULAR_JUVENIL";
    default:
      return null;
  }
}

/** Cómo se nombra, en pantalla, al socio del que depende un D-A, D-B o D-C. */
export function rotuloDependencia(tipo: TipoMiembro | null): string {
  return tipo === "DC" ? "Socio D-B del que depende" : "Oficial FAE del que depende";
}

/* ------------------------------------------------------------------ */
/* Lo que devuelve la consulta                                         */
/* ------------------------------------------------------------------ */

/** Una ficha de Socio de SAFI, con lo que el trámite necesita de ella. */
export type SocioSafi = {
  numeroSocio: string;
  /** `00` el titular de la Cuenta; `01`, `02`… sus dependientes. */
  secuencia: string;
  cedula: string;
  apellidos: string;
  nombres: string;
  /** Grado militar (`cf_953`) tal como lo guarda SAFI, con su «NO APLICA». */
  gradoMilitar: string;
  /** «Tipo de Socio» (`cf_917`), tal como lo guarda SAFI. */
  tipoSocioSafi: string;
  /** «Estado Socio» (`cf_911`): Activo, Suspendido… */
  estadoSocio: string;
  telefonoDomicilio: string;
  celular: string;
};

/**
 * Respuesta de `GET /api/safi/socios`. `consultado: false` no es un «no»: es
 * que no se pudo preguntar —sin integración por API, sin red o con SAFI caído—.
 */
export type ConsultaSocio =
  | { consultado: true; socio: SocioSafi | null }
  | { consultado: false; motivo: string };

/**
 * Lo que el CRM dijo de un socio, guardado en el trámite: el del que depende un
 * D-A, D-B o D-C (`oficialDependencia`), el titular de un dependiente
 * (`titularVerificado`) y cada garante (`garantes[].verificacion`).
 *
 * `resultado` es el que tenía para el papel con que se consultó. Lo que manda,
 * sin embargo, es `estadoReferencia`, que lo recalcula con el tipo de socio del
 * momento: si el trámite cambia de categoría, el mismo socio puede dejar de
 * valer. Las verificaciones del oficial anteriores al 23/09/2026 traen
 * `NO_ES_ACTIVO_NI_FUNDADOR`, que se lee igual que `NO_ADMITIDO`.
 */
export type VerificacionSocio = {
  /** El número consultado: si el operador lo cambia, la verificación ya no vale. */
  numeroSocio: string;
  resultado: "VERIFICADO" | "NO_ENCONTRADO" | "NO_ADMITIDO" | "NO_ES_ACTIVO_NI_FUNDADOR";
  apellidos: string;
  nombres: string;
  gradoMilitar: string;
  /** Tipo de socio tal como lo guarda SAFI (`cf_917`). */
  tipoSocioSafi: string;
  /** Cédula y estado según SAFI. Ausentes en las verificaciones anteriores al 23/09/2026. */
  cedula?: string;
  estadoSocio?: string;
  en: string;
};

/** Lo que el sistema concluye hoy de una referencia a otro socio. */
export type EstadoReferencia = "SIN_VERIFICAR" | "VERIFICADO" | "NO_ENCONTRADO" | "NO_ADMITIDO";

/** El grado de SAFI, sin el «NO APLICA» que no es un grado. */
function gradoLimpio(grado: string): string {
  const limpio = grado.trim().toUpperCase();
  return limpio === GRADO_NO_APLICA ? "" : limpio;
}

/**
 * Verificación de un número de socio con lo que devolvió el CRM: la ficha
 * encontrada, o `null` si no existe.
 */
export function verificacionDe(
  regla: ReglaSocio,
  numeroConsultado: string,
  socio: SocioSafi | null,
  en = new Date().toISOString()
): VerificacionSocio {
  if (!socio) {
    return {
      numeroSocio: normalizarNumeroSocio(numeroConsultado),
      resultado: "NO_ENCONTRADO",
      apellidos: "",
      nombres: "",
      gradoMilitar: "",
      tipoSocioSafi: "",
      en,
    };
  }
  return {
    numeroSocio: normalizarNumeroSocio(socio.numeroSocio || numeroConsultado),
    resultado: admiteSocio(regla, socio.tipoSocioSafi) ? "VERIFICADO" : "NO_ADMITIDO",
    apellidos: socio.apellidos,
    nombres: socio.nombres,
    gradoMilitar: gradoLimpio(socio.gradoMilitar),
    tipoSocioSafi: socio.tipoSocioSafi,
    cedula: socio.cedula,
    estadoSocio: socio.estadoSocio,
    en,
  };
}

/**
 * Lo que vale hoy una verificación para el número escrito y el papel que le
 * toca. Otro número, o ninguno, es «sin verificar».
 */
export function estadoReferencia(
  verificacion: VerificacionSocio | null | undefined,
  numero: string,
  regla: ReglaSocio
): EstadoReferencia {
  const actual = normalizarNumeroSocio(numero);
  if (!verificacion || !actual || verificacion.numeroSocio !== actual) return "SIN_VERIFICAR";
  if (verificacion.resultado === "NO_ENCONTRADO") return "NO_ENCONTRADO";
  return admiteSocio(regla, verificacion.tipoSocioSafi) ? "VERIFICADO" : "NO_ADMITIDO";
}

/** «SUBTENIENTE JUAN CARLOS PEREZ LOPEZ»: grado, nombres y apellidos. */
export function nombreConGrado(persona: {
  gradoMilitar: string;
  nombres: string;
  apellidos: string;
}): string {
  return [gradoLimpio(persona.gradoMilitar), persona.nombres, persona.apellidos]
    .map((parte) => parte.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
}

/** Nombre y categoría de un socio verificado, para los avisos. */
function quienEs(verificacion: VerificacionSocio): string {
  const nombre = [verificacion.nombres, verificacion.apellidos].join(" ").trim();
  return `${nombre || "un socio"}, socio ${verificacion.tipoSocioSafi || "de otra categoría"}`;
}

/**
 * El aviso de una referencia que el CRM rechaza, o `null` si vale o está sin
 * verificar. `papel` nombra a quién se busca: «el garante», «el socio
 * titular»…
 */
export function motivoRechazo(
  verificacion: VerificacionSocio | null | undefined,
  numero: string,
  regla: ReglaSocio,
  papel: string
): string | null {
  const estado = estadoReferencia(verificacion, numero, regla);
  if (estado === "NO_ENCONTRADO") {
    return `SAFI no tiene un socio con el N.º ${normalizarNumeroSocio(numero)}. Revise el número.`;
  }
  if (estado === "NO_ADMITIDO" && verificacion) {
    return `El N.º ${verificacion.numeroSocio} es de ${quienEs(verificacion)}: ${REGLA_META[regla].noEs}. ${capitalizar(papel)} debe ser ${REGLA_META[regla].exige}.`;
  }
  return null;
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Si SAFI tiene al socio con un estado distinto de «Activo». */
export function estadoNoActivo(verificacion: VerificacionSocio | null | undefined): string | null {
  const estado = verificacion?.estadoSocio?.trim() ?? "";
  return estado && estado.toUpperCase() !== "ACTIVO" ? estado : null;
}

/* ------------------------------------------------------------------ */
/* Del CRM al formulario                                               */
/* ------------------------------------------------------------------ */

/**
 * El primer número de un campo de teléfono de SAFI: unas pocas fichas guardan
 * dos, separados por « / ».
 */
function primerNumero(valor: string): string {
  return (valor.split(/[/;,]/)[0] ?? "").replace(/\D/g, "");
}

/**
 * Celular como lo pide el formulario: `0991234567`. SAFI a veces lo guarda con
 * el prefijo internacional, sin el cero o con separadores. Lo que ni así pasa
 * la validación del formulario se deja vacío —vacío antes que equivocado—: el
 * operador escribe el número en lugar de corregir uno que no sirve.
 */
export function celularDesdeSafi(valor: string): string {
  let digitos = primerNumero(valor);
  if (digitos.startsWith("593") && digitos.length === 12) digitos = `0${digitos.slice(3)}`;
  if (digitos.length === 9 && digitos.startsWith("9")) digitos = `0${digitos}`;
  return validarCelular(digitos) === null ? digitos : "";
}

/**
 * Convencional como lo pide el formulario: `022345678`.
 *
 * En el CRM, casi la mitad de los `homephone` tienen siete dígitos, sin código
 * de provincia (revisión del 23/09/2026: 2.723 fichas). No se completa con un
 * `02` supuesto: aunque la mayoría serán de Pichincha, no se puede asegurar, y
 * el número quedaría mal escrito en el formulario. Esos, y cualquier otro que
 * no pase la validación, se dejan vacíos. El que trae el código sin el cero
 * (`22345678`) sí se completa: el número es el mismo.
 */
export function convencionalDesdeSafi(valor: string): string {
  let digitos = primerNumero(valor);
  if (digitos.startsWith("593") && digitos.length === 11) digitos = `0${digitos.slice(3)}`;
  if (digitos.length === 8 && /^[2-7]/.test(digitos)) digitos = `0${digitos}`;
  return validarConvencional(digitos) === null ? digitos : "";
}

/**
 * El grado que queda en el formulario después de consultar SAFI. La lista de
 * la tableta es la misma del CRM (`GRADOS_MILITARES`): el grado de SAFI se
 * toma; su «NO APLICA» dice que no es militar, y vacía el campo; un grado
 * vacío o que no está en la lista no dice nada, y se conserva lo escrito.
 */
export function gradoDesdeSafi(valor: string, escrito: string): string {
  if (valor.trim().toUpperCase() === GRADO_NO_APLICA) return "";
  const grado = gradoLimpio(valor);
  return (GRADOS_OFRECIDOS as readonly string[]).includes(grado) ? grado : escrito;
}

/* ------------------------------------------------------------------ */
/* La línea «de …» del PGS1-11                                         */
/* ------------------------------------------------------------------ */

/**
 * De quién depende la persona, como lo escribe la línea «de …» que el PGS1-11
 * trae junto a cada categoría de dependiente (cónyuge, padres, juvenil, D-A,
 * D-B y D-C): grado, nombres y apellidos, igual que el Parentesco de su ficha
 * en SAFI (pedido del Coordinador, 23/09/2026).
 *
 *   · Del titular, lo que SAFI dijo si está verificado; si no, lo escrito en
 *     la tableta, que desde el 23/09/2026 se trae del propio CRM.
 *   · De un D-A o D-B, el oficial del que depende; de un D-C, el oficial del
 *     que desciende —su abuelo—, nunca el D-B (ver `oficialDelParentesco`).
 *     Solo lo que SAFI dijo: sin verificar, va el número del oficial.
 *
 * `null` cuando la categoría no depende de nadie; cadena vacía cuando depende
 * pero todavía no se sabe de quién, y la línea se imprime en blanco.
 */
export function socioDelQueDepende(datos: {
  tipoMiembro: TipoMiembro | null;
  titularNumeroSocio: string;
  titularGradoMilitar: string;
  titularNombres: string;
  titularApellidos: string;
  titularVerificado?: VerificacionSocio | null;
  numeroSocioActivo: string;
  oficialDependencia: VerificacionSocio | null;
  numeroOficialFae?: string;
  oficialFaeVerificado?: VerificacionSocio | null;
}): string | null {
  const titular = reglaTitular(datos.tipoMiembro);
  if (titular) {
    const verificado = datos.titularVerificado;
    if (verificado && estadoReferencia(verificado, datos.titularNumeroSocio, titular) === "VERIFICADO") {
      return nombreConGrado(verificado);
    }
    const escrito = nombreConGrado({
      gradoMilitar: datos.titularGradoMilitar,
      nombres: datos.titularNombres,
      apellidos: datos.titularApellidos,
    });
    const numero = normalizarNumeroSocio(datos.titularNumeroSocio);
    return escrito || (numero ? `socio N.º ${numero}` : "");
  }

  // D-A, D-B y D-C: el oficial FAE, igual que su Parentesco. En un D-C es el
  // abuelo, no el D-B del que depende.
  const oficial = oficialDelParentesco(datos);
  if (oficial) {
    const { numero, verificacion } = oficial;
    if (verificacion && estadoReferencia(verificacion, numero, REGLA_OFICIAL) === "VERIFICADO") {
      return nombreConGrado(verificacion);
    }
    const normalizado = normalizarNumeroSocio(numero);
    return normalizado ? `socio N.º ${normalizado}` : "";
  }

  return null;
}
