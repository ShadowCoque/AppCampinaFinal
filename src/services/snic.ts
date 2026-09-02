import {
  MODO_DEMOSTRACION,
  NIVEL_ACCESO,
  type DatosSnic,
  type ResultadoConsulta,
} from "../domain/snic";
import { esCedulaValida } from "../domain/validaciones";

/**
 * Cliente del web service de identidad del Registro Civil (SNIC).
 *
 * Toda la comunicación con el DIGERCIC pasa por este archivo. Al firmarse el
 * contrato de adhesión solo hay que completar `consultarEnDigercic` con la URL,
 * las credenciales y el mapeo de campos que consten en la ficha técnica de
 * interoperabilidad; el resto de la aplicación no cambia.
 */

/** Configuración del punto de acceso. Se completa al habilitarse el servicio. */
const ENDPOINT = {
  url: "", // p. ej. https://interoperabilidad.registrocivil.gob.ec/...
  usuario: "",
  // La contraseña y el token NO deben quedar en el código: se inyectan como
  // variables de entorno del build o se recuperan del almacenamiento seguro.
  tiempoLimiteMs: 12000,
};

/* ------------------------------------------------------------------ */
/* Consulta real                                                       */
/* ------------------------------------------------------------------ */

async function consultarEnDigercic(cedula: string): Promise<ResultadoConsulta> {
  if (!ENDPOINT.url) {
    return {
      estado: "SIN_CONVENIO",
      mensaje:
        "El servicio del Registro Civil aún no está configurado. Complete los datos manualmente.",
    };
  }

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), ENDPOINT.tiempoLimiteMs);

  try {
    const respuesta = await fetch(ENDPOINT.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cedula, nivel: NIVEL_ACCESO }),
      signal: control.signal,
    });

    if (respuesta.status === 404) {
      return { estado: "NO_ENCONTRADO", mensaje: "La cédula no consta en el Registro Civil." };
    }
    if (!respuesta.ok) {
      return {
        estado: "ERROR",
        mensaje: `El Registro Civil respondió con un error (${respuesta.status}).`,
      };
    }

    const cuerpo = (await respuesta.json()) as DatosSnic;
    if (cuerpo.fallecido) {
      return {
        estado: "FALLECIDO",
        mensaje: "El Registro Civil reporta fecha de defunción para esta cédula.",
      };
    }

    return {
      estado: "OK",
      nivel: NIVEL_ACCESO === "DEMOGRAFICO_BIOMETRICO" ? "DEMOGRAFICO_BIOMETRICO" : "DEMOGRAFICO",
      datos: cuerpo,
    };
  } catch (error) {
    const abortado = error instanceof Error && error.name === "AbortError";
    return {
      estado: "ERROR",
      mensaje: abortado
        ? "El Registro Civil no respondió a tiempo. Puede continuar ingresando los datos manualmente."
        : "No se pudo contactar al Registro Civil. Verifique la conexión a la red.",
    };
  } finally {
    clearTimeout(temporizador);
  }
}

/* ------------------------------------------------------------------ */
/* Modo demostración                                                   */
/* ------------------------------------------------------------------ */

/**
 * Devuelve datos ficticios derivados de la propia cédula, únicamente para
 * demostrar el flujo de autocompletado ante la Administración y el Área de
 * Socios antes de contar con el convenio.
 */
async function consultarSimulado(cedula: string): Promise<ResultadoConsulta> {
  await new Promise((resolver) => setTimeout(resolver, 900));

  const anio = 1970 + (Number(cedula.slice(-2)) % 35);
  const mes = String((Number(cedula.slice(2, 4)) % 12) + 1).padStart(2, "0");
  const dia = String((Number(cedula.slice(4, 6)) % 28) + 1).padStart(2, "0");

  return {
    estado: "OK",
    nivel: "DEMOGRAFICO",
    datos: {
      cedula,
      apellidos: "Pérez Andrade",
      nombres: "Juan Carlos",
      fechaNacimiento: `${anio}-${mes}-${dia}`,
      estadoCivil: "CASADO",
      sexo: "HOMBRE",
      nacionalidad: "ECUATORIANA",
      lugarNacimiento: "PICHINCHA / QUITO",
      domicilio: "",
      profesion: "",
      fallecido: false,
    },
  };
}

/* ------------------------------------------------------------------ */
/* API pública                                                         */
/* ------------------------------------------------------------------ */

export async function consultarPorCedula(cedula: string): Promise<ResultadoConsulta> {
  const limpio = cedula.replace(/\D/g, "");

  if (!esCedulaValida(limpio)) {
    return { estado: "ERROR", mensaje: "Ingrese una cédula válida antes de consultar." };
  }

  if (MODO_DEMOSTRACION) return consultarSimulado(limpio);
  if (NIVEL_ACCESO === "NO_DISPONIBLE") {
    return {
      estado: "SIN_CONVENIO",
      mensaje:
        "El autocompletado desde el Registro Civil se habilitará cuando el contrato de adhesión esté vigente.",
    };
  }

  return consultarEnDigercic(limpio);
}
