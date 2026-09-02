/**
 * Política de tratamiento de datos personales del Club La Campiña.
 *
 * Redactada conforme a la Ley Orgánica de Protección de Datos Personales
 * (LOPDP) del Ecuador —Registro Oficial Suplemento 459 del 26 de mayo de 2021—
 * y su Reglamento General.
 *
 * ALCANCE DE ESTA VERSIÓN: corresponde al Escenario 1 del informe CLC-TI-010,
 * que es el que entra en producción en agosto de 2026. No contempla la consulta
 * al Registro Civil ni la firma electrónica de un solo uso, porque ambas
 * dependen de trámites con terceros que aún no concluyen. Cuando cualquiera de
 * las dos se habilite, deberá incorporarse la finalidad correspondiente,
 * incrementar `VERSION_AVISO` y recabar nuevamente el consentimiento: las
 * solicitudes ya firmadas conservan evidencia de la versión que aceptaron.
 *
 * El texto se mantiene deliberadamente breve. Un aviso que nadie lee no informa
 * a nadie, y la LOPDP exige que la información se entregue en forma concisa,
 * inteligible y en lenguaje claro (art. 12).
 */

export const VERSION_AVISO = "2.0";
export const FECHA_VIGENCIA_AVISO = "2026-08-26";

export const TITULO_AVISO = "Política de tratamiento de datos personales de los socios";

/** Datos de contacto del responsable del tratamiento. */
export const RESPONSABLE = {
  razonSocial:
    "Club Social y Deportivo de Oficiales de la Fuerza Aérea Ecuatoriana — Club La Campiña",
  nombreCorto: "Club La Campiña",
  /** Canal oficial para que el titular ejerza sus derechos sobre sus datos. */
  correoContacto: "socios@clublacampina.com.ec",
  direccion: "Av. Galo Plaza Lasso S/N y Capitán Rafael Ramos, Quito",
  telefono: "(02) 2 408 514 · (02) 2 408 108",
  sitioWeb: "https://clublacampina.com.ec",
} as const;

export type SeccionAviso = { titulo: string; parrafos: string[] };

