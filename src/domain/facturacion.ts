/**
 * Forma de pago de la cuota de mantenimiento.
 *
 * La facturación **no forma parte del alcance** del sistema: la resuelve el Área
 * de Contabilidad en el CRM de SAFI, a partir del registro ya creado en el
 * módulo Cuentas (informe CLC-TI-010 versión 6, numerales 1 y 10). De ahí que
 * aquí no haya tarifario, ni rubros, ni cálculo de comprobantes.
 *
 * Lo que sí es de este sistema es **cómo paga el socio**, porque es un dato de
 * su ficha: viaja al campo FORMA_PAGO (`cf_969`) de su Cuenta en el CRM. El
 * importe de la cuota lo confirma la Jefatura del Área de Socios en su bandeja
 * web antes del alta, con el tarifario del Club (`cuotas.ts`) como propuesta.
 */

export const FORMAS_PAGO = [
  "TRANSFERENCIA_FAE",
  "DESCUENTO_ISFA",
  "TARJETA_CREDITO",
  "DEBITO_BANCARIO",
  "VENTANILLA",
] as const;

export type FormaPago = (typeof FORMAS_PAGO)[number];

export const FORMA_PAGO_META: Record<FormaPago, { etiqueta: string; detalle: string }> = {
  TRANSFERENCIA_FAE: {
    etiqueta: "Transferencia FAE",
    detalle:
      "Transferencia a través de la Fuerza Aérea Ecuatoriana. Corresponde a «FAE – TRANSFERENCIA» en el CRM de SAFI.",
  },
  DESCUENTO_ISFA: {
    etiqueta: "Descuento automático ISFA",
    detalle: "Se descuenta del rol a través del Instituto de Seguridad Social de las Fuerzas Armadas.",
  },
  TARJETA_CREDITO: {
    etiqueta: "Tarjeta de crédito",
    detalle: "Débito recurrente autorizado a una tarjeta de crédito.",
  },
  DEBITO_BANCARIO: {
    etiqueta: "Débito bancario",
    detalle: "Débito automático de una cuenta bancaria.",
  },
  VENTANILLA: {
    etiqueta: "Pago en ventanilla",
    detalle: "El socio se acerca a cancelar directamente en el Club.",
  },
};
