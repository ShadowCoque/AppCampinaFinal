import {
  cuotaAnualSugerida,
  cuotaMensualSugerida,
  formatearValor,
  membresiaSugerida,
  periodicidadesDe,
} from "../../../src/domain/cuotas";
import { FORMA_PAGO_META, type FormaPago } from "../../../src/domain/facturacion";
import { calcularEdad } from "../../../src/domain/fechas";
import {
  nombreCompleto,
  nombreTitular,
  type ConfirmacionSafi,
  type SolicitudAfiliacion,
} from "../../../src/domain/solicitud";
import {
  normalizarNombreFinal,
  normalizarNumeroSocio,
  normalizarTextoInstitucional,
} from "../../../src/domain/texto";
import {
  esEstadoCivilCasado,
  fuerzaFijaPara,
  tieneCuentaPropia,
  type Fuerza,
  type TipoMiembro,
} from "../../../src/domain/tiposMiembro";
import {
  CAMPOS_CUENTA,
  CAMPOS_SOCIO,
  CUOTAS_ANUALES_SAFI,
  CUOTAS_MENSUALES_SAFI,
  ESTADO_CIVIL_SAFI,
  ESTADO_SOCIO_ACTIVO,
  FORMA_PAGO_SAFI,
  FUERZA_SAFI,
  MEMBRESIAS_SAFI,
  SIN_DATO_MILITAR,
  TIPO_CONTRIBUYENTE_POR_DEFECTO,
  TIPO_IDENTIFICACION_CEDULA,
  fechaSafi,
  importeEnLista,
  parentescoSafi,
  secuenciaSafi,
  segmentoSafi,
  telefonoPrincipal,
  tipoSocioExisteEnSafi,
  tipoSocioSafi,
  type ViaSafi,
} from "./campos";

/**
 * Traducción de una solicitud de afiliación a los registros del CRM de SAFI.
 *
 * Un mismo formulario de la aplicación llena las dos fichas que el CRM necesita:
 * la **Cuenta** (`Accounts`), que es el socio titular como unidad de
 * facturación, y el **Socio** (`Contacts`), que es una ficha por persona. Los
 * dependientes del titular no abren Cuenta propia: su ficha apunta a la del
 * titular, igual que su documentación va a la carpeta del titular en el
 * repositorio digital.
 *
 * Lo que no puede deducirse del formulario sin riesgo —las listas cerradas de
 * facturación y de cuotas— no se inventa aquí: se propone y lo confirma la
 * Jefatura de Socios en su bandeja antes de que nada se escriba en SAFI.
 */

/* ------------------------------------------------------------------ */
/* Propuesta que ve la Jefatura de Socios                              */
/* ------------------------------------------------------------------ */

/**
 * Grupo de facturación sugerido a partir de la forma de pago.
 *
 * Solo se propone cuando la correspondencia es inequívoca. Con tarjeta de
 * crédito o débito bancario se deja en blanco a propósito: el formulario no
 * dice de qué emisor ni de qué banco se trata, y elegir uno al azar dejaría la
 * Cuenta agrupada donde no le toca.
 */
const GRUPO_FACTURACION_SUGERIDO: Partial<Record<FormaPago, string>> = {
  TRANSFERENCIA_FAE: "FAE",
  DESCUENTO_ISFA: "ISFFA",
  VENTANILLA: "OFICINA",
};

/**
 * Valores que el sistema propone para que la Jefatura los confirme o los
 * corrija. Salen del tarifario del Club y del propio formulario.
 */
