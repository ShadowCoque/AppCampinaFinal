import type { TipoDocumento } from "./documentos";
import type { FormaPago } from "./facturacion";
import { formatFechaHora } from "./fechas";
import type { ModoFirma } from "./firmaElectronica";
import type { ClaveConsentimiento } from "./privacidad";
import type { VerificacionSocio } from "./sociosSafi";
import {
  bloquesPara,
  PAIS_POR_DEFECTO,
  type Fuerza,
  type ModeloCarta,
  type Sexo,
  type SituacionMilitar,
  type TipoMiembro,
  type VinculoDependiente,
} from "./tiposMiembro";

/**
 * Tono cromático sugerido para representar un estado.
 * Coincide con `BadgeTone` de la capa de UI, pero se declara aquí para que el
 * dominio no dependa de los componentes visuales.
 */
export type TonoEstado = "neutral" | "info" | "success" | "warning" | "danger" | "gold";

/**
 * Versión del esquema de datos persistido. Permite migrar registros antiguos.
 *
 *   6 → 7  Se retiró el listado «Dependientes a su cargo» del R-PGS1-1, las
 *          devoluciones con observación dejaron de escribirse sobre las
 *          constancias de revisión y aprobación (`tramite.devolucion`), y el
 *          expediente registra qué firmas y fotografía entregó ya la tableta.
 *   7 → 8  Se retiró la fotografía tipo carnet (ver
 *          `docs/RETIRADO-fotografia-carnet.md`), el domicilio incorpora el
 *          país, la forma de pago dejó de pedirse en la tableta —la elige la
 *          Jefatura al confirmar el registro— y cada constancia del reverso
 *          guarda la firma del funcionario que la selló.
 */
export const ESQUEMA_SOLICITUD = 8;

/* ------------------------------------------------------------------ */
/* Áreas que intervienen en el trámite                                 */
/* ------------------------------------------------------------------ */

/**
 * Las tres responsabilidades que ya constan al reverso del formulario impreso,
 * bajo el título INFORMACIÓN INTERNA DEL CLUB: el Área de Socios REGISTRA, el
 * Área de Contabilidad REVISA y la Gerencia APRUEBA (informe CLC-TI-010,
 * numeral 5.1).
 */
export const AREAS = ["SOCIOS", "CONTABILIDAD", "GERENCIA"] as const;

export type Area = (typeof AREAS)[number];

export const AREA_META: Record<Area, { etiqueta: string; cargo: string; accion: string }> = {
  SOCIOS: {
    etiqueta: "Área de Socios",
    cargo: "Jefatura de Control de Socios y Sistemas Administrativos",
    accion: "REGISTRA",
  },
  CONTABILIDAD: {
    etiqueta: "Área de Contabilidad",
    cargo: "Contadora",
    accion: "REVISA",
  },
  GERENCIA: {
    etiqueta: "Gerencia",
    cargo: "Administrador del Club",
    accion: "APRUEBA",
  },
};

/* ------------------------------------------------------------------ */
/* Estados del trámite de afiliación                                   */
/* ------------------------------------------------------------------ */

export const ESTADOS_SOLICITUD = [
  "BORRADOR",
  "REGISTRADA",
  "REVISADA",
  "APROBADA",
  "OBSERVADA",
  "RECHAZADA",
] as const;

export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

export const ESTADO_META: Record<
  EstadoSolicitud,
  { etiqueta: string; tono: TonoEstado; descripcion: string; responsable: string }
> = {
  BORRADOR: {
    etiqueta: "Borrador",
    tono: "neutral",
    descripcion: "La solicitud está en curso en el dispositivo y aún no ha sido registrada.",
    responsable: "Área de Socios",
  },
  REGISTRADA: {
    etiqueta: "Registrada",
    tono: "info",
    descripcion:
      "El Área de Socios registró la afiliación. Pendiente de crear al socio en SAFI y de la revisión del Área de Contabilidad.",
    responsable: "Área de Socios y Contabilidad",
  },
  REVISADA: {
    etiqueta: "Revisada",
    tono: "gold",
    descripcion:
      "Contabilidad comprobó el ingreso en el CRM de SAFI. Pendiente de aprobación por la Gerencia.",
    responsable: "Gerencia",
  },
  APROBADA: {
    etiqueta: "Aprobada",
    tono: "success",
    descripcion: "La Gerencia aprobó el ingreso del socio. El trámite está concluido.",
    responsable: "—",
  },
  OBSERVADA: {
    etiqueta: "Con observaciones",
    tono: "warning",
    descripcion: "Se devolvió al Área de Socios para corregir o completar información.",
    responsable: "Área de Socios",
  },
  // El valor interno se conserva por compatibilidad con los registros ya
  // guardados; lo que la interfaz muestra es la anulación del trámite.
  RECHAZADA: {
    etiqueta: "Anulada",
    tono: "danger",
    descripcion: "El trámite se anuló y no continúa. Consulte el motivo registrado.",
    responsable: "—",
  },
};

/** Estados en los que el trámite sigue abierto y aparece en las bandejas. */
export const ESTADOS_ABIERTOS: EstadoSolicitud[] = [
  "BORRADOR",
  "REGISTRADA",
  "REVISADA",
  "OBSERVADA",
];

