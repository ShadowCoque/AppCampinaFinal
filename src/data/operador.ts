import { normalizarNombreFinal } from "../domain/texto";
import { CLAVES, escribirJSON, leerJSON } from "./almacenamiento";

/**
 * Funcionario del Área de Socios que opera la tableta.
 *
 * Su nombre queda impreso en la constancia «Registrado» del reverso del
 * formulario y en la bitácora del trámite. Que hoy esa casilla se llene de
 * manera irregular es precisamente uno de los problemas que el informe
 * CLC-TI-010 identifica (numeral 3), así que la aplicación lo pide una sola vez
 * y lo aplica a todas las afiliaciones que se registren desde el dispositivo.
 */

const POR_DEFECTO = "ÁREA DE SOCIOS";

export async function leerOperador(): Promise<string> {
  const guardado = await leerJSON<string>(CLAVES.operador, "");
  return guardado.trim() || POR_DEFECTO;
}

export async function guardarOperador(nombre: string): Promise<void> {
  await escribirJSON(CLAVES.operador, normalizarNombreFinal(nombre));
}

export async function hayOperador(): Promise<boolean> {
  const guardado = await leerJSON<string>(CLAVES.operador, "");
  return guardado.trim().length > 0;
}