export function sugerirConfirmacion(solicitud: SolicitudAfiliacion): ConfirmacionSafi {
  const { datos } = solicitud;
  const estadoCivil = datos.estadoCivil;

  const anual = cuotaAnualSugerida(datos.tipoMiembro, estadoCivil);
  const mensual = cuotaMensualSugerida(datos.tipoMiembro, estadoCivil);
  const membresia = membresiaSugerida(datos.tipoMiembro, estadoCivil);

  // La carta de compromiso es la que el socio firmó: si declara una cuota, esa
  // manda sobre la del tarifario.
  const cuotaDeLaCarta = datos.carta?.cuotaAnual?.trim() ?? "";

  return {
    grupoFacturacion: datos.formaPago ? GRUPO_FACTURACION_SUGERIDO[datos.formaPago] ?? "" : "",
    formaPago: datos.formaPago ? FORMA_PAGO_SAFI[datos.formaPago] : "",
    tipoContribuyente: TIPO_CONTRIBUYENTE_POR_DEFECTO,
    valorCuota: cuotaDeLaCarta || (anual === null ? "" : formatearValor(anual)),
    // El socio se acoge a la modalidad anual salvo que se indique otra cosa: es
    // la que reconoce la carta de compromiso.
    // Los tres importes y la periodicidad son OBLIGATORIOS en SAFI, también
    // para quien no paga cuota propia. Un cónyuge o un hijo juvenil quedan
    // cubiertos por la cuota de su titular, y en el CRM eso se escribe con
    // ceros: dejarlos en blanco haría que SAFI rechazara la ficha entera.
    //
    // Van con el formato de la lista (`600`), no con el de la carta (`600.00`).
    suscripcion: "Anual",
    cuotaAnual: importeSafi(anual ?? 0),
    cuotaMensual: "",
    valorMembresia: importeSafi(membresia ?? 0),
    confirmadaPor: "",
    confirmadaEn: "",
  };
}

/* ------------------------------------------------------------------ */
/* Comprobación contra las listas cerradas del CRM                     */
/* ------------------------------------------------------------------ */

export type AvisoSafi = {
  campo: string;
  etiqueta: string;
  valor: string;
  /** `true` cuando el alta va a fallar; `false` cuando solo conviene revisarlo. */
  bloquea: boolean;
  /**
   * De dónde nace el problema, que decide si se puede seguir adelante:
   *
   *   `CATALOGO`   — el CRM todavía no admite ese valor. Con la integración
   *                  encendida el alta fallaría, así que se detiene; en modo
   *                  manual escribe una persona, que puede haber añadido ya el
   *                  valor en SAFI, y entonces esto solo informa.
   *   `COHERENCIA` — los datos se contradicen entre sí. Eso no lo arregla
   *                  ningún catálogo y no depende del modo: detiene siempre.
   */
  origen: "CATALOGO" | "COHERENCIA";
  mensaje: string;
};

/**
 * Contrasta lo que se va a enviar con lo que SAFI admite hoy.
 *
 * El tarifario del Club es el que manda sobre cuánto paga cada socio, pero las
 * listas del CRM son cerradas: un importe que no esté en ellas hace fallar el
 * alta. En lugar de redondear al valor más cercano —que dejaría al socio con
 * una cuota que no es la suya— se avisa para que se añada el valor al CRM.
 *
 * Hoy esto afecta exactamente al **Corresponsal A**, cuyo tipo de socio y cuyos
 * importes (480 anual, 40 mensual) todavía no existen en SAFI.
 *
 * **Manda siempre lo que diga el CRM en vivo.** Las listas de `campos.ts` son
 * el respaldo para cuando no se puede consultar. Si fuera al revés, el día que
 * el Club añadiera un valor en SAFI el sistema seguiría rechazándolo hasta que
 * alguien se acordara de editar el código, que es justo el trabajo manual que
 * esta integración existe para quitar.
 */
