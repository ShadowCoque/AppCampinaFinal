import {
  cambiosEntre,
  describirCambios,
  puedeCorregirse,
  type CambioDatos,
} from "../../../src/domain/correccion";
import { escaneosEsperados, type TipoDocumento } from "../../../src/domain/documentos";
import {
  AREA_META,
  ESQUEMA_SOLICITUD,
  datosVacios,
  expedienteVacio,
  identidadVacia,
  migrarSolicitud,
  nombreCompleto,
  tramiteVacio,
  type Area,
  type ConfirmacionSafi,
  type ConstanciaTramite,
  type EstadoSolicitud,
  type OficialDependencia,
  type RolAdjunto,
  type SolicitudAfiliacion,
  type TramiteInterno,
} from "../../../src/domain/solicitud";
import { creadoEnSafi, tareasDeSolicitud } from "../../../src/domain/tareas";
import { fuerzaFijaPara } from "../../../src/domain/tiposMiembro";
import { normalizarNumeroSocio } from "../../../src/domain/texto";
import { borrarAdjuntosDe } from "./adjuntos";
import { ahora, db, nuevoId, registrarBitacora } from "./indice";

/**
 * Repositorio de solicitudes de afiliación.
 *
 * El documento completo viaja como JSON: es la misma estructura que produce la
 * aplicación móvil, sin traducción intermedia. Las columnas sueltas replican
 * los campos por los que hace falta consultar u ordenar.
 */

type FilaSolicitud = { documento: string };

/**
 * Lee el documento almacenado y lo pone al día con el esquema vigente, con el
 * mismo código que usa la tableta (`migrarSolicitud`). No reescribe la fila: la
 * normalización se persiste sola la próxima vez que el trámite se guarde.
 */
function aSolicitud(fila: FilaSolicitud): SolicitudAfiliacion {
  const guardada = JSON.parse(fila.documento) as SolicitudAfiliacion;
  return migrarSolicitud(guardada);
}

function guardarDocumento(solicitud: SolicitudAfiliacion): void {
  // La marca la calcula el mismo dominio que dibuja las bandejas, de modo que
  // no puedan discrepar: si genera alguna tarea, la solicitud sigue viva.
  const requiereAtencion = tareasDeSolicitud(solicitud).length > 0 ? 1 : 0;

  db()
    .prepare(
      `INSERT INTO solicitudes
         (id, codigo, estado, numero_socio, ordinal_dependiente, cedula, nombre, tipo_miembro,
          creada_en, actualizada_en, documento, requiere_atencion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         codigo = excluded.codigo,
         estado = excluded.estado,
         numero_socio = excluded.numero_socio,
         ordinal_dependiente = excluded.ordinal_dependiente,
         cedula = excluded.cedula,
         nombre = excluded.nombre,
         tipo_miembro = excluded.tipo_miembro,
         actualizada_en = excluded.actualizada_en,
         documento = excluded.documento,
         requiere_atencion = excluded.requiere_atencion`
    )
    .run(
      solicitud.id,
      solicitud.codigo,
      solicitud.estado,
      solicitud.tramite.numeroSocio || null,
      solicitud.tramite.ordinalDependiente ?? null,
      solicitud.datos.cedula,
      nombreCompleto(solicitud.datos),
      solicitud.datos.tipoMiembro,
      solicitud.creadaEn,
      solicitud.actualizadaEn,
      JSON.stringify(solicitud),
      requiereAtencion
    );
}

export function listarSolicitudes(filtro?: {
  estado?: EstadoSolicitud;
  limite?: number;
}): SolicitudAfiliacion[] {
  const limite = filtro?.limite ?? 500;

  const filas = filtro?.estado
    ? (db()
        .prepare(
          "SELECT documento FROM solicitudes WHERE estado = ? ORDER BY creada_en DESC LIMIT ?"
        )
        .all(filtro.estado, limite) as unknown as FilaSolicitud[])
    : (db()
        .prepare("SELECT documento FROM solicitudes ORDER BY creada_en DESC LIMIT ?")
        .all(limite) as unknown as FilaSolicitud[]);
  return filas.map(aSolicitud);
}

/**
 * Solicitudes que hoy generan alguna tarea.
 *
 * La bandeja se recarga sola cada minuto en tres equipos. Recorrer el histórico
 * completo en cada recarga funciona el primer año y deja de funcionar al
 * quinto; con esta consulta el trabajo depende de lo que está pendiente, no de
 * lo que ya se resolvió.
 */
export function solicitudesConTareas(): SolicitudAfiliacion[] {
  const filas = db()
    .prepare(
      "SELECT documento FROM solicitudes WHERE requiere_atencion = 1 ORDER BY creada_en ASC"
    )
    .all() as unknown as FilaSolicitud[];
  return filas.map(aSolicitud);
}