/** Área a la que le toca actuar sobre una solicitud, o `null` si está cerrada. */
export function areaResponsable(estado: EstadoSolicitud): Area | null {
  switch (estado) {
    case "BORRADOR":
    case "OBSERVADA":
      return "SOCIOS";
    case "REGISTRADA":
      return "CONTABILIDAD";
    case "REVISADA":
      return "GERENCIA";
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Bloques del formulario físico                                       */
/* ------------------------------------------------------------------ */

/**
 * Recuadro «DATOS DEL CÓNYUGE» de las solicitudes D-B (casado), D-C, P-A y
 * las tres de corresponsales.
 */
export type DatosConyuge = {
  cedula: string;
  apellidos: string;
  nombres: string;
  lugarNacimiento: string;
  fechaNacimiento: string;
  correo: string;
  celular: string;
  telefono: string;
  ocupacion: string;
  lugarTrabajo: string;
};

export function conyugeVacio(): DatosConyuge {
  return {
    cedula: "",
    apellidos: "",
    nombres: "",
    lugarNacimiento: "",
    fechaNacimiento: "",
    correo: "",
    celular: "",
    telefono: "",
    ocupacion: "",
    lugarTrabajo: "",
  };
}

export function conyugeEstaVacio(conyuge: DatosConyuge): boolean {
  return Object.values(conyuge).every((valor) => !valor.trim());
}

/**
 * Estado civil abreviado tal como consta en la rejilla DATOS HIJOS del
 * formulario impreso: las columnas son S (soltero) y C/D (casado o divorciado).
 */
export const ESTADOS_CIVILES_HIJO = ["S", "C", "D"] as const;
export type EstadoCivilHijo = (typeof ESTADOS_CIVILES_HIJO)[number];

export const ESTADO_CIVIL_HIJO_META: Record<EstadoCivilHijo, string> = {
  S: "Soltero/a",
  C: "Casado/a",
  D: "Divorciado/a",
};

/** Una fila de la rejilla «DATOS HIJOS». */
export type DatosHijo = {
  id: string;
  apellidosNombres: string;
  fechaNacimiento: string;
  sexo: Sexo | null;
  estadoCivil: EstadoCivilHijo | null;
  correo: string;
};

/**
 * Recuadro «SOCIO QUE LE GARANTIZA» / «SOCIOS QUE LE GARANTIZA». El garante
 * firma el formulario y, en el caso de los particulares, también la carta de
 * compromiso, donde consta como codeudor solidario.
 */
export type DatosGarante = {
  id: string;
  apellidosNombres: string;
  cedula: string;
  telefonoDomicilio: string;
  celular: string;
  numeroSocio: string;
  /** Firma del garante, capturada en pantalla. */
  firmaUri: string | null;
  /**
   * Lo que SAFI dijo de este garante al buscarlo por su número o su cédula
   * (desde el 23/09/2026: debe ser Socio Activo o Fundador). Ausente o `null`,
   * sin verificar: la bandeja lo comprueba antes del alta.
   */
  verificacion?: VerificacionSocio | null;
};

export function garanteVacio(id: string): DatosGarante {
  return {
    id,
    apellidosNombres: "",
    cedula: "",
    telefonoDomicilio: "",
    celular: "",
    numeroSocio: "",
    firmaUri: null,
    verificacion: null,
  };
}

/* ------------------------------------------------------------------ */
/* Carta de compromiso                                                 */
/* ------------------------------------------------------------------ */

/**
 * Cómo autoriza el socio el débito automático: de una cuenta bancaria o de una
 * tarjeta de crédito. Es una u otra (decisión del Coordinador, 23/09/2026): la
 * carta imprime solo la elegida.
 */
export type ModalidadDebito = "CUENTA" | "TARJETA";

/**
 * Datos que solo aparecen en la carta de compromiso y no en el formulario de
 * ingreso: la autorización de débito automático, el valor de la cuota anual y
 * la sesión del Directorio que autorizó el ingreso.
 */
export type DatosCartaCompromiso = {
  modelo: ModeloCarta;
  nacionalidad: string;
  /** Fecha de la sesión del Directorio que autorizó el ingreso. */
  fechaSesionDirectorio: string;
  /**
   * Modalidad del débito automático. Ausente en las cartas anteriores al
   * 23/09/2026, que la dejaban implícita: ver `modalidadDebitoDe`.
   */
  modalidadDebito?: ModalidadDebito | null;
  /** Entidad financiera para el débito automático. */
  entidadFinanciera: string;
  tipoCuenta: "AHORROS" | "CORRIENTE" | null;
  numeroCuenta: string;
  /** Alternativa al débito de cuenta: tarjeta de crédito y su caducidad. */
  tarjetaCredito: string;
  caducidadTarjeta: string;
  /**
   * Cuota de mantenimiento anual reconocida en la carta. Sale del tarifario
   * del Club (`src/domain/cuotas.ts`): desde el 23/09/2026 no se pregunta.
   */
  cuotaAnual: string;
  /** Valor mensualizado, si el tipo de socio admite esa modalidad. También del tarifario. */
  cuotaMensualizada: string;
  aceptadaEn: string | null;
};

export function cartaVacia(modelo: ModeloCarta): DatosCartaCompromiso {
  return {
    modelo,
    nacionalidad: "ECUATORIANA",
    fechaSesionDirectorio: "",
    modalidadDebito: null,
    entidadFinanciera: "",
    tipoCuenta: null,
    numeroCuenta: "",
    tarjetaCredito: "",
    caducidadTarjeta: "",
    cuotaAnual: "",
    cuotaMensualizada: "",
    aceptadaEn: null,
  };
}

/**
 * La modalidad de débito de una carta. Las anteriores al 23/09/2026 no la
 * guardaban: se deduce de lo que se llenó, y si no se llenó nada, no hay.
 */
export function modalidadDebitoDe(carta: DatosCartaCompromiso): ModalidadDebito | null {
  if (carta.modalidadDebito) return carta.modalidadDebito;
  if (carta.numeroCuenta.trim()) return "CUENTA";
  if (carta.tarjetaCredito.trim()) return "TARJETA";
  return null;
}

/* ------------------------------------------------------------------ */
/* Datos del formulario                                                */
/* ------------------------------------------------------------------ */

export type DatosAfiliacion = {
  tipoMiembro: TipoMiembro | null;

  /**
   * Vínculo con el socio titular (dependientes del titular).
   *
   * Apellidos y nombres van separados porque el CRM de SAFI los usa en dos
   * órdenes distintos: la Cuenta se nombra «APELLIDOS NOMBRES» y el campo
   * Parentesco de la ficha del dependiente escribe primero los nombres. De un
   * solo campo de texto no se pueden separar sin adivinar cuántos apellidos
   * tiene la persona.
   */
  titularApellidos: string;
  titularNombres: string;
  titularCedula: string;
  titularNumeroSocio: string;
  titularGradoMilitar: string;
  titularSituacion: SituacionMilitar | null;
  vinculoConTitular: VinculoDependiente | null;
  /**
   * Lo que SAFI dijo del socio titular al buscarlo por su número o su cédula.
   * Los padres dependen de un Socio Activo o Fundador; el cónyuge y el juvenil,
   * de cualquier socio titular salvo el Particular B (decisión del Coordinador,
   * 23/09/2026). Ausente o `null`, sin verificar.
   */
  titularVerificado?: VerificacionSocio | null;

  /**
   * Número del socio del que depende un socio dependiente con Cuenta propia:
   * el oficial FAE de un D-A o D-B —la casilla «Número de Socio Activo» del
   * reverso— y el socio D-B de un D-C.
   */
  numeroSocioActivo: string;
  /**
   * Lo que el CRM de SAFI dice del socio de `numeroSocioActivo`, consultado
   * desde la tableta al escribir el número o desde la bandeja antes de crear
   * la ficha.
   *
   * `null` —o de otro número— significa **sin verificar**: la tableta trabaja
   * sin red y no se le impide avanzar; la bandeja lo comprueba antes del alta.
   * Lo que sí impide avanzar es una respuesta del CRM que diga que ese número
   * no existe o que no es de la categoría que toca (`reglaDependencia`).
   *
   * Su grado, nombres y apellidos van al campo Parentesco de la ficha en SAFI
   * y a la línea «de …» del PGS1-11: es como la Jefatura reconoce de quién
   * depende.
   */
  oficialDependencia: VerificacionSocio | null;

  /** Identificación. */
  apellidos: string;
  nombres: string;
  cedula: string;
  sexo: Sexo | null;
  lugarNacimiento: string;
  fechaNacimiento: string;
  estadoCivil: string;
  tipoSangre: string;

  /** Contacto y domicilio. */
  /**
   * País del domicilio. Viaja al «País (Factura)» de la ficha del Socio
   * (`mailingcountry`) y de la Cuenta (`bill_country`), que hasta el 15/09/2026
   * quedaban vacíos porque nadie lo preguntaba.
   *
   * Casi siempre es Ecuador, y así viene por defecto. Con otro país, la
   * provincia y la ciudad dejan de ser la lista cerrada del Ecuador y se
   * escriben libres: un corresponsal diplomático no vive en una provincia
   * ecuatoriana.
   */
  pais: string;
  ciudad: string;
  /**
   * Provincia del domicilio. Viaja al campo «Provincia (Factura)» de la Cuenta
   * de SAFI (`bill_state`) y a la dirección de la ficha del Socio
   * (`mailingstate`). La declara el solicitante: deducirla de la ciudad o
   * dejarla fija falsearía la dirección del comprobante.
   */
  provincia: string;
  direccion: string;
  /**
   * Teléfono celular. Es el que SAFI recibe como teléfono principal de la
   * Cuenta, y por eso es obligatorio; el convencional del domicilio quedó como
   * opcional, que es lo que hoy tiene la mayoría de socios.
   */
  celular: string;
  telefonoDomicilio: string;
  telefonoTrabajo: string;
  correo: string;

  /** Facturación. */
  formaPago: FormaPago | null;
  /** Valor de afiliación, digitado si el tarifario aún no está parametrizado. */
  valorAfiliacion: string;

  /** Información laboral. */
  profesion: string;
  lugarTrabajo: string;
  cargo: string;
  hobbie: string;

  /** Información militar del propio solicitante. */
  gradoMilitar: string;
  promocion: string;
  situacion: SituacionMilitar | null;
  fuerza: Fuerza | null;

  /**
   * «Fecha de ingreso al Club» del R-PGS1-1. No se pregunta: es la fecha en
   * que se registra la afiliación, y se fija al registrarla.
   */
  fechaIngresoClub: string;

  /**
   * Recuadros que añade la hoja de solicitud de algunas categorías.
   *
   * El listado «Dependientes a su cargo» del R-PGS1-1 se retiró del
   * formulario: cada dependiente se afilia con su propio trámite.
   */
  conyuge: DatosConyuge;
  hijos: DatosHijo[];
  garantes: DatosGarante[];
  carta: DatosCartaCompromiso | null;
};

export function datosVacios(): DatosAfiliacion {
  return {
    tipoMiembro: null,
    titularApellidos: "",
    titularNombres: "",
    titularCedula: "",
    titularNumeroSocio: "",
    titularGradoMilitar: "",
    titularSituacion: null,
    vinculoConTitular: null,
    titularVerificado: null,
    numeroSocioActivo: "",
    oficialDependencia: null,
    apellidos: "",
    nombres: "",
    cedula: "",
    sexo: null,
    lugarNacimiento: "",
    fechaNacimiento: "",
    estadoCivil: "",
    tipoSangre: "",
    pais: PAIS_POR_DEFECTO,
    ciudad: "",
    provincia: "",
    direccion: "",
    celular: "",
    telefonoDomicilio: "",
    telefonoTrabajo: "",
    correo: "",
    formaPago: null,
    valorAfiliacion: "",
    profesion: "",
    lugarTrabajo: "",
    cargo: "",
    hobbie: "",
    gradoMilitar: "",
    promocion: "",
    situacion: null,
    fuerza: null,
    fechaIngresoClub: "",
    conyuge: conyugeVacio(),
    hijos: [],
    garantes: [],
    carta: null,
  };
}

/** Nombre en el orden institucional (apellidos primero), como lo guarda SAFI. */
export function nombreCompleto(datos: DatosAfiliacion): string {
  return `${datos.apellidos} ${datos.nombres}`.replace(/\s+/g, " ").trim();
}

/** Nombre del socio titular en el orden institucional. */
export function nombreTitular(datos: DatosAfiliacion): string {
  return `${datos.titularApellidos} ${datos.titularNombres}`.replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ */
/* Adjuntos, consentimiento y trazabilidad                             */
/* ------------------------------------------------------------------ */

export type ArchivoAdjunto = {
  id: string;
  tipo: TipoDocumento;
  nombreArchivo: string;
  uri: string;
  mimeType: string;
  tamanoBytes: number;
  capturadoEn: string;
};

/**
 * Archivos que la tableta captura y el servidor necesita para componer el
 * formulario y el expediente: las firmas trazadas en pantalla y la fotografía
 * tipo carnet.
 *
 * En la tableta viven como archivos privados de la aplicación; la ruta que
 * guarda la solicitud (`firmaUri`, `garantes[].firmaUri`, `documentos[].uri`)
 * no significa nada fuera de ella. Por eso viajan aparte, y el servidor lleva la
 * cuenta de cuáles recibió en `expediente.adjuntosRecibidos`.
 */
export const ROLES_ADJUNTO = [
  "FIRMA_SOLICITANTE",
  "FIRMA_GARANTE_1",
  "FIRMA_GARANTE_2",
] as const;

export type RolAdjunto = (typeof ROLES_ADJUNTO)[number];

export const ROL_ADJUNTO_META: Record<RolAdjunto, { etiqueta: string; esFirma: boolean }> = {
  FIRMA_SOLICITANTE: { etiqueta: "Firma del solicitante", esFirma: true },
  FIRMA_GARANTE_1: { etiqueta: "Firma del socio garante", esFirma: true },
  FIRMA_GARANTE_2: { etiqueta: "Firma del segundo socio garante", esFirma: true },
};

/** Rol de la firma de un garante, por su posición en `datos.garantes`. */
export function rolFirmaGarante(indice: number): RolAdjunto {
  return indice === 0 ? "FIRMA_GARANTE_1" : "FIRMA_GARANTE_2";
}

/**
 * Archivos que el servidor debe tener de una solicitud para que su expediente
 * esté completo: la firma del solicitante y la de cada garante que su hoja de
 * solicitud exige.
 *
 * La fotografía tipo carnet estuvo aquí hasta el 15/09/2026; ver
 * `docs/RETIRADO-fotografia-carnet.md`.
 */
export function adjuntosEsperados(solicitud: SolicitudAfiliacion): RolAdjunto[] {
  const roles: RolAdjunto[] = ["FIRMA_SOLICITANTE"];
  const bloques = bloquesPara(solicitud.datos.tipoMiembro, solicitud.datos.estadoCivil);
  const garantes = Math.min(bloques?.garantes ?? 0, solicitud.datos.garantes.length);
  for (let indice = 0; indice < garantes; indice += 1) roles.push(rolFirmaGarante(indice));
  return roles;
}

/**
 * Los esperados que el servidor todavía no ha recibido y nadie ha declarado
 * resueltos por otra vía.
 */
export function adjuntosFaltantes(solicitud: SolicitudAfiliacion): RolAdjunto[] {
  const recibidos = new Set(solicitud.expediente.adjuntosRecibidos ?? []);
  const omitidos = new Set((solicitud.expediente.adjuntosOmitidos ?? []).map((o) => o.rol));
  return adjuntosEsperados(solicitud).filter((rol) => !recibidos.has(rol) && !omitidos.has(rol));
}

export type RegistroConsentimiento = {
  versionAviso: string;
  aceptadoEn: string;
  valores: Record<ClaveConsentimiento, boolean>;
};

/**
 * Trazabilidad del origen de los datos de identidad y de la verificación
 * realizada. Permite acreditar si los datos los escribió el operador o los
 * devolvió el Registro Civil, y si la identidad se cotejó contra la fotografía
 * oficial o contra la cédula física.
 */
export type OrigenIdentidad = "MANUAL" | "SNIC_DEMOGRAFICO" | "SNIC_BIOMETRICO";

export type RegistroIdentidad = {
  origen: OrigenIdentidad;
  /** Momento de la consulta al Registro Civil, si se realizó. */
  consultadoEn?: string;
  /** Campos del formulario cuyo valor proviene del Registro Civil. */
  camposVerificados: string[];
  /** Fotografía devuelta por el Registro Civil, para el cotejo de identidad. */
  fotoRegistroCivilUri?: string | null;
  /** El operador confirmó que la persona presente corresponde a la fotografía. */
  identidadConfirmada: boolean;
};

export function identidadVacia(): RegistroIdentidad {
  return { origen: "MANUAL", camposVerificados: [], identidadConfirmada: false };
}

export const ORIGEN_IDENTIDAD_META: Record<
  OrigenIdentidad,
  { etiqueta: string; detalle: string; tono: TonoEstado }
> = {
  MANUAL: {
    etiqueta: "Ingreso manual",
    detalle:
      "Los datos fueron digitados por el Área de Socios y cotejados contra la cédula física del solicitante.",
    tono: "neutral",
  },
  SNIC_DEMOGRAFICO: {
    etiqueta: "Registro Civil (demográfico)",
    detalle:
      "Los datos de identidad provienen del Registro Civil. La identidad se cotejó contra la cédula física del solicitante.",
    tono: "info",
  },
  SNIC_BIOMETRICO: {
    etiqueta: "Registro Civil (biométrico)",
    detalle:
      "Los datos y la fotografía provienen del Registro Civil. La identidad se verificó comparando al solicitante con la fotografía oficial.",
    tono: "success",
  },
};

/* ------------------------------------------------------------------ */
/* Constancia interna del trámite (reverso del formulario)             */
/* ------------------------------------------------------------------ */

/** Una de las tres constancias del reverso, con su firma, fecha y observación. */
export type ConstanciaTramite = {
  area: Area;
  /** Nombre del funcionario que ejecutó la acción. */
  responsable: string;
  en: string;
  observacion: string;
  /**
   * Firma del funcionario, copiada a la carpeta del trámite en el momento de la
   * acción (`firma-socios.png`…). `null` o ausente si no tenía firma cargada:
   * entonces la constancia se imprime solo con su nombre.
   *
   * Se congela como el nombre: si el funcionario vuelve a trazar su firma, las
   * constancias ya emitidas conservan la que se estampó.
   */
  firmaArchivo?: string | null;
};

/**
 * Una devolución con observación.
 *
 * Contabilidad devuelve siempre al Área de Socios. La Gerencia elige: al Área
 * de Socios, cuando hay que corregir la afiliación, o a Contabilidad, cuando lo
 * que hay que rehacer es la revisión (decisión del Coordinador, 19/09/2026).
 */
export type DevolucionTramite = ConstanciaTramite & {
  /**
   * Área a la que vuelve el trámite. Ausente en las devoluciones anteriores al
   * 19/09/2026, que iban todas al Área de Socios.
   */
  destino?: Area;
  /**
   * Número de factura de la revisión que se deshace cuando la Gerencia devuelve
   * a Contabilidad, para ofrecerlo de nuevo y no obligar a buscarlo otra vez.
   */
  numeroFacturaAnterior?: string;
};

/** A qué área volvió un trámite devuelto. */
export function destinoDevolucion(devolucion: DevolucionTramite | null | undefined): Area {
  return devolucion?.destino ?? "SOCIOS";
}

/**
 * Recuadro INFORMACIÓN INTERNA DEL CLUB del reverso del formulario impreso,
 * llevado al sistema: los números que asigna el Área de Socios y las tres
 * constancias con fecha, hora y responsable.
 */
export type TramiteInterno = {
  /** «Fecha De Registro» del reverso. */
  fechaRegistro: string;
  /**
   * «Número de Socio» asignado en el CRM de SAFI.
   *
   * En un dependiente del titular es el número **del titular**: es el que da
   * nombre a la Cuenta de SAFI y a la carpeta del expediente, que son una por
   * familia. Lo que distingue a cada persona dentro de ella es el ordinal.
   */
  numeroSocio: string;
  /**
   * Orden de la persona dentro de la cuenta de su titular. `null` en el propio
   * titular.
   *
   * Es el `-1`, `-2`… del repositorio digital y, a la vez, la «Secuencia»
   * (`cf_909`) de SAFI: se comprobó sobre 300 fichas reales que son el mismo
   * número, de modo que no hay dos numeraciones que conciliar.
   */
  ordinalDependiente: number | null;
  /**
   * «Número de tarjeta» de la credencial de acceso.
   *
   * No viaja a SAFI: el campo `cf_905` del CRM va siempre vacío porque el número
   * de la credencial lo lleva el control de accesos.
   */
  numeroTarjeta: string;
  registro: ConstanciaTramite | null;
  /**
   * Constancia de Contabilidad, con la casilla «FC:» del formulario.
   *
   * El número de factura queda vacío cuando la afiliación no genera
   * comprobante: no toda revisión implica facturar, y exigirlo obligaría a
   * inventar un número para poder cerrar el trámite.
   */
  revision: (ConstanciaTramite & { numeroFactura: string }) | null;
  aprobacion: ConstanciaTramite | null;
  /**
   * Devolución pendiente: Contabilidad o la Gerencia devolvieron el trámite con
   * una observación, al área que indica `destino`.
   *
   * Va aparte de las constancias a propósito. Una devolución no es una
   * revisión ni una aprobación: si se escribiera sobre ellas, el reverso
   * imprimiría «Revisado» con el nombre de quien en realidad lo devolvió.
   */
  devolucion?: DevolucionTramite | null;
  /**
   * Todas las observaciones del trámite, en orden: las devoluciones y las
   * respuestas del Área de Socios al reenviarlo. Son las que el reverso imprime
   * en los recuadros de observación de cada área.
   */
  observaciones?: ConstanciaTramite[];
  /** Constancia de anulación del trámite, con su motivo. */
  anulacion?: ConstanciaTramite | null;
};

export function tramiteVacio(): TramiteInterno {
  return {
    fechaRegistro: "",
    numeroSocio: "",
    ordinalDependiente: null,
    numeroTarjeta: "",
    registro: null,
    revision: null,
    aprobacion: null,
    devolucion: null,
    observaciones: [],
    anulacion: null,
  };
}

/**
 * Observaciones de un área, en orden y con su fecha, para el reverso del
 * formulario y para la bandeja del área siguiente.
 *
 * Todas salen de `tramite.observaciones`, donde cada paso deja la suya: la que
 * escribe el Área de Socios al confirmar el registro, la de Contabilidad al
 * revisar o devolver, la de la Gerencia al aprobar o devolver, y la respuesta
 * de Socios al reenviar. Se acumulan: la Gerencia ve las dos observaciones de
 * Contabilidad —la que devolvió el trámite y la que lo pasó a aprobación—, cada
 * una con su día.
 */
export function observacionesDeArea(tramite: TramiteInterno, area: Area): string[] {
  const textos: string[] = [];
  for (const nota of tramite.observaciones ?? []) {
    if (nota.area === area && nota.observacion.trim()) {
      // Fecha **y hora**, en hora del Ecuador. Hasta el 19/09/2026 se imprimía
      // solo el día, tomado de la hora UTC: una observación escrita después de
      // las 19:00 salía con la fecha del día siguiente.
      textos.push(`${formatFechaHora(nota.en)}: ${nota.observacion.trim()}`);
    }
  }
  if (area === "SOCIOS" && tramite.anulacion?.observacion) {
    textos.push(`${formatFechaHora(tramite.anulacion.en)} · Anulado: ${tramite.anulacion.observacion}`);
  }
  return textos;
}

export type EventoSolicitud = {
  en: string;
  estado: EstadoSolicitud;
  area?: Area;
  responsable?: string;
  nota?: string;
};

/* ------------------------------------------------------------------ */
/* Expediente digital y carga a SAFI                                   */
/* ------------------------------------------------------------------ */

export const ESTADOS_SINCRONIZACION = ["PENDIENTE", "EN_CURSO", "CARGADO", "ERROR"] as const;
export type EstadoSincronizacion = (typeof ESTADOS_SINCRONIZACION)[number];

/**
 * Campos que la Jefatura de Socios confirma antes de que el sistema cree el
 * socio en el CRM de SAFI.
 *
 * Son los que el CRM guarda como listas cerradas y que no se pueden deducir sin
 * riesgo de los datos del formulario: cómo se agrupa la facturación, con qué
 * modalidad paga y qué valores de cuota le corresponden. La aplicación propone
 * el valor que sale del tarifario del Club (`src/domain/cuotas.ts`) y del
 * formulario, pero es la Jefatura quien decide, porque es quien conoce el
 * acuerdo con cada socio y quien responde de lo que queda escrito en SAFI.
 *
 * Todos los valores se guardan tal como viajan a SAFI, sin traducción posterior.
 */
export type ConfirmacionSafi = {
  /** «Grupo Facturación» (`cf_967`) de la Cuenta. */
  grupoFacturacion: string;
  /** «FORMA_PAGO» (`cf_969`) de la Cuenta, en la glosa exacta del CRM. */
  formaPago: string;
  /** «Tipo Contribuyente» (`cf_975`) de la Cuenta. */
  tipoContribuyente: string;
  /** «Valor Cuota» (`cf_977`) de la Cuenta. Se propone desde la carta. */
  valorCuota: string;
  /** «Subscriciones» (`cf_951`) de la ficha del Socio. */
  suscripcion: string;
  /**
   * «Cuota Anual» (`cf_947`) y «Cuota Mensual» (`cf_949`) de la ficha del Socio.
   *
   * Son excluyentes: el socio se acoge a una modalidad o a la otra, y fijar las
   * dos dejaría la ficha declarando dos cobros distintos. El panel vacía una al
   * llenar la otra.
   */
  cuotaAnual: string;
  cuotaMensual: string;
  /** «Valor Membresía» (`cf_945`) de la ficha del Socio. */
  valorMembresia: string;
  /** Funcionario del Área de Socios que confirmó, y cuándo. */
  confirmadaPor: string;
  confirmadaEn: string;
};

export function confirmacionVacia(): ConfirmacionSafi {
  return {
    grupoFacturacion: "",
    formaPago: "",
    tipoContribuyente: "",
    valorCuota: "",
    suscripcion: "",
    cuotaAnual: "",
    cuotaMensual: "",
    valorMembresia: "",
    confirmadaPor: "",
    confirmadaEn: "",
  };
}

/**
 * Estado de la publicación del expediente en los sistemas del Club: la carpeta
 * del repositorio digital y el módulo Cuentas del CRM de SAFI.
 */
export type EstadoExpediente = {
  /** Carpeta del repositorio, con el formato «280 APELLIDOS NOMBRES». */
  carpeta: string | null;
  /**
   * Identificador de la Cuenta del socio en el CRM de SAFI.
   *
   * Es la unidad a la que se adjuntan los documentos del expediente, así que
   * sin él no se puede publicar nada. Lo devuelve SAFI al crear la Cuenta, o lo
   * anota el Área de Socios si la creó a mano.
   */
  cuentaSafiId?: string | null;
  /** Identificador de la ficha del socio en el módulo Socio de SAFI. */
  socioSafiId?: string | null;
  /**
   * Campos de listas cerradas que la Jefatura de Socios confirmó. Mientras sea
   * `null`, el socio no se ha creado en SAFI y la bandeja reclama la
   * confirmación.
   */
  confirmacionSafi?: ConfirmacionSafi | null;
  /** Motivo por el que la creación en SAFI falló, para mostrarlo en la bandeja. */
  altaSafiMensaje?: string;
  /** Documentos escaneados que el Área de Socios aún no ha depositado. */
  escaneosPendientes: TipoDocumento[];
  /**
   * Firmas o fotografía que ya no llegarán de la tableta y la Jefatura de
   * Socios declaró resueltas de otro modo (la firma consta en el formulario en
   * papel, por ejemplo). Se descuentan de lo que falta.
   */
  adjuntosOmitidos?: OmisionAdjunto[];
  /** Documentos por escanear que este trámite no necesita, y por qué. */
  escaneosOmitidos?: OmisionEscaneo[];
  /**
   * Firmas y fotografía que la tableta ya entregó al servidor. Los que falten
   * generan una tarea en la bandeja del Área de Socios: sin la firma, el
   * formulario no se puede componer.
   */
  adjuntosRecibidos?: RolAdjunto[];
  /**
   * Formulario final —R-PGS1-1, hoja de solicitud, carta y reverso con las tres
   * constancias— archivado en el expediente tras la aprobación.
   */
  formularioFinal?: { archivadoEn: string; nombreArchivo: string } | null;
  /** Motivo por el que el formulario final no pudo generarse, si falló. */
  formularioFinalMensaje?: string;
  /** Publicación en el módulo Cuentas del CRM de SAFI. */
  safi: EstadoSincronizacion;
  safiMensaje?: string;
  safiActualizadoEn?: string;
};

/**
 * Archivo que la tableta debía entregar y que ya no llegará.
 *
 * La firma y la fotografía viven en el almacenamiento privado de la tableta: si
 * el dispositivo se reinstala o la captura se pierde, no hay reintento que las
 * recupere. Sin poder declararlo, la tarea de la bandeja no tenía salida y el
 * trámite se quedaba esperando para siempre.
 */
export type OmisionAdjunto = {
  rol: RolAdjunto;
  /** Por qué no llegará y dónde queda constancia (firma en papel, etc.). */
  motivo: string;
  /** Funcionario que lo declaró, tal como se imprime en el expediente. */
  responsable: string;
  en: string;
};

/** Documento por escanear que este trámite no necesita, con su justificación. */
export type OmisionEscaneo = {
  tipo: TipoDocumento;
  motivo: string;
  responsable: string;
  en: string;
};

export function expedienteVacio(): EstadoExpediente {
  return {
    carpeta: null,
    cuentaSafiId: null,
    socioSafiId: null,
    confirmacionSafi: null,
    escaneosPendientes: [],
    adjuntosRecibidos: [],
    adjuntosOmitidos: [],
    escaneosOmitidos: [],
    formularioFinal: null,
    safi: "PENDIENTE",
  };
}

export type SolicitudAfiliacion = {
  id: string;
  codigo: string;
  esquema: number;
  estado: EstadoSolicitud;
  creadaEn: string;
  actualizadaEn: string;
  datos: DatosAfiliacion;
  documentos: ArchivoAdjunto[];
  /** URI del archivo de la firma o, si no pudo escribirse, su data URI. */
  firmaUri: string | null;
  /** Modalidad con la que se firmó: trazo en pantalla o firma electrónica. */
  modoFirma: ModoFirma;
  identidad: RegistroIdentidad;
  consentimiento: RegistroConsentimiento | null;
  tramite: TramiteInterno;
  expediente: EstadoExpediente;
  historial: EventoSolicitud[];
};

/**
 * Pone al día una solicitud guardada con un esquema anterior.
 *
 * La usan la tableta (sus borradores y registros sobreviven a las
 * actualizaciones de la aplicación) y el servidor (su base guarda cada trámite
 * con la forma que tenía al escribirse). Sin esto, un expediente antiguo
 * abierto con el código nuevo mostraría campos en blanco en lugar de su
 * contenido, que es peor que un error: parece un dato que nunca se capturó.
 *
 *   5 → 6  El nombre del socio titular pasó a dos campos, apellidos y nombres.
 *          El valor antiguo se conserva entero en el de apellidos: partirlo por
 *          la mitad escribiría un nombre equivocado en el CRM.
 *   6 → 7  Se retira «Dependientes a su cargo». Una devolución con observación
 *          que quedó escrita sobre la constancia de revisión o de aprobación
 *          se traslada a `tramite.devolucion`, que es lo que en realidad era.
 *
 * No escribe nada: devuelve la versión al día y quien la guarde la persiste.
 */
export function migrarSolicitud(guardada: SolicitudAfiliacion): SolicitudAfiliacion {
  if (guardada.esquema >= ESQUEMA_SOLICITUD) return guardada;

  const antiguo = (guardada.datos ?? {}) as Partial<DatosAfiliacion> & {
    titularNombre?: string;
    dependientesACargo?: unknown;
  };
  const { titularNombre, dependientesACargo, ...conservados } = antiguo;
  void dependientesACargo;

  const tramite: TramiteInterno = { ...tramiteVacio(), ...(guardada.tramite ?? {}) };
  const historial = guardada.historial ?? [];

  if (guardada.estado === "OBSERVADA" && !tramite.devolucion) {
    const ultima = [...historial].reverse().find((evento) => evento.estado === "OBSERVADA");
    const deContabilidad = ultima?.area === "CONTABILIDAD" && tramite.revision?.en === ultima.en;
    const deGerencia = ultima?.area === "GERENCIA" && tramite.aprobacion?.en === ultima.en;

    if (deContabilidad && tramite.revision) {
      const { numeroFactura, ...constancia } = tramite.revision;
      void numeroFactura;
      tramite.devolucion = constancia;
      tramite.observaciones = [...(tramite.observaciones ?? []), constancia];
      tramite.revision = null;
    } else if (deGerencia && tramite.aprobacion) {
      tramite.devolucion = tramite.aprobacion;
      tramite.observaciones = [...(tramite.observaciones ?? []), tramite.aprobacion];
      tramite.aprobacion = null;
    }
  }

  return {
    ...guardada,
    esquema: ESQUEMA_SOLICITUD,
    datos: {
      ...datosVacios(),
      ...conservados,
      titularApellidos: conservados.titularApellidos ?? titularNombre ?? "",
      titularNombres: conservados.titularNombres ?? "",
      provincia: conservados.provincia ?? "",
      // Lo guardado antes del 15/09/2026 no traía país: hasta entonces el
      // asistente no lo preguntaba y todos los socios registrados eran del
      // Ecuador.
      pais: conservados.pais || PAIS_POR_DEFECTO,
    },
    // Un trámite antiguo puede traer la fotografía tipo carnet, que ya no es un
    // tipo de documento del sistema: se descarta al migrar.
    documentos: (guardada.documentos ?? []).filter(
      (documento) => (documento.tipo as string) !== "FOTO_CARNET"
    ),
    identidad: guardada.identidad ?? identidadVacia(),
    tramite,
    expediente: { ...expedienteVacio(), ...(guardada.expediente ?? {}) },
    historial,
  };
}

/* ------------------------------------------------------------------ */
/* Actualización de datos del socio                                    */
/* ------------------------------------------------------------------ */

export const ESTADOS_ACTUALIZACION = ["REGISTRADA", "APLICADA", "ANULADA"] as const;

export type EstadoActualizacion = (typeof ESTADOS_ACTUALIZACION)[number];

export const ESTADO_ACTUALIZACION_META: Record<
  EstadoActualizacion,
  { etiqueta: string; tono: TonoEstado }
> = {
  REGISTRADA: { etiqueta: "Pendiente de aplicar", tono: "warning" },
  APLICADA: { etiqueta: "Aplicada en los sistemas", tono: "success" },
  ANULADA: { etiqueta: "Anulada", tono: "danger" },
};

/** Campos de la ficha del socio que la aplicación permite actualizar. */
export const CAMPOS_ACTUALIZABLES = [
  "apellidos",
  "nombres",
  "tipoMiembro",
  "estadoCivil",
  "pais",
  "ciudad",
  "provincia",
  "direccion",
  "celular",
  "telefonoDomicilio",
  "telefonoTrabajo",
  "correo",
  "profesion",
  "lugarTrabajo",
  "cargo",
] as const;

export type CampoActualizable = (typeof CAMPOS_ACTUALIZABLES)[number];

export const ETIQUETA_CAMPO: Record<CampoActualizable | "fotografia", string> = {
  apellidos: "Apellidos",
  nombres: "Nombres",
  tipoMiembro: "Tipo de socio",
  estadoCivil: "Estado civil",
  pais: "País",
  ciudad: "Ciudad",
  provincia: "Provincia",
  direccion: "Dirección",
  celular: "Teléfono celular",
  telefonoDomicilio: "Teléfono domicilio",
  telefonoTrabajo: "Teléfono trabajo",
  correo: "Correo electrónico",
  profesion: "Profesión",
  lugarTrabajo: "Lugar de trabajo",
  cargo: "Cargo",
  fotografia: "Fotografía",
};

export type CambioRegistrado = {
  campo: CampoActualizable | "fotografia";
  anterior: string;
  nuevo: string;
};

export type SolicitudActualizacion = {
  id: string;
  codigo: string;
  esquema: number;
  estado: EstadoActualizacion;
  creadaEn: string;
  actualizadaEn: string;
  numeroSocio: string;
  nombreSocio: string;
  cedula: string;
  cambios: CambioRegistrado[];
  fotoUri: string | null;
  observacion: string;
  /** Indica si el cambio obliga a reimprimir la credencial. */
  requiereNuevaCredencial: boolean;
  consentimiento: RegistroConsentimiento | null;
  historial: { en: string; estado: EstadoActualizacion; nota?: string }[];
};