export function avisosDeConfirmacion(
  solicitud: SolicitudAfiliacion,
  confirmacion: ConfirmacionSafi,
  listasDelCrm?: {
    tipoSocio?: string[];
    cuotaAnual?: string[];
    cuotaMensual?: string[];
    valorMembresia?: string[];
  }
): AvisoSafi[] {
  const avisos: AvisoSafi[] = [];
  const { datos } = solicitud;

  const tipo = tipoSocioSafi(datos.tipoMiembro, esEstadoCivilCasado(datos.estadoCivil));
  const tiposDelCrm = listasDelCrm?.tipoSocio;
  const tipoAdmitido =
    tiposDelCrm && tiposDelCrm.length > 0
      ? tiposDelCrm.includes(tipo ?? "")
      : tipoSocioExisteEnSafi(tipo);

  if (tipo && !tipoAdmitido) {
    avisos.push({
      campo: "tipoSocio",
      etiqueta: "Tipo de Socio (cf_917)",
      valor: tipo,
      bloquea: true,
      origen: "CATALOGO",
      mensaje:
        `La lista de tipos de socio de SAFI todavía no tiene «${tipo}». ` +
        "Añádalo en el CRM antes de crear a esta persona.",
    });
  }

  const comprobar = (
    campo: keyof ConfirmacionSafi,
    etiqueta: string,
    respaldo: readonly string[],
    delCrm?: string[]
  ) => {
    const valor = confirmacion[campo] as string;
    if (!valor.trim()) return;

    const lista = delCrm && delCrm.length > 0 ? delCrm : respaldo;
    if (importeEnLista(valor, lista)) return;

    avisos.push({
      campo,
      etiqueta,
      valor,
      bloquea: true,
      origen: "CATALOGO",
      mensaje:
        `El valor ${valor} no está en la lista «${etiqueta}» de SAFI. ` +
        "Añádalo en el CRM o elija uno de los admitidos.",
    });
  };

  comprobar("cuotaAnual", "Cuota Anual (cf_947)", CUOTAS_ANUALES_SAFI, listasDelCrm?.cuotaAnual);
  comprobar(
    "cuotaMensual",
    "Cuota Mensual (cf_949)",
    CUOTAS_MENSUALES_SAFI,
    listasDelCrm?.cuotaMensual
  );
  comprobar(
    "valorMembresia",
    "Valor Membresía (cf_945)",
    MEMBRESIAS_SAFI,
    listasDelCrm?.valorMembresia
  );

  // Las dos cuotas son excluyentes: el socio se acoge a una modalidad o a la
  // otra. Fijar ambas dejaría la ficha declarando dos cobros distintos, y eso
  // es igual de falso se escriba a mano o por la API.
  if (confirmacion.cuotaAnual.trim() && confirmacion.cuotaMensual.trim()) {
    avisos.push({
      campo: "cuotaMensual",
      etiqueta: "Cuota Anual y Cuota Mensual",
      valor: `${confirmacion.cuotaAnual} / ${confirmacion.cuotaMensual}`,
      bloquea: true,
      origen: "COHERENCIA",
      mensaje:
        "Están fijadas las dos cuotas. El socio se acoge a una modalidad o a la otra: deje una en blanco.",
    });
  }

  // Una periodicidad que ese tipo de socio no puede contratar: el suscriptor de
  // tenis no tiene cuota mensual, el particular B no se puede mensualizar.
  const admitidas = periodicidadesDe(datos.tipoMiembro, datos.estadoCivil);
  if (confirmacion.cuotaMensual.trim() && !admitidas.includes("MENSUAL")) {
    avisos.push({
      campo: "cuotaMensual",
      etiqueta: "Cuota Mensual",
      valor: confirmacion.cuotaMensual,
      bloquea: true,
      origen: "COHERENCIA",
      mensaje:
        "Este tipo de socio no admite pago mensual según el tarifario del Club. Deje la cuota mensual en blanco.",
    });
  }

  return avisos;
}

/**
 * Campos de la confirmación sin los cuales SAFI no acepta el alta.
 *
 * Qué es obligatorio depende de la persona, y por eso no basta una lista fija:
 *
 *   · Los campos de la **Cuenta** —grupo de facturación, forma de pago, tipo de
 *     contribuyente— solo se llenan cuando hay una Cuenta que crear. Un cónyuge
 *     se cuelga de la de su titular, que ya los tiene.
 *   · Los campos de **cuota** solo aplican a quien paga una. El cónyuge, los
 *     padres y el juvenil no pagan cuota propia: el tarifario los marca N/A
 *     porque quedan cubiertos por la del titular.
 *
 * Exigirlos a todos obligaría a inventar un valor para poder cerrar el trámite,
 * que es exactamente lo que este panel existe para evitar.
 */