export const AVISO_PRIVACIDAD: SeccionAviso[] = [
  {
    titulo: "1. Quién trata sus datos",
    parrafos: [
      `El responsable es el ${RESPONSABLE.razonSocial}, en adelante «el Club», con domicilio en ${RESPONSABLE.direccion}.`,
      `Para cualquier asunto relacionado con sus datos personales, escriba a ${RESPONSABLE.correoContacto} o acérquese a la oficina del Área de Socios.`,
    ],
  },
  {
    titulo: "2. Qué datos recogemos",
    parrafos: [
      "Identificación: apellidos y nombres, cédula, sexo, lugar y fecha de nacimiento, estado civil y tipo de sangre.",
      "Contacto: dirección domiciliaria, ciudad, teléfonos y correo electrónico.",
      "Ocupación: profesión, lugar de trabajo y cargo y, cuando el tipo de socio lo exige, grado militar, promoción, fuerza y situación (activo o pasivo).",
      "Familiares: los datos de su cónyuge, hijos y dependientes que el formulario de su tipo de socio contempla, y el nombre y número del socio titular o de los socios que lo garantizan.",
      "Imagen y firma: su fotografía tipo carnet y la firma que registra en la pantalla del dispositivo.",
      "Documentos: las copias digitalizadas que usted entrega para conformar su expediente.",
    ],
  },
  {
    titulo: "3. Para qué los usamos",
    parrafos: [
      "Tramitar su afiliación y llenar con ellos el formulario de ingreso que corresponde a su tipo de socio.",
      "Conformar y mantener su expediente de socio y el de sus dependientes.",
      "Emitir su credencial de socio y controlar el acceso a las instalaciones del Club.",
      "Emitir los comprobantes de venta y gestionar el cobro de cuotas y consumos.",
      "Comunicarnos con usted sobre asuntos administrativos de su condición de socio.",
      "Cumplir las obligaciones legales, tributarias y de control que le corresponden al Club.",
    ],
  },
  {
    titulo: "4. Con qué legitimación",
    parrafos: [
      "Con su consentimiento libre, específico, informado e inequívoco, que otorga al firmar este formulario; con la ejecución de la relación asociativa que se establece entre usted y el Club; y con el cumplimiento de las obligaciones legales aplicables.",
      "El consentimiento para recibir comunicaciones sobre eventos y servicios es opcional: puede negarlo sin que ello afecte su afiliación.",
    ],
  },
  {
    titulo: "5. Quién accede a su información",
    parrafos: [
      "El Área de Socios, que conduce su trámite, conforma su expediente y emite su credencial.",
      "El Área de Contabilidad, que recibe únicamente lo necesario para facturar y verificar su registro.",
      "La Gerencia, que aprueba su ingreso.",
      "Sus datos se registran en los sistemas institucionales del Club: el CRM de SAFI, el software de control de accesos y el repositorio digital de expedientes alojado en el servidor del Club.",
      "El Club no vende, cede ni comparte sus datos con terceros, salvo requerimiento de autoridad competente u obligación legal expresa.",
    ],
  },
  {
    titulo: "6. Cuánto tiempo los conservamos",
    parrafos: [
      "Mientras mantenga la condición de socio y, después, durante el plazo que exijan las obligaciones legales, contables y tributarias. Cumplido ese plazo, la información se elimina o se anonimiza.",
      "Si su solicitud no llegara a aprobarse, sus datos se conservan solo el tiempo necesario para sustentar la decisión y atender un eventual reclamo.",
    ],
  },
  {
    titulo: "7. Sus derechos",
    parrafos: [
      "La LOPDP le reconoce los derechos de acceso, rectificación y actualización, eliminación, oposición, portabilidad, suspensión del tratamiento y a no ser objeto de decisiones automatizadas.",
      `Para ejercerlos, presente una solicitud en la oficina del Área de Socios o escriba a ${RESPONSABLE.correoContacto} adjuntando copia de su cédula. El Club responderá dentro de los plazos que fija la normativa.`,
      "Si considera que sus derechos no fueron atendidos, puede reclamar ante la Superintendencia de Protección de Datos Personales.",
    ],
  },
  {
    titulo: "8. Cómo protegemos su información",
    parrafos: [
      "El acceso al sistema está restringido por perfiles: cada área ve únicamente lo que necesita para su parte del trámite, y toda actuación queda registrada con fecha, hora y responsable.",
      "Su expediente digital se conserva cifrado en el servidor del Club, con respaldos periódicos, y se replica en el módulo Cuentas del CRM de SAFI.",
      "Mientras su solicitud permanece en el dispositivo del Área de Socios, se guarda solo en el almacenamiento privado de la aplicación y se elimina del equipo una vez transferida al expediente institucional.",
    ],
  },
  {
    titulo: "9. Sobre su firma",
    parrafos: [
      "Su firma se captura en la pantalla del dispositivo y se incorpora al formulario de ingreso, junto con la fecha, la hora y la versión de esta política que usted aceptó. Se utiliza únicamente como constancia de su aceptación y no se emplea para ningún otro fin.",
    ],
  },
  {
    titulo: "10. Cambios y revocatoria",
    parrafos: [
      "Puede revocar su consentimiento en cualquier momento, sin efectos retroactivos, mediante solicitud dirigida al Área de Socios. Revocar el consentimiento necesario para gestionar su condición de socio puede impedir mantener la afiliación y los servicios asociados.",
      `Si esta política cambia, el Club publicará la nueva versión y se la presentará antes de recabar nuevamente su autorización. Versión vigente: ${VERSION_AVISO}, en vigor desde el ${FECHA_VIGENCIA_AVISO}.`,
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Consentimientos                                                     */
/* ------------------------------------------------------------------ */

export const CONSENTIMIENTOS = [
  {
    clave: "tratamientoDatos",
    obligatorio: true,
    titulo: "Autorizo el tratamiento de mis datos personales",
    detalle:
      "Autorizo al Club La Campiña a recolectar y tratar mis datos personales y los de mis dependientes para tramitar mi afiliación, conformar mi expediente de socio y prestarme los servicios del Club, conforme a esta política.",
  },
  {
    clave: "imagenCredencial",
    obligatorio: true,
    titulo: "Autorizo el uso de mi fotografía y mi firma para la credencial",
    detalle:
      "Autorizo el uso de mi fotografía y de mi firma únicamente para emitir mi credencial de socio y controlar el acceso a las instalaciones del Club.",
  },
  {
    clave: "veracidad",
    obligatorio: true,
    titulo: "Declaro que la información es verídica",
    detalle:
      "Declaro bajo mi responsabilidad que la información y los documentos entregados son verdaderos, y me comprometo a informar al Club cualquier cambio.",
  },
  {
    clave: "comunicaciones",
    obligatorio: false,
    titulo: "Deseo recibir comunicaciones del Club (opcional)",
    detalle:
      "Acepto recibir información sobre eventos, servicios y actividades del Club por correo electrónico o mensajería. Puedo retirar esta autorización cuando lo desee.",
  },
] as const;

export type ClaveConsentimiento = (typeof CONSENTIMIENTOS)[number]["clave"];

export const CONSENTIMIENTOS_OBLIGATORIOS = CONSENTIMIENTOS.filter((c) => c.obligatorio).map(
  (c) => c.clave
);

/** Resumen corto que se muestra en la cabecera del formulario. */
export const RESUMEN_LOPDP =
  "Los datos que registre en este formulario serán tratados por el Club La Campiña únicamente para su afiliación, la emisión de su credencial y la prestación de servicios, conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador.";

/**
 * Párrafo que consta impreso en todos los formularios físicos del Club y que se
 * reproduce, tal cual, en el formulario que genera la aplicación.
 */
export const CLAUSULA_FORMULARIO =
  "A los efectos de lo dispuesto en la Ley Orgánica de Protección de Datos Personales publicado en el Suplemento Registro Oficial No. 459 de 26 de mayo de 2021 y demás normativa, el/la firmante autoriza la utilización de sus datos personales contenidos en los documentos presentados y su tratamiento en un archivo de titularidad del Club, con la exclusiva finalidad de realización de campañas publicitarias y prestación de servicios, así como para gestionar cualquier aspecto relativo a su relación con el Club.";

/**
 * Párrafo de solicitud de ingreso que encabeza todos los formularios, dirigido
 * al Gerente del Club.
 */
export const CLAUSULA_SOLICITUD =
  "por la presente y reuniendo los requisitos establecidos por el COFAE, SOLICITO el ALTA como SOCIO/A del Club de Oficiales de la Fuerza Aérea Ecuatoriana a partir de la fecha más abajo indicada, comprometiéndome a abonar las cuotas que en su caso el Club establezca y aceptando los términos que se reflejan en los Estatutos.";
