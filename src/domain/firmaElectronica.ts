/**
 * Modalidad de firma del formulario de afiliación.
 *
 * Hoy el solicitante firma con el dedo sobre la pantalla. Ese trazo es una
 * evidencia razonable de que la persona estuvo presente y aceptó, pero no es
 * una firma electrónica en el sentido de la Ley de Comercio Electrónico, Firmas
 * Electrónicas y Mensajes de Datos: no hay certificado que vincule el trazo con
 * una identidad, de modo que su valor probatorio depende de que el Club pueda
 * acreditar el contexto en que se obtuvo.
 *
 * La modalidad "One Shot" resuelve eso: una entidad de certificación acreditada
 * por ARCOTEL emite un certificado de un solo uso en el momento de firmar, lo
 * activa con un código de un solo uso enviado al solicitante y produce una firma
 * electrónica con los mismos efectos jurídicos que la manuscrita, sin que el
 * socio necesite tener una firma electrónica propia.
 *
 * ESTADO: pendiente de contratación (actividades V-6 y S-5 del informe
 * CLC-TI-009). Cambiar `MODO_FIRMA` es lo único necesario para conmutar.
 */

export const MODOS_FIRMA = ["MANUSCRITA_EN_PANTALLA", "ONE_SHOT"] as const;

export type ModoFirma = (typeof MODOS_FIRMA)[number];

export const MODO_FIRMA: ModoFirma = "MANUSCRITA_EN_PANTALLA";

export const MODO_FIRMA_META: Record<
  ModoFirma,
  { etiqueta: string; valorProbatorio: string; requiere: string }
> = {
  MANUSCRITA_EN_PANTALLA: {
    etiqueta: "Firma manuscrita capturada en pantalla",
    valorProbatorio:
      "Constituye evidencia de la aceptación del solicitante, respaldada por el registro de fecha, hora y versión del aviso de privacidad, pero no equivale por sí sola a una firma electrónica certificada.",
    requiere: "Únicamente el dispositivo del Área de Socios.",
  },
  ONE_SHOT: {
    etiqueta: "Firma electrónica de un solo uso (One Shot)",
    valorProbatorio:
      "Tiene los mismos efectos jurídicos que una firma manuscrita conforme a la Ley de Comercio Electrónico, Firmas Electrónicas y Mensajes de Datos, y goza de presunción de autenticidad e integridad al provenir de una entidad de certificación acreditada por ARCOTEL.",
    requiere:
      "Un número celular o correo del solicitante para recibir el código de un solo uso, y el servicio contratado con la entidad de certificación.",
  },
};

/** Texto que se muestra al solicitante antes de firmar. */
export const LEYENDA_FIRMA: Record<ModoFirma, string> = {
  MANUSCRITA_EN_PANTALLA:
    "Al firmar declara que la información entregada es verídica y que acepta el tratamiento de sus datos personales conforme al aviso de privacidad del Club.",
  ONE_SHOT:
    "Al confirmar el código recibido, se emitirá a su nombre un certificado de firma electrónica de un solo uso y se firmará electrónicamente su solicitud de afiliación. La firma tiene la misma validez legal que una firma manuscrita.",
};

export function firmaTieneValidezLegalPlena(): boolean {
  return MODO_FIRMA === "ONE_SHOT";
}