export function faltantesDeConfirmacion(
  solicitud: SolicitudAfiliacion,
  confirmacion: ConfirmacionSafi
): string[] {
  const faltan: string[] = [];
  const { tipoMiembro, estadoCivil } = solicitud.datos;

  if (tieneCuentaPropia(tipoMiembro)) {
    if (!confirmacion.grupoFacturacion.trim()) faltan.push("Grupo Facturación");
    if (!confirmacion.formaPago.trim()) faltan.push("Forma de pago");
    if (!confirmacion.tipoContribuyente.trim()) faltan.push("Tipo Contribuyente");
  }

  if (periodicidadesDe(tipoMiembro, estadoCivil).length > 0) {
    if (!confirmacion.suscripcion.trim()) faltan.push("Subscripciones");
    if (!confirmacion.cuotaAnual.trim() && !confirmacion.cuotaMensual.trim()) {
      faltan.push("Cuota anual o mensual");
    }
  }

  return faltan;
}

/* ------------------------------------------------------------------ */
/* Composición de los registros                                        */
/* ------------------------------------------------------------------ */

/**
 * Quita las claves vacías: vTiger prefiere que el campo no viaje a que llegue en
 * blanco.
 *
 * Cuidado al usarla con los campos **obligatorios** del CRM: si uno de ellos se
 * queda por el camino, SAFI rechaza el registro entero con un mensaje que no
 * dice cuál faltaba. Por eso los obligatorios se rellenan antes con su valor
 * neutro —`NO APLICA`, `0`— en lugar de dejarse en blanco. Ver `camposSocio`.
 */
function sinVacios(campos: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(campos).filter(([, valor]) => valor !== ""));
}

/**
 * Importe con el formato exacto que tiene la lista cerrada de SAFI.
 *
 * El CRM guarda `600`, no `600.00`. Son el mismo importe para una persona y dos
 * valores distintos para una lista cerrada: enviar los decimales es enviar algo
 * que no está en la lista, y SAFI rechaza la ficha entera.
 *
 * Un importe vacío se convierte en `0`, que es lo que el CRM entiende por «no
 * paga esta modalidad» y que está presente en las tres listas.
 */
function importeSafi(valor: string | number): string {
  const numero = Number(String(valor).replace(",", ".").trim());
  if (!Number.isFinite(numero)) return "0";
  return String(numero);
}

/**
 * Campos de la Cuenta (`Accounts`): el socio titular como unidad de
 * facturación. Solo se crea para quien tiene cuenta propia.
 */
export function camposCuenta(
  solicitud: SolicitudAfiliacion,
  confirmacion: ConfirmacionSafi,
  asignadoA: string
): Record<string, string> {
  const { datos } = solicitud;

  return sinVacios({
    [CAMPOS_CUENTA.nombre]: normalizarNombreFinal(nombreCompleto(datos)),
    [CAMPOS_CUENTA.cedula]: datos.cedula.trim(),
    [CAMPOS_CUENTA.correo]: datos.correo.trim().toLowerCase(),
    // Se prefiere el celular; el convencional del domicilio es el respaldo.
    [CAMPOS_CUENTA.telefono]: telefonoPrincipal(datos.celular, datos.telefonoDomicilio),
    [CAMPOS_CUENTA.asignadoA]: asignadoA,
    [CAMPOS_CUENTA.tipoIdentificacion]: TIPO_IDENTIFICACION_CEDULA,
    [CAMPOS_CUENTA.grupoFacturacion]: confirmacion.grupoFacturacion,
    [CAMPOS_CUENTA.formaPago]: confirmacion.formaPago,
    [CAMPOS_CUENTA.tipoContribuyente]: confirmacion.tipoContribuyente,
    [CAMPOS_CUENTA.valorCuota]: confirmacion.valorCuota,
    [CAMPOS_CUENTA.estadoSocio]: ESTADO_SOCIO_ACTIVO,
    [CAMPOS_CUENTA.direccion]: normalizarTextoInstitucional(datos.direccion).trim(),
    [CAMPOS_CUENTA.ciudad]: normalizarTextoInstitucional(datos.ciudad).trim(),
    [CAMPOS_CUENTA.provincia]: normalizarTextoInstitucional(datos.provincia).trim(),
    [CAMPOS_CUENTA.pais]: normalizarTextoInstitucional(datos.pais).trim(),
    [CAMPOS_CUENTA.noEnviarEmail]: noEnviarEmail(solicitud),
    [CAMPOS_CUENTA.descripcion]: `Afiliación ${solicitud.codigo} · registrada desde la aplicación del Área de Socios.`,
  });
}

