/**
 * Validaciones reutilizables. Cada función devuelve `null` si el valor es
 * válido, o el mensaje de error que debe mostrarse al usuario.
 */

export type ValidationResult = string | null;

/* ------------------------------------------------------------------ */
/* Cédula de identidad ecuatoriana                                     */
/* ------------------------------------------------------------------ */

/**
 * Valida el dígito verificador de una cédula ecuatoriana (algoritmo módulo 10).
 *
 * Reglas aplicadas:
 *  - 10 dígitos numéricos.
 *  - Los dos primeros dígitos corresponden a una provincia válida (01–24, o 30
 *    para ciudadanos registrados en el exterior).
 *  - El tercer dígito es menor a 6 (persona natural).
 *  - El décimo dígito es el verificador calculado con coeficientes 2,1,2,1…
 */
export function esCedulaValida(valor: string): boolean {
  const cedula = valor.replace(/\D/g, "");
  if (cedula.length !== 10) return false;

  const provincia = Number(cedula.slice(0, 2));
  if ((provincia < 1 || provincia > 24) && provincia !== 30) return false;

  const tercerDigito = Number(cedula[2]);
  if (tercerDigito >= 6) return false;

  let suma = 0;
  for (let i = 0; i < 9; i += 1) {
    const coeficiente = i % 2 === 0 ? 2 : 1;
    let producto = Number(cedula[i]) * coeficiente;
    if (producto >= 10) producto -= 9;
    suma += producto;
  }

  const decenaSuperior = Math.ceil(suma / 10) * 10;
  const verificador = decenaSuperior - suma === 10 ? 0 : decenaSuperior - suma;
  return verificador === Number(cedula[9]);
}

export function validarCedula(valor: string, obligatorio = true): ValidationResult {
  const limpio = valor.trim();
  if (!limpio) return obligatorio ? "Ingrese el número de cédula." : null;
  if (!/^\d+$/.test(limpio)) return "La cédula solo debe contener números.";
  if (limpio.length !== 10) return "La cédula debe tener 10 dígitos.";
  if (!esCedulaValida(limpio)) return "El número de cédula no es válido.";
  return null;
}

/* ------------------------------------------------------------------ */
/* Nombres                                                             */
/* ------------------------------------------------------------------ */

export function validarNombre(valor: string, etiqueta = "nombre", obligatorio = true): ValidationResult {
  const limpio = valor.trim();
  if (!limpio) return obligatorio ? `Ingrese el ${etiqueta}.` : null;
  if (limpio.length < 3) return `El ${etiqueta} es demasiado corto.`;
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]+$/.test(limpio)) return `El ${etiqueta} contiene caracteres no válidos.`;
  return null;
}

/** Exige al menos dos palabras (nombres y apellidos). */
export function validarNombreCompleto(valor: string): ValidationResult {
  const base = validarNombre(valor, "nombre completo");
  if (base) return base;
  if (valor.trim().split(/\s+/).length < 2) return "Ingrese nombres y apellidos completos.";
  return null;
}

/* ------------------------------------------------------------------ */
/* Contacto                                                            */
/* ------------------------------------------------------------------ */

/** Celular ecuatoriano: 10 dígitos que inician en 09. */
export function validarCelular(valor: string, obligatorio = true): ValidationResult {
  const limpio = valor.replace(/[\s-]/g, "");
  if (!limpio) return obligatorio ? "Ingrese un número de celular." : null;
  if (!/^\d+$/.test(limpio)) return "El teléfono solo debe contener números.";
  if (!/^09\d{8}$/.test(limpio)) return "El celular debe tener 10 dígitos e iniciar en 09.";
  return null;
}

/** Convencional ecuatoriano: 9 dígitos que inician en 0 (p. ej. 022345678). */
export function validarConvencional(valor: string, obligatorio = false): ValidationResult {
  const limpio = valor.replace(/[\s-]/g, "");
  if (!limpio) return obligatorio ? "Ingrese un número telefónico." : null;
  if (!/^\d+$/.test(limpio)) return "El teléfono solo debe contener números.";
  if (!/^0[2-7]\d{7}$/.test(limpio)) return "Ingrese un convencional válido (9 dígitos, ej. 022345678).";
  return null;
}

export function validarCorreo(valor: string, obligatorio = true): ValidationResult {
  const limpio = valor.trim();
  if (!limpio) return obligatorio ? "Ingrese un correo electrónico." : null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(limpio)) return "El correo electrónico no es válido.";
  return null;
}

/* ------------------------------------------------------------------ */
/* Genéricas                                                           */
/* ------------------------------------------------------------------ */

export function validarObligatorio(valor: string, mensaje: string): ValidationResult {
  return valor.trim() ? null : mensaje;
}

export function validarLongitudMinima(valor: string, minimo: number, mensaje: string): ValidationResult {
  return valor.trim().length >= minimo ? null : mensaje;
}

/* ------------------------------------------------------------------ */
/* Normalizadores de entrada                                           */
/* ------------------------------------------------------------------ */

/** Deja solo dígitos y recorta a `max` caracteres. */
export function soloDigitos(valor: string, max: number): string {
  return valor.replace(/\D/g, "").slice(0, max);
}

/** Normaliza espacios y capitaliza cada palabra. */
export function formatearNombre(valor: string): string {
  return valor
    .replace(/\s+/g, " ")
    .trimStart()
    .replace(/(^|\s)(\p{L})/gu, (_m, sep: string, letra: string) => sep + letra.toLocaleUpperCase("es-EC"));
}

export function normalizarCorreo(valor: string): string {
  return valor.trim().toLowerCase();
}
