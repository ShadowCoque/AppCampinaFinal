/**
 * Corrección de una afiliación ya registrada, desde la tableta.
 *
 * Nació de la prueba del 19/09/2026: la bandeja detectó que la cédula de un
 * Socio Fundador recién registrado ya pertenecía a otro socio del CRM, y la
 * única salida era anular el trámite y volver a capturarlo entero para
 * cambiar diez dígitos. Ahora el Área de Socios corrige en la tableta, en el
 * mismo asistente con que lo registró, y el trámite sigue con su código.
 *
 * Reglas (decisión del Coordinador, 19/09/2026):
 *
 *   · Se corrige libremente **mientras no exista en SAFI**.
 *   · Si ya existe en SAFI, solo cuando se lo **devuelven al Área de Socios**
 *     con una observación, y con aviso: la ficha del CRM hay que corregirla a
 *     mano, el sistema no la toca. La categoría ya no se cambia: la Cuenta y el
 *     número de socio dependen de ella.
 *   · El socio **no vuelve a firmar**. Queda la trazabilidad: cada campo
 *     cambiado, con su valor anterior y el nuevo, quién y cuándo.
 */

import { nombreTipo } from "./tiposMiembro";
import {
  destinoDevolucion,
  type DatosAfiliacion,
  type SolicitudAfiliacion,
} from "./solicitud";

export type PermisoCorreccion =
  | {
      permitido: true;
      /** Ya existe en SAFI: lo corregido hay que corregirlo también en el CRM. */
      yaEnSafi: boolean;
    }
  | { permitido: false; motivo: string };

/** Si una afiliación admite corrección ahora, y con qué condiciones. */
export function puedeCorregirse(solicitud: SolicitudAfiliacion): PermisoCorreccion {
  const { estado, tramite, expediente } = solicitud;
  const enSafi = Boolean(expediente.socioSafiId);

  if (estado === "RECHAZADA") return { permitido: false, motivo: "El trámite está anulado." };
  if (estado === "APROBADA") {
    return {
      permitido: false,
      motivo:
        "El ingreso ya está aprobado. Los cambios de un socio del Club se registran por «Actualización de datos».",
    };
  }
  if (!enSafi) return { permitido: true, yaEnSafi: false };
  if (estado === "OBSERVADA" && destinoDevolucion(tramite.devolucion) === "SOCIOS") {
    return { permitido: true, yaEnSafi: true };
  }
  return {
    permitido: false,
    motivo:
      "El socio ya está creado en SAFI y el trámite sigue su curso en Contabilidad o en la Gerencia. Solo se corrige si lo devuelven al Área de Socios con una observación.",
  };
}

/** Un campo que cambió, para el historial del trámite y la bitácora. */
export type CambioDatos = {
  campo: string;
  etiqueta: string;
  anterior: string;
  nuevo: string;
};

const ETIQUETAS: Partial<Record<keyof DatosAfiliacion, string>> = {
  tipoMiembro: "Tipo de socio",
  titularApellidos: "Apellidos del socio titular",
  titularNombres: "Nombres del socio titular",
  titularCedula: "Cédula del socio titular",
  titularNumeroSocio: "Número de socio del titular",
  titularGradoMilitar: "Grado del socio titular",
  titularSituacion: "Situación del socio titular",
  numeroSocioActivo: "Número de socio del que depende",
  oficialDependencia: "Socio del que depende",
  numeroOficialFae: "Número de socio del oficial FAE (abuelo)",
  oficialFaeVerificado: "Oficial FAE del que desciende",
  apellidos: "Apellidos",
  nombres: "Nombres",
  cedula: "Cédula",
  sexo: "Sexo",
  lugarNacimiento: "Lugar de nacimiento",
  fechaNacimiento: "Fecha de nacimiento",
  estadoCivil: "Estado civil",
  tipoSangre: "Tipo de sangre",
  pais: "País",
  provincia: "Provincia",
  ciudad: "Ciudad",
  direccion: "Dirección",
  celular: "Celular",
  telefonoDomicilio: "Teléfono de domicilio",
  telefonoTrabajo: "Teléfono de trabajo",
  correo: "Correo",
  profesion: "Profesión",
  lugarTrabajo: "Lugar de trabajo",
  cargo: "Cargo",
  hobbie: "Hobbie",
  gradoMilitar: "Grado militar",
  promocion: "Promoción",
  situacion: "Situación militar",
  fuerza: "Fuerza",
  fechaIngresoClub: "Fecha de ingreso al Club",
  conyuge: "Datos del cónyuge",
  hijos: "Hijos",
  garantes: "Socios garantes",
  carta: "Carta de compromiso",
};