/**
 * Edad cumplida a día de hoy, en años enteros.
 *
 * La calculamos nosotros porque el CRM la rellenaba solo y con decimales: la
 * primera ficha real salió con «25.15» para alguien de 24 años. Es la edad al
 * momento del registro y no se recalcula después, igual que en el formulario
 * en papel.
 */
export function edadCumplida(fechaNacimiento: string, hoy = new Date()): string {
  const edad = calcularEdad(fechaNacimiento, hoy);
  return edad !== null && edad >= 0 && edad < 130 ? String(edad) : "";
}

/**
 * Valor del campo Fuerza (`cf_955`). En el Socio Activo y el Fundador es
 * siempre «FUERZA AEREA», aunque el trámite trajera otra cosa; en el resto, la
 * que declaró la persona, o «NO APLICA» si no es militar.
 */
export function fuerzaSafi(tipo: TipoMiembro | null, declarada: Fuerza | null): string {
  const fuerza = fuerzaFijaPara(tipo) ?? declarada;
  return fuerza ? FUERZA_SAFI[fuerza] ?? SIN_DATO_MILITAR : SIN_DATO_MILITAR;
}

/**
 * «No Enviar Email» de SAFI: `1` cuando la persona **no** aceptó recibir
 * comunicaciones del Club.
 *
 * Es la casilla opcional del consentimiento de la tableta. Hasta el 15/09/2026
 * se guardaba en el expediente pero no viajaba al CRM, así que el Club no tenía
 * cómo saber a quién no debía escribirle.
 */
export function noEnviarEmail(solicitud: SolicitudAfiliacion): string {
  const acepta = solicitud.consentimiento?.valores?.comunicaciones === true;
  return acepta ? "0" : "1";
}

/**
 * Campos de la ficha del Socio (`Contacts`): una por persona, titular o
 * dependiente, todas apuntando a la Cuenta del titular.
 *
 * `cuentaId` llega ya en el formato de la vía: identificador de servicio web
 * (`11x13352`) por la API, número suelto (`13352`) por el formulario. El nombre
 * de la Cuenta solo lo usa el formulario, que lo muestra junto al vínculo.
 */