/** Últimas solicitudes actualizadas, para la lista de tareas ya atendidas. */
export function solicitudesRecientes(limite = 300): SolicitudAfiliacion[] {
  const filas = db()
    .prepare("SELECT documento FROM solicitudes ORDER BY actualizada_en DESC LIMIT ?")
    .all(limite) as unknown as FilaSolicitud[];
  return filas.map(aSolicitud);
}

/**
 * Recalcula la marca de atención y las columnas de consulta de todas las
 * solicitudes. Se ejecuta al arrancar: deja coherente una base recién migrada
 * —las columnas nuevas nacen vacías— o tocada a mano.
 */
export function recalcularAtencion(): number {
  const filas = db().prepare("SELECT documento FROM solicitudes").all() as unknown as FilaSolicitud[];
  const sentencia = db().prepare(
    "UPDATE solicitudes SET requiere_atencion = ?, numero_socio = ?, ordinal_dependiente = ? WHERE id = ?"
  );

  let cambiadas = 0;
  for (const fila of filas) {
    const solicitud = aSolicitud(fila);
    sentencia.run(
      tareasDeSolicitud(solicitud).length > 0 ? 1 : 0,
      solicitud.tramite.numeroSocio || null,
      solicitud.tramite.ordinalDependiente ?? null,
      solicitud.id
    );
    cambiadas += 1;
  }
  return cambiadas;
}

export function obtenerSolicitud(id: string): SolicitudAfiliacion | null {
  const fila = db()
    .prepare("SELECT documento FROM solicitudes WHERE id = ?")
    .get(id) as unknown as FilaSolicitud | undefined;
  return fila ? aSolicitud(fila) : null;
}

/**
 * Por qué un trámite no se puede borrar, o `null` si se puede.
 *
 * Borrar es para los datos de prueba: un trámite que la tableta registró y que
 * nadie llegó a tramitar. En cuanto tiene número de socio, ficha en el CRM o
 * documentos archivados, ya no es un dato de prueba sino un socio del Club, y
 * su salida es la **anulación** desde la bandeja, que deja constancia de quién
 * la decidió y por qué.
 */
export function motivoParaNoBorrar(
  solicitud: SolicitudAfiliacion,
  archivosArchivados: number
): string | null {
  const { tramite, expediente } = solicitud;
  if (tramite.numeroSocio) {
    return `El trámite ya tiene número de socio (${tramite.numeroSocio}).`;
  }
  if (expediente.cuentaSafiId || expediente.socioSafiId) {
    return "El socio ya está creado en el CRM de SAFI.";
  }
  if (solicitud.estado === "APROBADA") return "El trámite ya está aprobado.";
  if (archivosArchivados > 0) {
    return "El trámite ya tiene documentos archivados en el expediente.";
  }
  return null;
}

/**
 * Borra un trámite del servidor: su fila, sus adjuntos y su carpeta.
 *
 * Con él desaparecen sus tareas, así que deja de aparecer en la bandeja: es lo
 * que se espera cuando la tableta borra los datos de prueba. Quien llama
 * comprueba antes `motivoParaNoBorrar`; la constancia queda en la bitácora.
 */
export function borrarSolicitud(id: string): boolean {
  borrarAdjuntosDe(id);
  const resultado = db().prepare("DELETE FROM solicitudes WHERE id = ?").run(id);
  return Number(resultado.changes) > 0;
}

/* ------------------------------------------------------------------ */
/* Búsquedas por número de socio                                       */
/* ------------------------------------------------------------------ */

/*
 * El número de socio es el mismo para toda la familia: la Cuenta de SAFI y la
 * carpeta del expediente son una por titular. Lo que distingue a cada persona
 * es el ordinal (`280` el titular, `280-1`, `280-2` sus dependientes). Buscar
 * solo por número devolvía «el último trámite con ese número», que podía ser el
 * de un dependiente: el vigilante comparaba entonces el nombre del titular con
 * el del hijo y apartaba un documento correcto, y la carpeta del expediente se
 * nombraba con el nombre equivocado. Por eso las búsquedas son por persona.
 *
 * Los trámites anulados no cuentan: su número queda libre.
 */

/** La persona que ocupa `numero` / `numero-ordinal` en el repositorio. */
export function personaEnExpediente(
  numeroSocio: string,
  ordinalDependiente: number | null
): SolicitudAfiliacion | null {
  const numero = normalizarNumeroSocio(numeroSocio);
  if (!numero) return null;

  const fila = (
    ordinalDependiente === null
      ? db()
          .prepare(
            `SELECT documento FROM solicitudes
             WHERE numero_socio = ? AND ordinal_dependiente IS NULL AND estado <> 'RECHAZADA'
             ORDER BY creada_en DESC LIMIT 1`
          )
          .get(numero)
      : db()
          .prepare(
            `SELECT documento FROM solicitudes
             WHERE numero_socio = ? AND ordinal_dependiente = ? AND estado <> 'RECHAZADA'
             ORDER BY creada_en DESC LIMIT 1`
          )
          .get(numero, ordinalDependiente)
  ) as unknown as FilaSolicitud | undefined;

  return fila ? aSolicitud(fila) : null;
}

