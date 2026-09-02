import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Acceso tipado a AsyncStorage.
 *
 * Centraliza el manejo de errores: un JSON corrupto o una lectura fallida
 * devuelven el valor por defecto en lugar de propagar la excepción y romper
 * la pantalla que consume el dato.
 */

export const CLAVES = {
  solicitudes: "campina.solicitudes.afiliacion.v4",
  actualizaciones: "campina.solicitudes.actualizacion.v1",
  borradorAfiliacion: "campina.borrador.afiliacion.v4",
  /** Funcionario del Área de Socios que opera la tableta. */
  operador: "campina.operador.v1",
  /** Configuración de conexión con el servidor institucional. */
  servidor: "campina.servidor.v1",
} as const;

export async function leerJSON<T>(clave: string, porDefecto: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(clave);
    if (!raw) return porDefecto;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`[almacenamiento] No se pudo leer "${clave}":`, error);
    return porDefecto;
  }
}

export async function escribirJSON(clave: string, valor: unknown): Promise<boolean> {
  try {
    await AsyncStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch (error) {
    console.warn(`[almacenamiento] No se pudo guardar "${clave}":`, error);
    return false;
  }
}

export async function eliminar(clave: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(clave);
  } catch (error) {
    console.warn(`[almacenamiento] No se pudo eliminar "${clave}":`, error);
  }
}

/** Identificador local único, suficiente para el ámbito de un dispositivo. */
export function nuevoId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
