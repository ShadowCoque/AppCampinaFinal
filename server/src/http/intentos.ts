/**
 * Control de intentos de acceso fallidos.
 *
 * El servidor vive en la red interna del Club, pero la bandeja la abren equipos
 * compartidos y las contraseñas las teclean personas. Sin un freno, un script
 * en esa misma red puede probar contraseñas a la velocidad que le permita el
 * servidor; con él, cada intento fallido encarece el siguiente.
 *
 * Se lleva en memoria a propósito: el volumen es mínimo, y reiniciar el
 * servicio —que es una operación deliberada del administrador— limpia los
 * bloqueos sin necesidad de tocar la base.
 */

const INTENTOS_ANTES_DE_ESPERAR = 5;
const ESPERA_BASE_MS = 2_000;
const ESPERA_MAXIMA_MS = 5 * 60_000;
/** Un usuario sin intentos fallidos recientes se olvida a los 30 minutos. */
const OLVIDO_MS = 30 * 60_000;

type Registro = { fallos: number; ultimoEn: number; bloqueadoHasta: number };

const registros = new Map<string, Registro>();

function clave(usuario: string, ip: string): string {
  return `${usuario.trim().toLowerCase()}@${ip}`;
}

function limpiar(ahora: number): void {
  for (const [id, registro] of registros) {
    if (ahora - registro.ultimoEn > OLVIDO_MS) registros.delete(id);
  }
}

export type EstadoIntento = { permitido: true } | { permitido: false; segundos: number };

/** Comprueba si este usuario, desde esta IP, puede intentar acceder ahora. */
export function puedeIntentar(usuario: string, ip: string): EstadoIntento {
  const ahora = Date.now();
  limpiar(ahora);

  const registro = registros.get(clave(usuario, ip));
  if (!registro || registro.bloqueadoHasta <= ahora) return { permitido: true };

  return { permitido: false, segundos: Math.ceil((registro.bloqueadoHasta - ahora) / 1000) };
}

/**
 * Anota un intento fallido. La espera crece de forma exponencial a partir del
 * quinto fallo y se detiene en cinco minutos: suficiente para que probar
 * contraseñas deje de ser viable, poco para que un funcionario que se equivocó
 * al teclear quede fuera del sistema.
 */
export function anotarFallo(usuario: string, ip: string): void {
  const ahora = Date.now();
  const id = clave(usuario, ip);
  const registro = registros.get(id) ?? { fallos: 0, ultimoEn: ahora, bloqueadoHasta: 0 };

  registro.fallos += 1;
  registro.ultimoEn = ahora;

  if (registro.fallos > INTENTOS_ANTES_DE_ESPERAR) {
    const exceso = registro.fallos - INTENTOS_ANTES_DE_ESPERAR;
    const espera = Math.min(ESPERA_BASE_MS * 2 ** (exceso - 1), ESPERA_MAXIMA_MS);
    registro.bloqueadoHasta = ahora + espera;
  }

  registros.set(id, registro);
}

/** Un acceso correcto borra el historial de fallos. */
export function anotarExito(usuario: string, ip: string): void {
  registros.delete(clave(usuario, ip));
}

/** Solo para pruebas. */
export function reiniciarIntentos(): void {
  registros.clear();
}
