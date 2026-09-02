/**
 * Normalización de texto para los sistemas del Club.
 *
 * El CRM de SAFI, el software Autoparking y el repositorio digital de
 * expedientes almacenan los nombres de las personas en MAYÚSCULAS y SIN
 * TILDES. Si la aplicación capturara "Joel Sebastián Coque Vega" y SAFI
 * guardara "COQUE VEGA JOEL SEBASTIAN", el nombre de la carpeta del expediente
 * dejaría de coincidir con el del socio y la carga automática de documentos
 * fallaría.
 *
 * Por eso la normalización se aplica en el momento de la captura, no al
 * exportar: lo que el operador ve en pantalla es exactamente lo que quedará
 * escrito en todos los sistemas.
 */

/**
 * La eñe se conserva: en español no es una vocal acentuada sino una letra
 * propia, y así consta en los apellidos registrados (MUÑOZ, PEÑAFIEL). Si se
 * comprobara que el CRM de SAFI la almacena como N, basta poner esta constante
 * en `false` y toda la aplicación se alinea.
 */
const CONSERVAR_ENIE = true;

/** Marcadores del área de uso privado Unicode: no aparecen en texto real. */
const MARCA_ENIE = "\uE000";
const MARCA_ENIE_MINUSCULA = "\uE001";

/** Diacríticos combinantes que produce la descomposición NFD. */
const DIACRITICOS = /[\u0300-\u036f]/g;

/** Sustituye las vocales acentuadas por su equivalente sin diacrítico. */
export function sinTildes(valor: string): string {
  const protegido = CONSERVAR_ENIE
    ? valor.replace(/Ñ/g, MARCA_ENIE).replace(/ñ/g, MARCA_ENIE_MINUSCULA)
    : valor;

  const plano = protegido.normalize("NFD").replace(DIACRITICOS, "").normalize("NFC");

  return CONSERVAR_ENIE
    ? plano.split(MARCA_ENIE).join("Ñ").split(MARCA_ENIE_MINUSCULA).join("ñ")
    : plano;
}

/**
 * Formato institucional de nombres y apellidos: MAYÚSCULAS, sin tildes, sin
 * signos de puntuación y con un solo espacio entre palabras.
 *
 * Se conserva el espacio final mientras el operador escribe (no se hace
 * `trim()` completo) para que pueda separar palabras sin que el campo se lo
 * impida.
 */
export function normalizarNombre(valor: string): string {
  return sinTildes(valor)
    .toUpperCase()
    // Guiones, apóstrofos y puntos separan palabras (ANA-MARIA → ANA MARIA).
    .replace(/['\u2019.\-]/g, " ")
    .replace(/[^A-ZÑ\s]/g, "")
    .replace(/\s+/g, " ")
    .trimStart();
}

/** Igual que `normalizarNombre`, pero sin espacios sobrantes. Para persistir. */
export function normalizarNombreFinal(valor: string): string {
  return normalizarNombre(valor).trim();
}

/**
 * Normaliza un texto libre que también viaja a los sistemas externos
 * (direcciones, lugares de trabajo, cargos): sin tildes y en mayúsculas, pero
 * conservando números y la puntuación habitual de una dirección.
 */
export function normalizarTextoInstitucional(valor: string): string {
  return sinTildes(valor).toUpperCase().replace(/\s+/g, " ").trimStart();
}

/** Clave de comparación: sin tildes, en minúsculas y sin espacios sobrantes. */
export function claveComparacion(valor: string): string {
  return sinTildes(valor).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Compone el nombre en el orden institucional (apellidos primero), que es el
 * que usan SAFI y las carpetas del repositorio digital.
 */
export function nombreInstitucional(apellidos: string, nombres: string): string {
  return normalizarNombreFinal(`${apellidos} ${nombres}`);
}

/** `  0280 ` → `280`. Número de socio sin ceros a la izquierda ni separadores. */
export function normalizarNumeroSocio(valor: string): string {
  return valor.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

/**
 * Nombre de archivo seguro para el repositorio digital: sin los caracteres que
 * Windows, Linux y SMB reservan. No toca mayúsculas ni tildes, que ya vienen
 * resueltas por `normalizarNombre`.
 */
export function nombreArchivoSeguro(valor: string): string {
  return valor
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