/** El trámite del socio titular de una cuenta, si se registró por este sistema. */
export function titularPorNumero(numeroSocio: string): SolicitudAfiliacion | null {
  return personaEnExpediente(numeroSocio, null);
}

/** Todos los trámites vigentes de una cuenta: el titular y sus dependientes. */
export function familiaDe(numeroSocio: string): SolicitudAfiliacion[] {
  const numero = normalizarNumeroSocio(numeroSocio);
  if (!numero) return [];
  const filas = db()
    .prepare(
      `SELECT documento FROM solicitudes
       WHERE numero_socio = ? AND estado <> 'RECHAZADA'
       ORDER BY ordinal_dependiente NULLS FIRST, creada_en`
    )
    .all(numero) as unknown as FilaSolicitud[];
  return filas.map(aSolicitud);
}

/** Código legible del trámite: `AF-2026-0007`. */
export function siguienteCodigo(): string {
  const anio = new Date().getFullYear();
  const prefijo = `AF-${anio}-`;
  const fila = db()
    .prepare("SELECT codigo FROM solicitudes WHERE codigo LIKE ? ORDER BY codigo DESC LIMIT 1")
    .get(`${prefijo}%`) as { codigo: string } | undefined;

  const ultimo = fila ? Number(fila.codigo.slice(prefijo.length)) : 0;
  const siguiente = Number.isFinite(ultimo) ? ultimo + 1 : 1;
  return `${prefijo}${String(siguiente).padStart(4, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Registro                                                            */
/* ------------------------------------------------------------------ */

/**
 * Construye la solicitud que se va a almacenar a partir de lo que envió la
 * tableta.
 *
 * De la petición se acepta ÚNICAMENTE lo que el solicitante llenó: sus datos,
 * su consentimiento y la trazabilidad de la identidad. Todo lo demás —el
 * estado, el código del trámite y, sobre todo, las constancias del reverso— lo
 * construye el servidor.
 *
 * El motivo es directo: si se aceptara el `tramite` que manda el cliente, una
 * afiliación podría llegar declarando que Contabilidad ya la revisó y que la
 * Gerencia ya la aprobó, y el formulario se imprimiría con el nombre de esas
 * personas sin que hubieran intervenido. La constancia de quién revisó y quién
 * aprobó es justamente lo que el sistema existe para acreditar.
 *
 * Las rutas de archivo que trae la solicitud son las del almacenamiento de la
 * tableta y aquí no significan nada: se descartan. Las firmas y la fotografía
 * viajan aparte (ver `db/adjuntos.ts`).
 */
function depurarEntrante(
  entrante: SolicitudAfiliacion,
  actor: { nombre: string },
  momento: string
): SolicitudAfiliacion {
  const datos = { ...datosVacios(), ...entrante.datos };
  const hoy = momento.slice(0, 10);

  // En el Socio Activo y el Fundador la fuerza es siempre la Aérea, llegue lo
  // que llegue de la tableta (decisión del Coordinador, 16/09/2026).
  const fuerzaFija = fuerzaFijaPara(datos.tipoMiembro);
  if (fuerzaFija) datos.fuerza = fuerzaFija;

  return {
    id: entrante.id,
    codigo: "",
    esquema: ESQUEMA_SOLICITUD,
    estado: "REGISTRADA",
    creadaEn: entrante.creadaEn || momento,
    actualizadaEn: momento,
    datos: {
      ...datos,
      garantes: datos.garantes.map((g) => ({ ...g, firmaUri: null })),
      fechaIngresoClub: datos.fechaIngresoClub || hoy,
    },
    documentos: (entrante.documentos ?? []).map((d) => ({ ...d, uri: "" })),
    firmaUri: null,
    modoFirma: entrante.modoFirma ?? "MANUSCRITA_EN_PANTALLA",
    identidad: { ...identidadVacia(), ...(entrante.identidad ?? {}), fotoRegistroCivilUri: null },
    consentimiento: entrante.consentimiento ?? null,
    // La constancia de «Registrado» NO se sella aquí. La afiliación llega de la
    // tableta, pero el socio no queda registrado hasta que la Jefatura de
    // Socios lo hace explícitamente en su bandeja —con la cuota, la forma de
    // pago y el grupo de facturación—, y es entonces cuando se firma
    // (`guardarAltaSafi`). Lo corrigió el Coordinador el 15/09/2026.
    tramite: {
      ...tramiteVacio(),
      fechaRegistro: hoy,
    },
    expediente: {
      ...expedienteVacio(),
      escaneosPendientes: escaneosEsperados(datos.tipoMiembro),
    },
    historial: [],
  };
}

export function registrarSolicitud(
  solicitud: SolicitudAfiliacion,
  actor: { usuario: string; area: Area; nombre: string }
): { solicitud: SolicitudAfiliacion; nueva: boolean } {
  // Idempotencia: la tableta reintenta cuando una respuesta se pierde. Si el
  // identificador ya existe, se devuelve lo almacenado en lugar de sobrescribir
  // un expediente que quizá ya fue revisado y aprobado.
  if (solicitud.id) {
    const existente = obtenerSolicitud(solicitud.id);
    if (existente) return { solicitud: existente, nueva: false };
  }

  const momento = ahora();
  const base = depurarEntrante(solicitud, actor, momento);

  const registrada: SolicitudAfiliacion = {
    ...base,
    id: base.id || nuevoId(),
    codigo: siguienteCodigo(),
    historial: [
      {
        en: momento,
        estado: "REGISTRADA",
        area: "SOCIOS",
        responsable: actor.nombre,
        nota: "Afiliación registrada desde la aplicación.",
      },
    ],
  };

  guardarDocumento(registrada);
  registrarBitacora({
    usuario: actor.usuario,
    area: actor.area,
    accion: "REGISTRAR_AFILIACION",
    entidad: registrada.codigo,
    detalle: `${nombreCompleto(registrada.datos)} · ${registrada.datos.cedula}`,
  });

  return { solicitud: registrada, nueva: true };
}

/* ------------------------------------------------------------------ */
/* Avance del trámite: las constancias del reverso                     */
/* ------------------------------------------------------------------ */

export type ResultadoAvance =
  | { ok: true; solicitud: SolicitudAfiliacion }
  | { ok: false; codigo: number; error: string };

type Actor = {
  usuario: string;
  area: Area;
  nombre: string;
  /**
   * Nombre del archivo de firma ya copiado a la carpeta del trámite, si el
   * funcionario tenía firma cargada. Lo resuelve la capa HTTP con
   * `estamparFirma`, para que este módulo no toque el sistema de archivos.
   */
  firmaArchivo?: string | null;
};

function fallo(codigo: number, error: string): ResultadoAvance {
  return { ok: false, codigo, error };
}

/** Guarda el cambio, lo anota en el historial y en la bitácora. */
function aplicar(
  actual: SolicitudAfiliacion,
  cambio: Partial<SolicitudAfiliacion>,
  evento: { estado: EstadoSolicitud; nota?: string; accion: string },
  actor: Actor
): ResultadoAvance {
  const momento = ahora();
  const actualizada: SolicitudAfiliacion = {
    ...actual,
    ...cambio,
    actualizadaEn: momento,
    historial: [
      ...actual.historial,
      {
        en: momento,
        estado: evento.estado,
        area: actor.area,
        responsable: actor.nombre,
        nota: evento.nota || undefined,
      },
    ],
  };

  guardarDocumento(actualizada);
  registrarBitacora({
    usuario: actor.usuario,
    area: actor.area,
    accion: evento.accion,
    entidad: actualizada.codigo,
    detalle: evento.nota || undefined,
  });

  return { ok: true, solicitud: actualizada };
}

function constancia(actor: Actor, observacion: string): ConstanciaTramite {
  return {
    area: actor.area,
    responsable: actor.nombre,
    en: ahora(),
    observacion,
    firmaArchivo: actor.firmaArchivo ?? null,
  };
}

/**
 * Añade la observación de este paso a la lista acumulada del trámite, si trae
 * texto. Todas las observaciones —las de cada constancia y las de las
 * devoluciones— viven en la misma lista, con área, responsable y fecha: es lo
 * que el reverso imprime y lo que ve el área siguiente.
 */
function acumular(tramite: TramiteInterno, nota: ConstanciaTramite): ConstanciaTramite[] {
  const previas = tramite.observaciones ?? [];
  return nota.observacion.trim() ? [...previas, nota] : previas;
}

/**
 * Contabilidad marca REVISADO, con la casilla «FC:» del formulario.
 *
 * Solo sobre lo registrado y ya creado en SAFI: Contabilidad revisa
 * comprobando el ingreso en el CRM, y antes de que exista allí no hay nada que
 * comprobar.
 */
export function revisar(
  id: string,
  entrada: { observacion: string; numeroFactura: string },
  actor: Actor
): ResultadoAvance {
  const actual = obtenerSolicitud(id);
  if (!actual) return fallo(404, "Solicitud no encontrada.");
  if (actual.estado !== "REGISTRADA") {
    return fallo(409, `La solicitud está en estado ${actual.estado}; solo se revisa lo registrado.`);
  }
  if (!creadoEnSafi(actual)) {
    return fallo(
      409,
      "El Área de Socios todavía no ha creado a esta persona en SAFI. Contabilidad la revisa comprobando el ingreso en el CRM, así que primero debe existir allí."
    );
  }

  const nota = constancia(actor, entrada.observacion);
  return aplicar(
    actual,
    {
      estado: "REVISADA",
      tramite: {
        ...actual.tramite,
        revision: { ...nota, numeroFactura: entrada.numeroFactura },
        observaciones: acumular(actual.tramite, nota),
        devolucion: null,
      },
    },
    { estado: "REVISADA", nota: entrada.observacion, accion: "TRAMITE_REVISADA" },
    actor
  );
}

/** La Gerencia marca APROBADO. */
export function aprobar(id: string, entrada: { observacion: string }, actor: Actor): ResultadoAvance {
  const actual = obtenerSolicitud(id);
  if (!actual) return fallo(404, "Solicitud no encontrada.");
  if (actual.estado !== "REVISADA") {
    return fallo(
      409,
      "La Gerencia aprueba con la revisión previa de Contabilidad. Esta solicitud aún no ha sido revisada."
    );
  }

  const nota = constancia(actor, entrada.observacion);
  return aplicar(
    actual,
    {
      estado: "APROBADA",
      tramite: {
        ...actual.tramite,
        aprobacion: nota,
        observaciones: acumular(actual.tramite, nota),
        devolucion: null,
      },
    },
    { estado: "APROBADA", nota: entrada.observacion, accion: "TRAMITE_APROBADA" },
    actor
  );
}

/**
 * Contabilidad o la Gerencia devuelven el trámite al Área de Socios.
 *
 * La devolución se guarda aparte de las constancias: no es una revisión ni una
 * aprobación, y escribirla sobre ellas hacía que el reverso imprimiera
 * «Revisado» con el nombre de quien en realidad había devuelto el trámite.
 */
/**
 * Guarda en el trámite lo que SAFI dijo del oficial FAE del que depende un D-A
 * o D-B, cuando la bandeja lo verificó antes del alta. No es una corrección de
 * la persona, así que no deja entrada en el historial: es el dato con que se
 * compuso su Parentesco.
 */
export function fijarOficialDependencia(
  id: string,
  oficial: OficialDependencia
): SolicitudAfiliacion | null {
  const actual = obtenerSolicitud(id);
  if (!actual) return null;
  const actualizada = { ...actual, datos: { ...actual.datos, oficialDependencia: oficial } };
  guardarDocumento(actualizada);
  return actualizada;
}

/**
 * Corrige los datos de una afiliación ya registrada, desde la tableta.
 *
 * El trámite conserva su código, su estado, sus constancias y su expediente:
 * solo cambian los datos de la persona. Lo que cambió queda en el historial y
 * en la bitácora, campo por campo, con su valor anterior y el nuevo —el socio
 * no vuelve a firmar, así que esa trazabilidad es la que respalda el cambio—.
 *
 * Las reglas de cuándo se puede están en `puedeCorregirse` (dominio), las
 * mismas que usa la tableta para ofrecer el botón. Si el socio ya existe en
 * SAFI, el CRM **no** se toca: el historial dice que hay que corregirlo allá.
 */
export function corregirSolicitud(
  id: string,
  entrante: SolicitudAfiliacion,
  actor: Actor
): ResultadoAvance & { cambios?: CambioDatos[] } {
  const actual = obtenerSolicitud(id);
  if (!actual) return fallo(404, "Solicitud no encontrada.");

  const permiso = puedeCorregirse(actual);
  if (!permiso.permitido) return fallo(409, permiso.motivo);

  const datos = depurarEntrante(entrante, actor, ahora()).datos;
  // La fecha de ingreso al Club es la del registro original, no la de hoy.
  datos.fechaIngresoClub = actual.datos.fechaIngresoClub || datos.fechaIngresoClub;

  if (permiso.yaEnSafi && datos.tipoMiembro !== actual.datos.tipoMiembro) {
    return fallo(
      409,
      "El socio ya está creado en SAFI con su categoría: la Cuenta y el número de socio dependen de ella. Para cambiarla, anule este trámite y registre uno nuevo."
    );
  }

  const cambios = cambiosEntre(actual.datos, datos);

  const consentimientoCambia =
    entrante.consentimiento &&
    JSON.stringify(entrante.consentimiento.valores) !==
      JSON.stringify(actual.consentimiento?.valores ?? null);
  if (consentimientoCambia) {
    cambios.push({
      campo: "consentimiento",
      etiqueta: "Autorizaciones de protección de datos",
      anterior: "modificado",
      nuevo: "modificado",
    });
  }

  // Un reintento de la misma corrección no deja un segundo registro.
  if (cambios.length === 0) return { ok: true, solicitud: actual, cambios };

  const tipoCambia = datos.tipoMiembro !== actual.datos.tipoMiembro;
  const aviso = permiso.yaEnSafi
    ? " La ficha de SAFI no se actualiza sola: corríjala también en el CRM."
    : "";

  const resultado = aplicar(
    actual,
    {
      datos,
      consentimiento: consentimientoCambia ? entrante.consentimiento : actual.consentimiento,
      // Antes del alta todavía no se ha archivado ningún escaneo: si cambió la
      // categoría, lo que se espera escanear es lo de la nueva.
      expediente: tipoCambia
        ? { ...actual.expediente, escaneosPendientes: escaneosEsperados(datos.tipoMiembro) }
        : actual.expediente,
    },
    {
      estado: actual.estado,
      nota: `Datos corregidos desde la tableta. ${describirCambios(cambios)}.${aviso}`,
      accion: "AFILIACION_CORREGIDA",
    },
    actor
  );
  return { ...resultado, cambios };
}

/**
 * Contabilidad o la Gerencia devuelven el trámite con una observación.
 *
 * Contabilidad devuelve siempre al Área de Socios. La Gerencia elige el
 * destino (decisión del Coordinador, 19/09/2026):
 *
 *   · **Al Área de Socios**, si hay que corregir la afiliación. Al reenviarla,
 *     vuelve directo a la Gerencia: la revisión de Contabilidad sigue en pie.
 *   · **A Contabilidad**, si lo que hay que rehacer es la revisión. El trámite
 *     vuelve a su bandeja como pendiente de revisar —la revisión anterior se
 *     deshace, para que el reverso no imprima un REVISADO que ya no vale— y al
 *     marcarlo revisado otra vez, pasa de nuevo a la Gerencia.
 */
export function devolver(
  id: string,
  entrada: { observacion: string; destino?: Area },
  actor: Actor
): ResultadoAvance {
  const actual = obtenerSolicitud(id);
  if (!actual) return fallo(404, "Solicitud no encontrada.");

  const esperado: EstadoSolicitud = actor.area === "CONTABILIDAD" ? "REGISTRADA" : "REVISADA";
  if (actual.estado !== esperado) {
    return fallo(
      409,
      `${AREA_META[actor.area].etiqueta} devuelve trámites en estado ${esperado}; este está en ${actual.estado}.`
    );
  }

  const destino: Area = actor.area === "GERENCIA" ? entrada.destino ?? "SOCIOS" : "SOCIOS";
  if (destino !== "SOCIOS" && destino !== "CONTABILIDAD") {
    return fallo(400, "La Gerencia devuelve al Área de Socios o a Contabilidad.");
  }

  const nota = constancia(actor, entrada.observacion);

  if (destino === "CONTABILIDAD") {
    return aplicar(
      actual,
      {
        estado: "REGISTRADA",
        tramite: {
          ...actual.tramite,
          revision: null,
          devolucion: {
            ...nota,
            destino,
            numeroFacturaAnterior: actual.tramite.revision?.numeroFactura ?? "",
          },
          observaciones: acumular(actual.tramite, nota),
        },
      },
      {
        estado: "REGISTRADA",
        nota: `Devuelto a Contabilidad: ${entrada.observacion}`,
        accion: "TRAMITE_DEVUELTO_A_CONTABILIDAD",
      },
      actor
    );
  }

  return aplicar(
    actual,
    {
      estado: "OBSERVADA",
      tramite: {
        ...actual.tramite,
        devolucion: { ...nota, destino },
        observaciones: acumular(actual.tramite, nota),
      },
    },
    {
      estado: "OBSERVADA",
      nota: `Devuelto al Área de Socios: ${entrada.observacion}`,
      accion: "TRAMITE_OBSERVADA",
    },
    actor
  );
}

/**
 * El Área de Socios atiende la observación y reenvía el trámite a quien lo
 * devolvió: a Contabilidad si fue ella, a la Gerencia si fue la Gerencia —la
 * revisión de Contabilidad sigue en pie—.
 */
export function reenviar(id: string, entrada: { observacion: string }, actor: Actor): ResultadoAvance {
  const actual = obtenerSolicitud(id);
  if (!actual) return fallo(404, "Solicitud no encontrada.");
  if (actual.estado !== "OBSERVADA") {
    return fallo(409, "Solo se reenvía un trámite devuelto con observaciones.");
  }

  const deGerencia = actual.tramite.devolucion?.area === "GERENCIA" && actual.tramite.revision;
  const destino: EstadoSolicitud = deGerencia ? "REVISADA" : "REGISTRADA";
  const nota = constancia(actor, entrada.observacion);

  return aplicar(
    actual,
    {
      estado: destino,
      tramite: {
        ...actual.tramite,
        devolucion: null,
        observaciones: acumular(actual.tramite, nota),
      },
    },
    {
      estado: destino,
      nota: `Reenviado a ${deGerencia ? "la Gerencia" : "Contabilidad"}: ${entrada.observacion}`,
      accion: "TRAMITE_REENVIADO",
    },
    actor
  );
}

/**
 * El Área de Socios anula un trámite que no procede: duplicado, registrado con
 * un error que no admite corrección, o desistido. El número de socio y el
 * ordinal quedan libres.
 *
 * Un trámite aprobado no se anula: es un socio del Club, y su baja es otro
 * procedimiento.
 */
export function anular(id: string, entrada: { observacion: string }, actor: Actor): ResultadoAvance {
  const actual = obtenerSolicitud(id);
  if (!actual) return fallo(404, "Solicitud no encontrada.");
  if (actual.estado === "APROBADA") {
    return fallo(409, "Un ingreso ya aprobado no se anula desde aquí: la baja de un socio es otro trámite.");
  }
  if (actual.estado === "RECHAZADA") return fallo(409, "El trámite ya estaba anulado.");

  const aviso = creadoEnSafi(actual)
    ? " La ficha ya existe en SAFI: desactívela allá, el sistema no borra nada del CRM."
    : "";

  return aplicar(
    actual,
    {
      estado: "RECHAZADA",
      tramite: {
        ...actual.tramite,
        devolucion: null,
        anulacion: constancia(actor, entrada.observacion),
      },
    },
    { estado: "RECHAZADA", nota: `${entrada.observacion}${aviso}`, accion: "TRAMITE_ANULADO" },
    actor
  );
}

/** «Número de tarjeta» del reverso: el de la credencial impresa por Card Five. */
export function registrarTarjeta(id: string, numeroTarjeta: string, actor: Actor): ResultadoAvance {
  const actual = obtenerSolicitud(id);
  if (!actual) return fallo(404, "Solicitud no encontrada.");

  return aplicar(
    actual,
    { tramite: { ...actual.tramite, numeroTarjeta } },
    { estado: actual.estado, nota: `Número de tarjeta: ${numeroTarjeta || "(vacío)"}`, accion: "TRAMITE_TARJETA" },
    actor
  );
}

/* ------------------------------------------------------------------ */
/* Alta en SAFI                                                        */
/* ------------------------------------------------------------------ */

/**
 * Guarda lo que la Jefatura de Socios confirmó y el resultado del alta en SAFI.
 *
 * Va en una sola escritura porque los datos son inseparables: el número de
 * socio da nombre a la carpeta del expediente, la confirmación deja constancia
 * de qué valores se acordaron, y los identificadores de SAFI son los que
 * permiten colgar después los documentos de la Cuenta correcta.
 *
 * El identificador de la Cuenta se guarda aunque el alta haya fallado después
 * de crearla: así el reintento la reutiliza en lugar de crear una segunda
 * Cuenta para el mismo socio.
 */
export function guardarAltaSafi(
  id: string,
  alta: {
    numeroSocio: string;
    ordinalDependiente: number | null;
    confirmacion: ConfirmacionSafi;
    cuentaSafiId?: string | null;
    socioSafiId?: string | null;
    mensaje?: string;
    /** Observación que la Jefatura escribe al registrar, opcional. */
    observacion?: string;
  },
  actor: Actor
): SolicitudAfiliacion | null {
  const actual = obtenerSolicitud(id);
  if (!actual) return null;

  const momento = ahora();

  // Aquí —y no cuando la tableta envía la afiliación— queda REGISTRADO el
  // socio: es el momento en que la Jefatura confirma la cuota, la forma de pago
  // y el grupo de facturación, y firma esa constancia.
  const registro: ConstanciaTramite = actual.tramite.registro ?? {
    area: "SOCIOS",
    responsable: actor.nombre,
    en: momento,
    observacion: (alta.observacion ?? "").trim(),
    firmaArchivo: actor.firmaArchivo ?? null,
  };

  const nota: ConstanciaTramite = {
    area: "SOCIOS",
    responsable: actor.nombre,
    en: momento,
    observacion: (alta.observacion ?? "").trim(),
    firmaArchivo: actor.firmaArchivo ?? null,
  };

  const actualizada: SolicitudAfiliacion = {
    ...actual,
    actualizadaEn: momento,
    tramite: {
      ...actual.tramite,
      numeroSocio: normalizarNumeroSocio(alta.numeroSocio),
      ordinalDependiente: alta.ordinalDependiente,
      registro,
      observaciones: acumular(actual.tramite, nota),
    },
    expediente: {
      ...actual.expediente,
      confirmacionSafi: alta.confirmacion,
      cuentaSafiId: alta.cuentaSafiId ?? actual.expediente.cuentaSafiId ?? null,
      socioSafiId: alta.socioSafiId ?? actual.expediente.socioSafiId ?? null,
      altaSafiMensaje: alta.mensaje,
    },
    historial: [
      ...actual.historial,
      {
        en: momento,
        estado: actual.estado,
        area: "SOCIOS",
        responsable: alta.confirmacion.confirmadaPor,
        nota: alta.socioSafiId
          ? `Socio en SAFI (Cuenta ${alta.cuentaSafiId ?? actual.expediente.cuentaSafiId}, Socio ${alta.socioSafiId}).`
          : alta.mensaje ?? "Datos de SAFI confirmados.",
      },
    ],
  };

  guardarDocumento(actualizada);
  registrarBitacora({
    usuario: actor.usuario,
    area: actor.area,
    accion: alta.socioSafiId ? "SAFI_ALTA_CREADA" : "SAFI_ALTA_CONFIRMADA",
    entidad: actualizada.codigo,
    detalle: alta.socioSafiId
      ? `Cuenta ${alta.cuentaSafiId ?? "—"} · Socio ${alta.socioSafiId}`
      : alta.mensaje,
  });

  return actualizada;
}

/**
 * Cuenta de SAFI del socio titular al que se cuelga un dependiente, si el
 * titular se dio de alta por este sistema. Para los titulares antiguos la
 * busca el adaptador en el propio CRM.
 */
export function cuentaSafiDelTitular(numeroSocioTitular: string): string | null {
  for (const persona of familiaDe(numeroSocioTitular)) {
    if (persona.expediente.cuentaSafiId) return persona.expediente.cuentaSafiId;
  }
  return null;
}

/**
 * Siguiente ordinal libre dentro de la cuenta de un titular, según lo
 * registrado en este sistema. El titular es siempre el `00`, así que sus
 * dependientes empiezan en 1. El adaptador de SAFI lo contrasta además con las
 * fichas que ya existen en el CRM, que para una familia antigua son la mayoría.
 */
export function siguienteOrdinalDependiente(numeroSocioTitular: string): number {
  const usados = familiaDe(numeroSocioTitular)
    .map((persona) => persona.tramite.ordinalDependiente)
    .filter((ordinal): ordinal is number => typeof ordinal === "number");

  return usados.length === 0 ? 1 : Math.max(...usados) + 1;
}

/* ------------------------------------------------------------------ */
/* Expediente                                                          */
/* ------------------------------------------------------------------ */

/** Actualiza el estado del expediente tras archivar o publicar documentos. */
export function actualizarExpediente(
  id: string,
  cambios: Partial<SolicitudAfiliacion["expediente"]>
): SolicitudAfiliacion | null {
  const actual = obtenerSolicitud(id);
  if (!actual) return null;

  const actualizada: SolicitudAfiliacion = {
    ...actual,
    actualizadaEn: ahora(),
    expediente: { ...actual.expediente, ...cambios },
  };

  guardarDocumento(actualizada);
  return actualizada;
}

/** Refleja en el expediente qué firmas y fotografía tiene ya el servidor. */
export function registrarAdjuntosRecibidos(
  id: string,
  recibidos: RolAdjunto[]
): SolicitudAfiliacion | null {
  const actual = obtenerSolicitud(id);
  if (!actual) return null;

  const previos = [...(actual.expediente.adjuntosRecibidos ?? [])].sort().join(",");
  const nuevos = [...recibidos].sort().join(",");
  if (previos === nuevos) return actual;

  return actualizarExpediente(id, { adjuntosRecibidos: recibidos });
}

/**
 * Descuenta de la lista de escaneos pendientes el documento que acaba de
 * llegar a la carpeta compartida.
 */
export function marcarEscaneoRecibido(
  solicitudId: string,
  tipo: TipoDocumento
): SolicitudAfiliacion | null {
  const actual = obtenerSolicitud(solicitudId);
  if (!actual) return null;

  const pendientes = actual.expediente.escaneosPendientes.filter((t) => t !== tipo);
  if (pendientes.length === actual.expediente.escaneosPendientes.length) return actual;

  return actualizarExpediente(solicitudId, { escaneosPendientes: pendientes });
}

/**
 * Declara que una firma o la fotografía ya no llegarán de la tableta.
 *
 * Sin esto, un trámite cuya tableta perdió la captura se quedaba reclamando un
 * archivo que nadie podía entregar: la tarea de la bandeja no tenía salida. La
 * justificación queda en el expediente y en la bitácora, de modo que se sabe
 * quién decidió continuar y por qué.
 */
export function omitirAdjunto(
  solicitudId: string,
  rol: RolAdjunto,
  omision: { motivo: string; responsable: string }
): SolicitudAfiliacion | null {
  const actual = obtenerSolicitud(solicitudId);
  if (!actual) return null;

  const previas = actual.expediente.adjuntosOmitidos ?? [];
  if (previas.some((o) => o.rol === rol)) return actual;

  return actualizarExpediente(solicitudId, {
    adjuntosOmitidos: [
      ...previas,
      { rol, motivo: omision.motivo, responsable: omision.responsable, en: ahora() },
    ],
  });
}

/**
 * Declara que un documento por escanear no aplica a este trámite.
 *
 * Descuenta el documento de lo pendiente y conserva la justificación: el
 * expediente debe poder explicar por qué se cerró sin él.
 */
export function omitirEscaneo(
  solicitudId: string,
  tipo: TipoDocumento,
  omision: { motivo: string; responsable: string }
): SolicitudAfiliacion | null {
  const actual = obtenerSolicitud(solicitudId);
  if (!actual) return null;

  const previas = actual.expediente.escaneosOmitidos ?? [];
  if (previas.some((o) => o.tipo === tipo)) return actual;

  return actualizarExpediente(solicitudId, {
    escaneosPendientes: actual.expediente.escaneosPendientes.filter((t) => t !== tipo),
    escaneosOmitidos: [
      ...previas,
      { tipo, motivo: omision.motivo, responsable: omision.responsable, en: ahora() },
    ],
  });
}