/**
 * Campos que no se comparan: los decide el sistema, no quien corrige. La
 * verificación del titular en SAFI acompaña a su número, que sí se compara.
 */
const IGNORADOS = new Set<keyof DatosAfiliacion>([
  "vinculoConTitular",
  "formaPago",
  "valorAfiliacion",
  "titularVerificado",
]);

/**
 * Para comparar un bloque compuesto, lo que no es un dato de la persona se
 * quita: las rutas de las firmas son del dispositivo, la fecha en que se
 * consultó al oficial cambia cada vez que se consulta, y lo que SAFI dijo de
 * un garante acompaña a su número.
 */
function comparable(campo: keyof DatosAfiliacion, valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor !== "object") return String(valor);
  if (campo === "oficialDependencia" || campo === "oficialFaeVerificado") {
    // Quién es, no cuándo ni cómo se consultó: una segunda consulta del mismo
    // socio no es una corrección.
    const socio = valor as NonNullable<DatosAfiliacion["oficialDependencia"]>;
    return JSON.stringify([
      socio.numeroSocio,
      socio.gradoMilitar,
      socio.nombres,
      socio.apellidos,
      socio.tipoSocioSafi,
    ]);
  }
  return JSON.stringify(valor, (clave, dato) => {
    if (clave === "firmaUri" || clave === "aceptadaEn") return undefined;
    if (campo === "garantes" && clave === "verificacion") return undefined;
    return dato;
  });
}

function legible(campo: keyof DatosAfiliacion, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (campo === "tipoMiembro") return nombreTipo(valor as DatosAfiliacion["tipoMiembro"]);
  if (typeof valor !== "object") return String(valor);
  if (campo === "oficialDependencia" || campo === "oficialFaeVerificado") {
    const oficial = valor as NonNullable<DatosAfiliacion["oficialDependencia"]>;
    return [oficial.gradoMilitar, oficial.nombres, oficial.apellidos].join(" ").trim() || "—";
  }
  if (Array.isArray(valor)) return `${valor.length} registrado${valor.length === 1 ? "" : "s"}`;
  return "modificado";
}

/** Lo que cambió entre dos versiones de los datos de una afiliación. */
export function cambiosEntre(antes: DatosAfiliacion, despues: DatosAfiliacion): CambioDatos[] {
  const campos = new Set([...Object.keys(antes), ...Object.keys(despues)]) as Set<
    keyof DatosAfiliacion
  >;
  const cambios: CambioDatos[] = [];
  for (const campo of campos) {
    if (IGNORADOS.has(campo)) continue;
    if (comparable(campo, antes[campo]) === comparable(campo, despues[campo])) continue;
    cambios.push({
      campo,
      etiqueta: ETIQUETAS[campo] ?? campo,
      anterior: legible(campo, antes[campo]),
      nuevo: legible(campo, despues[campo]),
    });
  }
  return cambios;
}

/** «Cédula: 1712345678 → 1798765432; Dirección: … → …». */
export function describirCambios(cambios: CambioDatos[]): string {
  return cambios
    .map((cambio) =>
      cambio.anterior === "modificado" || cambio.nuevo === "modificado"
        ? `${cambio.etiqueta}: modificado`
        : `${cambio.etiqueta}: ${cambio.anterior} → ${cambio.nuevo}`
    )
    .join("; ");
}