export function camposSocio(
  solicitud: SolicitudAfiliacion,
  confirmacion: ConfirmacionSafi,
  contexto: { cuentaId: string; cuentaNombre: string; asignadoA: string; via: ViaSafi }
): Record<string, string> {
  const { datos, tramite } = solicitud;
  const esCasado = esEstadoCivilCasado(datos.estadoCivil);
  const esTitular = tieneCuentaPropia(datos.tipoMiembro);
  const { via } = contexto;

  const militar = datos.gradoMilitar.trim();

  return sinVacios({
    [CAMPOS_SOCIO.cuentaId]: contexto.cuentaId,
    [CAMPOS_SOCIO.cuentaNombre]: via === "HTTP" ? contexto.cuentaNombre : "",
    [CAMPOS_SOCIO.asignadoA]: contexto.asignadoA,

    [CAMPOS_SOCIO.numeroSocio]: normalizarNumeroSocio(tramite.numeroSocio),
    // `00` el titular, `01`, `02`… sus dependientes, en el mismo orden que el
    // sufijo del repositorio digital.
    [CAMPOS_SOCIO.secuencia]: secuenciaSafi(esTitular ? null : tramite.ordinalDependiente),

    [CAMPOS_SOCIO.cedula]: datos.cedula.trim(),
    [CAMPOS_SOCIO.nombres]: normalizarNombreFinal(datos.nombres),
    [CAMPOS_SOCIO.apellidos]: normalizarNombreFinal(datos.apellidos),

    // Parentesco identifica al titular del que depende esta persona, no la
    // palabra del vínculo: de eso ya se encarga el Segmento. Va en el orden
    // grado · nombres · apellidos, que es el que usa el CRM.
    [CAMPOS_SOCIO.parentesco]: esTitular
      ? ""
      : parentescoSafi({
          gradoMilitarTitular: normalizarTextoInstitucional(datos.titularGradoMilitar).trim(),
          nombresTitular: normalizarNombreFinal(datos.titularNombres),
          apellidosTitular: normalizarNombreFinal(datos.titularApellidos),
        }),

    [CAMPOS_SOCIO.fechaNacimiento]: fechaSafi(datos.fechaNacimiento, via),
    // El Segmento y el Tipo de Socio salen los dos del tipo elegido en el
    // asistente: un solo campo del formulario llena los dos del CRM.
    [CAMPOS_SOCIO.segmento]: segmentoSafi(datos.tipoMiembro, datos.sexo),
    [CAMPOS_SOCIO.tipoSocio]: tipoSocioSafi(datos.tipoMiembro, esCasado) ?? "",
    [CAMPOS_SOCIO.genero]: datos.sexo ?? "",
    [CAMPOS_SOCIO.estadoSocio]: ESTADO_SOCIO_ACTIVO,
    [CAMPOS_SOCIO.estadoCivil]: ESTADO_CIVIL_SAFI[datos.estadoCivil] ?? "",

    [CAMPOS_SOCIO.fechaIngreso]: fechaSafi(datos.fechaIngresoClub || tramite.fechaRegistro, via),
    [CAMPOS_SOCIO.fechaRegistro]: fechaSafi(tramite.fechaRegistro, via),

    // `cf_953` es lista cerrada y obligatoria: el grado llega ya elegido de esa
    // misma lista, y quien no es militar va con `NO APLICA`.
    [CAMPOS_SOCIO.gradoMilitar]: militar || SIN_DATO_MILITAR,
    [CAMPOS_SOCIO.fuerza]: fuerzaSafi(datos.tipoMiembro, datos.fuerza),
    [CAMPOS_SOCIO.promocion]: datos.promocion.replace(/\D/g, ""),
    [CAMPOS_SOCIO.tipoSangre]: datos.tipoSangre.trim(),
    [CAMPOS_SOCIO.hobbie]: datos.hobbie.trim(),

    [CAMPOS_SOCIO.correo]: datos.correo.trim().toLowerCase(),
    [CAMPOS_SOCIO.telefonoDomicilio]: datos.telefonoDomicilio.trim(),
    [CAMPOS_SOCIO.celular]: datos.celular.trim(),

    // Los cuatro son obligatorios en SAFI, incluso para quien no paga cuota
    // propia: ahí van a cero, que es como el CRM escribe «lo cubre su titular».
    [CAMPOS_SOCIO.suscripcion]: confirmacion.suscripcion || "Anual",
    [CAMPOS_SOCIO.cuotaAnual]: importeSafi(confirmacion.cuotaAnual),
    [CAMPOS_SOCIO.cuotaMensual]: importeSafi(confirmacion.cuotaMensual),
    [CAMPOS_SOCIO.valorMembresia]: importeSafi(confirmacion.valorMembresia),

    [CAMPOS_SOCIO.direccion]: normalizarTextoInstitucional(datos.direccion).trim(),
    [CAMPOS_SOCIO.ciudad]: normalizarTextoInstitucional(datos.ciudad).trim(),
    [CAMPOS_SOCIO.provincia]: normalizarTextoInstitucional(datos.provincia).trim(),
    [CAMPOS_SOCIO.pais]: normalizarTextoInstitucional(datos.pais).trim(),
    [CAMPOS_SOCIO.edad]: edadCumplida(datos.fechaNacimiento),
    [CAMPOS_SOCIO.noEnviarEmail]: noEnviarEmail(solicitud),
  });
}

/** Nombre con el que la Cuenta del titular consta en SAFI. */
export function nombreCuenta(solicitud: SolicitudAfiliacion): string {
  return tieneCuentaPropia(solicitud.datos.tipoMiembro)
    ? normalizarNombreFinal(nombreCompleto(solicitud.datos))
    : normalizarNombreFinal(nombreTitular(solicitud.datos));
}

/** Etiqueta legible de la forma de pago, para la bandeja. */
export function etiquetaFormaPago(forma: FormaPago | null): string {
  return forma ? FORMA_PAGO_META[forma].etiqueta : "—";
}
