import type { TipoDocumento } from "./documentos";
import type { FormaPago } from "./facturacion";
import type { ModoFirma } from "./firmaElectronica";
import type { ClaveConsentimiento } from "./privacidad";
import type {
  Fuerza,
  ModeloCarta,
  Sexo,
  SituacionMilitar,
  TipoMiembro,
  VinculoDependiente,
} from "./tiposMiembro";

/**
 * Tono cromático sugerido para representar un estado.
 * Coincide con `BadgeTone` de la capa de UI, pero se declara aquí para que el
 * dominio no dependa de los componentes visuales.
 */
export type TonoEstado = "neutral" | "info" | "success" | "warning" | "danger" | "gold";

/** Versión del esquema de datos persistido. Permite migrar registros antiguos. */
export const ESQUEMA_SOLICITUD = 6;

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
      "El Área de Socios registró la afiliación. Pendiente de revisión por el Área de Contabilidad.",
    responsable: "Contabilidad",
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
  RECHAZADA: {
    etiqueta: "Rechazada",
    tono: "danger",
    descripcion: "La solicitud no procede. Revise la observación registrada.",
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
  };
}

/**
 * Listado «Dependientes a su cargo» del formulario del socio activo
 * (R-PGS1-1): hasta seis personas, con su vínculo familiar.
 */
export type DependienteACargo = {
  id: string;
  apellidosNombres: string;
  vinculo: VinculoDependiente | null;
};

/* ------------------------------------------------------------------ */
/* Carta de compromiso                                                 */
/* ------------------------------------------------------------------ */

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
  /** Entidad financiera para el débito automático. */
  entidadFinanciera: string;
  tipoCuenta: "AHORROS" | "CORRIENTE" | null;
  numeroCuenta: string;
  /** Alternativa al débito de cuenta: tarjeta de crédito y su caducidad. */
  tarjetaCredito: string;
  caducidadTarjeta: string;
  /** Cuota de mantenimiento anual reconocida en la carta. */
  cuotaAnual: string;
  /** Valor mensualizado, si el socio se acoge a esa modalidad. */
  cuotaMensualizada: string;
  aceptadaEn: string | null;
};

export function cartaVacia(modelo: ModeloCarta): DatosCartaCompromiso {
  return {
    modelo,
    nacionalidad: "ECUATORIANA",
    fechaSesionDirectorio: "",
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
   * «Número de Socio Activo» del reverso: el oficial FAE del que depende un
   * socio D-A o D-B, que conserva cuenta y facturación propias.
   */
  numeroSocioActivo: string;

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

  /** Fecha de ingreso al Club declarada en el formulario. */
  fechaIngresoClub: string;

  /** Bloques que solo aparecen en algunos formularios. */
  conyuge: DatosConyuge;
  hijos: DatosHijo[];
  garantes: DatosGarante[];
  dependientesACargo: DependienteACargo[];
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
    numeroSocioActivo: "",
    apellidos: "",
    nombres: "",
    cedula: "",
    sexo: null,
    lugarNacimiento: "",
    fechaNacimiento: "",
    estadoCivil: "",
    tipoSangre: "",
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
    dependientesACargo: [],
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
};

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
  };
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
  /** Publicación en el módulo Cuentas del CRM de SAFI. */
  safi: EstadoSincronizacion;
  safiMensaje?: string;
  safiActualizadoEn?: string;
};

export function expedienteVacio(): EstadoExpediente {
  return {
    carpeta: null,
    cuentaSafiId: null,
    socioSafiId: null,
    confirmacionSafi: null,
    escaneosPendientes: [],
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
