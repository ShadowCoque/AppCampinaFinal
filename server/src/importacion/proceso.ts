import { createHash } from "node:crypto";

import { nombreCompleto, tramiteVacio, expedienteVacio, identidadVacia, ESQUEMA_SOLICITUD, type SolicitudAfiliacion } from "../../../src/domain/solicitud";
import { ahora, registrarBitacora } from "../db/indice";
import type { Usuario } from "../db/usuarios";
import { adaptadorSafi, type ConsultaLote, type FichaDeLote } from "../safi/adaptador";
import { avisosDeConfirmacion, faltantesDeConfirmacion } from "../safi/registro";
import { COLUMNAS, type ClaveColumna } from "./columnas";
import { ErrorImportacion, escribirLibro, leerLibro, type FilaResultado } from "./excel";
import { catalogosDe, hoyEcuador, interpretarFila, listasDePlantilla, type Catalogos } from "./filas";
import {
  crearLote,
  guardarLote,
  loteConHuella,
  lotesEnCurso,
  numerosEnTramites,
  obtenerLote,
  tramitesConCedulas,
  type FilaImportacion,
  type LoteImportacion,
  type MensajeLote,
} from "./lotes";

/**
 * La importación de socios oficiales, de principio a fin.
 *
 *   1. **Revisar** (`revisarArchivo`): se lee el Excel, se interpreta cada fila
 *      con los criterios de la tableta, se consulta SAFI en bloque —cédulas y
 *      números, solo lectura— y se asignan los números que falten. No se crea
 *      nada. El resultado es un lote que la Jefatura ve fila por fila.
 *   2. **Crear** (`iniciarCreacion`): las filas listas se crean en SAFI una por
 *      una, con la misma alta que el panel de la bandeja (Cuenta y ficha, y la
 *      ficha automática de SAFI completada en lugar de duplicada). Antes de
 *      cada una se vuelve a comprobar en SAFI que el número y la cédula sigan
 *      libres. Al primer fallo el lote se detiene: con un CRM de producción es
 *      preferible parar y mirar que seguir acumulando el mismo error.
 *
 * Un lote detenido se retoma con «Volver a comprobar» y «Crear»: las filas ya
 * creadas no se tocan.
 */

/* ------------------------------------------------------------------ */
/* Revisión                                                            */
/* ------------------------------------------------------------------ */

function normalizarDesde(valor: string | undefined | null): string {
  const limpio = String(valor ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return limpio && Number(limpio) > 0 && limpio.length <= 6 ? limpio : "";
}

/** Descripción de una ficha de SAFI para los mensajes: número, tipo y estado. */
function describirFicha(ficha: FichaDeLote): string {
  const partes = [
    `N.º ${ficha.numero || "—"}${ficha.secuencia && ficha.secuencia !== "00" ? `, secuencia ${ficha.secuencia}` : ""}`,
    ficha.tipoSocio || "sin tipo",
    ficha.estado ? `estado ${ficha.estado}` : "",
    ficha.nombre,
  ].filter(Boolean);
  return partes.join(" · ");
}

/**
 * Interpreta y comprueba todas las filas que no se han creado todavía. La usan
 * la revisión de un archivo nuevo y «Volver a comprobar».
 */
async function comprobarFilas(lote: LoteImportacion): Promise<void> {
  const adaptador = adaptadorSafi();
  const listas = await adaptador.listas().catch(() => null);
  const catalogos: Catalogos = catalogosDe(listas);
  const mensajes: MensajeLote[] = [];

  if (!catalogos.enVivo) {
    mensajes.push({
      tono: "aviso",
      texto:
        "No se pudieron leer las listas del CRM: los valores se comprobaron contra el catálogo guardado en el sistema.",
    });
  }

  // Las filas ya creadas (o creándose) no se vuelven a interpretar.
  const pendientes = lote.filas.filter((fila) => fila.estado !== "CREADA" && fila.estado !== "EN_CURSO");
  const creadas = lote.filas.filter((fila) => fila.estado === "CREADA" || fila.estado === "EN_CURSO");

  for (const fila of pendientes) {
    const interpretada = interpretarFila({ fila: fila.fila, celdas: fila.celdas }, catalogos);
    fila.datos = interpretada.datos;
    fila.confirmacion = interpretada.confirmacion;
    fila.comunicaciones = interpretada.comunicaciones;
    fila.errores = interpretada.errores;
    fila.avisos = interpretada.avisos;
    fila.numero = interpretada.numeroDelArchivo;
    fila.numeroAsignado = false;
  }

  /* --- Repetidos dentro del archivo --------------------------------- */

  const porCedula = new Map<string, number[]>();
  const porNumero = new Map<string, number[]>();
  const porCorreo = new Map<string, number[]>();
  for (const fila of lote.filas) {
    if (fila.datos.cedula.length === 10) porCedula.set(fila.datos.cedula, [...(porCedula.get(fila.datos.cedula) ?? []), fila.fila]);
    if (fila.numero) porNumero.set(fila.numero, [...(porNumero.get(fila.numero) ?? []), fila.fila]);
    if (fila.datos.correo) porCorreo.set(fila.datos.correo, [...(porCorreo.get(fila.datos.correo) ?? []), fila.fila]);
  }
  const otras = (lista: number[], propia: number) => lista.filter((n) => n !== propia).join(", ");
  for (const fila of pendientes) {
    const conCedula = porCedula.get(fila.datos.cedula) ?? [];
    if (conCedula.length > 1) {
      fila.errores.push({ columna: "cedula", texto: `La misma cédula está también en la fila ${otras(conCedula, fila.fila)}.` });
    }
    const conNumero = fila.numero ? porNumero.get(fila.numero) ?? [] : [];
    if (conNumero.length > 1) {
      fila.errores.push({ columna: "numeroSocio", texto: `El número ${fila.numero} está también en la fila ${otras(conNumero, fila.fila)}.` });
    }
    const conCorreo = porCorreo.get(fila.datos.correo) ?? [];
    if (conCorreo.length > 1) {
      fila.avisos.push({ columna: "correo", texto: `El mismo correo está también en la fila ${otras(conCorreo, fila.fila)}.` });
    }
  }

  /* --- Trámites de la tableta con la misma cédula ------------------- */

  const tramites = tramitesConCedulas(pendientes.map((fila) => fila.datos.cedula));
  for (const fila of pendientes) {
    const tramite = tramites.get(fila.datos.cedula);
    if (tramite) {
      fila.errores.push({
        columna: "cedula",
        texto: `Esta persona ya tiene el trámite ${tramite.codigo} (${tramite.estado.toLowerCase()}) en el sistema: siga con él en la bandeja en lugar de importarla.`,
      });
    }
  }

  /* --- Coherencia con el catálogo de SAFI --------------------------- */

  for (const fila of pendientes) {
    const solicitud = solicitudDeFila(lote, fila);
    for (const faltante of faltantesDeConfirmacion(solicitud, fila.confirmacion)) {
      // Lo que falta ya se dijo, con su columna, al interpretar la fila.
      if (!fila.errores.length) fila.errores.push({ texto: `Falta ${faltante}.` });
    }
    for (const aviso of avisosDeConfirmacion(solicitud, fila.confirmacion, listas ?? undefined)) {
      (aviso.bloquea ? fila.errores : fila.avisos).push({ texto: aviso.mensaje });
    }
  }

  /* --- SAFI: cédulas y números que ya existen ----------------------- */

  const numerosDelArchivo = pendientes.map((fila) => fila.numero).filter(Boolean);
  const consulta: ConsultaLote = await adaptador.consultarLote({
    numeros: numerosDelArchivo,
    cedulas: pendientes.map((fila) => fila.datos.cedula),
  });

  if (consulta.consultado) {
    for (const fila of pendientes) {
      const cedula = fila.datos.cedula;
      for (const ficha of consulta.fichas.filter((f) => f.cedula === cedula && cedula)) {
        const automatica = ficha.tipoSocio === "Complete Aqui" && ["", "0", "00"].includes(ficha.numero);
        fila.errores.push({
          columna: "cedula",
          texto: automatica
            ? `SAFI tiene con esta cédula una ficha «Complete Aqui» sin completar (${ficha.id.split("x").pop()}), la que el CRM crea solo con cada Cuenta. Complétela o bórrela en SAFI antes de importar.`
            : `Ya consta en SAFI: ${describirFicha(ficha)}. Si pasa a ser Socio Activo, es un cambio de categoría y se hace en SAFI.`,
        });
      }
      for (const cuenta of consulta.cuentas.filter((c) => c.cedula === cedula && cedula)) {
        fila.errores.push({
          columna: "cedula",
          texto: `SAFI ya tiene una Cuenta con esta cédula: «${cuenta.nombre}» (${cuenta.id.split("x").pop()}).`,
        });
      }
      if (fila.numero) {
        const ocupado = consulta.fichas.filter((f) => f.numero === fila.numero);
        if (ocupado.length > 0) {
          fila.errores.push({
            columna: "numeroSocio",
            texto: `El número ${fila.numero} ya está ocupado en SAFI: ${ocupado.map(describirFicha).join(" | ")}.`,
          });
        }
      }
    }
  } else {
    mensajes.push({
      tono: "aviso",
      texto: `No se pudo consultar SAFI (${consulta.motivo.replace(/\.$/, "")}). Las cédulas y los números se comprobarán fila por fila al crear.`,
    });
  }

  const enTramites = numerosEnTramites(numerosDelArchivo);
  for (const fila of pendientes) {
    if (fila.numero && enTramites.has(fila.numero)) {
      fila.errores.push({ columna: "numeroSocio", texto: `El número ${fila.numero} ya lo tiene un trámite del sistema.` });
    }
  }

  /* --- Números para las filas que no traen el suyo ------------------ */

  const sinNumero = pendientes.filter((fila) => !fila.numero && fila.errores.length === 0);
  if (sinNumero.length > 0) {
    if (!lote.numerarDesde) {
      for (const fila of sinNumero) {
        fila.errores.push({
          columna: "numeroSocio",
          texto: "Sin número de socio: escríbalo en el archivo o indique desde qué número asignar.",
        });
      }
    } else {
      const reservados = new Set<string>([
        ...lote.filas.map((fila) => fila.numero).filter(Boolean),
        ...creadas.map((fila) => fila.numero),
      ]);
      const libres = await numerosLibres(lote.numerarDesde, sinNumero.length, reservados);
      if (libres.motivo) {
        mensajes.push({ tono: "aviso", texto: libres.motivo });
      }
      sinNumero.forEach((fila, i) => {
        const numero = libres.numeros[i];
        if (numero) {
          fila.numero = numero;
          fila.numeroAsignado = true;
        } else {
          fila.errores.push({ columna: "numeroSocio", texto: "No se encontró un número libre para esta fila." });
        }
      });
      const saltados = libres.saltados.length;
      if (saltados > 0) {
        mensajes.push({
          tono: "info",
          texto: `Al numerar desde el ${lote.numerarDesde} se saltaron ${saltados} número(s) ya ocupados: ${libres.saltados.slice(0, 15).join(", ")}${saltados > 15 ? "…" : ""}.`,
        });
      }
    }
  }

  for (const fila of pendientes) {
    fila.estado = fila.errores.length > 0 ? "ERROR" : "LISTA";
    delete fila.resultado?.mensaje;
  }

  lote.consultadoEnSafi = consulta.consultado;
  lote.revisadoEn = ahora();
  lote.mensajes = [...lote.mensajes.filter((m) => m.tono === "info" && m.texto.startsWith("Se ignoró")), ...mensajes];
}

/**
 * Números libres a partir de `desde`, saltando los del propio archivo, los de
 * trámites del sistema y los que SAFI ya tiene. Se consulta SAFI por tandas,
 * nunca el padrón entero: recorrerlo tarda más de un minuto.
 */
async function numerosLibres(
  desde: string,
  cuantos: number,
  reservados: Set<string>
): Promise<{ numeros: string[]; saltados: string[]; motivo?: string }> {
  const adaptador = adaptadorSafi();
  const numeros: string[] = [];
  const saltados: string[] = [];
  let siguiente = Number(desde);
  const tope = siguiente + Math.max(200, cuantos * 4);

  while (numeros.length < cuantos && siguiente < tope) {
    const ventana: string[] = [];
    for (let n = siguiente; ventana.length < cuantos - numeros.length + 10 && n < tope; n += 1) ventana.push(String(n));
    siguiente = Number(ventana[ventana.length - 1]) + 1;

    const consulta = await adaptador.consultarLote({ numeros: ventana, cedulas: [] });
    const enSafi = new Set(consulta.consultado ? consulta.fichas.map((f) => f.numero) : []);
    const enTramites = numerosEnTramites(ventana);
    for (const numero of ventana) {
      if (numeros.length >= cuantos) break;
      if (reservados.has(numero) || enSafi.has(numero) || enTramites.has(numero)) {
        saltados.push(numero);
        continue;
      }
      numeros.push(numero);
    }
    if (!consulta.consultado) {
      return {
        numeros,
        saltados,
        motivo: `Los números se asignaron sin poder comprobarlos en SAFI (${consulta.motivo.replace(/\.$/, "")}): se comprobarán al crear cada fila.`,
      };
    }
  }
  return { numeros, saltados };
}

/** Revisa un archivo subido y guarda el lote. No crea nada en SAFI. */
export async function revisarArchivo(entrada: {
  contenido: Buffer;
  nombreArchivo: string;
  numerarDesde: string;
  usuario: Usuario;
}): Promise<LoteImportacion> {
  const libro = await leerLibro(entrada.contenido);
  const huella = createHash("sha256").update(entrada.contenido).digest("hex");

  const mensajes: MensajeLote[] = [];
  if (libro.ignoradas.length > 0) {
    mensajes.push({
      tono: "info",
      texto: `Se ignoró ${libro.ignoradas.length === 1 ? "la columna" : "las columnas"} ${libro.ignoradas
        .map((t) => `«${t}»`)
        .join(", ")}: no son de la plantilla.`,
    });
  }

  const previo = loteConHuella(huella);

  const filas: FilaImportacion[] = libro.filas.map((leida) => ({
    fila: leida.fila,
    celdas: leida.celdas,
    estado: "ERROR",
    numero: "",
    numeroAsignado: false,
    // Se completan en `comprobarFilas`.
    datos: undefined as never,
    confirmacion: undefined as never,
    comunicaciones: false,
    errores: [],
    avisos: [],
  }));

  const borrador: LoteImportacion = {
    id: "",
    codigo: "",
    estado: "REVISADO",
    archivo: { nombre: entrada.nombreArchivo, bytes: entrada.contenido.length, huella, hoja: libro.hoja },
    creadaEn: "",
    creadaPor: { usuario: entrada.usuario.usuario, nombre: entrada.usuario.nombre },
    actualizadaEn: "",
    numerarDesde: normalizarDesde(entrada.numerarDesde),
    consultadoEnSafi: false,
    revisadoEn: "",
    mensajes,
    filas,
  };
  await comprobarFilas(borrador);
  if (previo) {
    borrador.mensajes.unshift({
      tono: "aviso",
      texto: `Este mismo archivo ya se subió en el lote ${previo.codigo}. Compruebe que no lo esté importando dos veces.`,
    });
  }

  const { id: _id, codigo: _codigo, creadaEn: _c, actualizadaEn: _a, ...sinIdentidad } = borrador;
  void _id;
  void _codigo;
  void _c;
  void _a;
  const lote = crearLote(sinIdentidad);

  registrarBitacora({
    usuario: entrada.usuario.usuario,
    area: entrada.usuario.area,
    accion: "IMPORTACION_REVISADA",
    entidad: lote.codigo,
    detalle: `${entrada.nombreArchivo} · ${resumen(lote).texto}`,
  });
  return lote;
}

/** «Volver a comprobar»: vuelve a revisar las filas no creadas, contra SAFI de ahora. */
export async function revalidar(lote: LoteImportacion, numerarDesde: string | undefined, usuario: Usuario): Promise<LoteImportacion> {
  if (lote.estado === "EN_CURSO") throw new ErrorImportacion("El lote se está creando en SAFI: espere a que termine o deténgalo.");
  if (lote.estado === "DESCARTADO") throw new ErrorImportacion("El lote está descartado.");
  if (numerarDesde !== undefined) lote.numerarDesde = normalizarDesde(numerarDesde);
  await comprobarFilas(lote);
  if (lote.estado === "TERMINADO" && lote.filas.some((f) => f.estado === "LISTA")) lote.estado = "DETENIDO";
  guardarLote(lote);
  registrarBitacora({
    usuario: usuario.usuario,
    area: usuario.area,
    accion: "IMPORTACION_REVISADA",
    entidad: lote.codigo,
    detalle: `Vuelta a comprobar · ${resumen(lote).texto}`,
  });
  return lote;
}

export function descartar(lote: LoteImportacion, usuario: Usuario): LoteImportacion {
  if (lote.estado === "EN_CURSO") throw new ErrorImportacion("El lote se está creando en SAFI: deténgalo antes.");
  if (lote.filas.some((fila) => fila.estado === "CREADA")) {
    throw new ErrorImportacion("Este lote ya creó socios en SAFI: no se descarta, queda como constancia.");
  }
  lote.estado = "DESCARTADO";
  guardarLote(lote);
  registrarBitacora({ usuario: usuario.usuario, area: usuario.area, accion: "IMPORTACION_DESCARTADA", entidad: lote.codigo });
  return lote;
}

/* ------------------------------------------------------------------ */
/* Creación en SAFI                                                    */
/* ------------------------------------------------------------------ */

/**
 * La solicitud equivalente a una fila: la misma forma que un trámite de la
 * tableta, para que el alta en SAFI sea exactamente la del panel. No se guarda
 * como trámite.
 */
export function solicitudDeFila(lote: LoteImportacion, fila: FilaImportacion): SolicitudAfiliacion {
  const instante = lote.creadaEn || ahora();
  return {
    id: `${lote.id}-${fila.fila}`,
    codigo: `${lote.codigo} fila ${fila.fila}`,
    esquema: ESQUEMA_SOLICITUD,
    estado: "REGISTRADA",
    creadaEn: instante,
    actualizadaEn: instante,
    datos: fila.datos,
    documentos: [],
    firmaUri: null,
    modoFirma: "MANUSCRITA_EN_PANTALLA",
    identidad: identidadVacia(),
    // Solo cuenta la casilla de comunicaciones, que decide el «No Enviar
    // Email». Las demás no se registraron por esta vía y no se dan por dadas.
    consentimiento: {
      versionAviso: "",
      aceptadoEn: instante,
      valores: {
        tratamientoDatos: false,
        imagenCredencial: false,
        veracidad: false,
        comunicaciones: fila.comunicaciones,
      },
    },
    tramite: { ...tramiteVacio(), fechaRegistro: hoyEcuador(), numeroSocio: fila.numero, ordinalDependiente: null },
    expediente: { ...expedienteVacio(), cuentaSafiId: fila.cuentaSafiId ?? null },
    historial: [],
  };
}

/** Lotes que se piden detener: se detienen al terminar la fila en curso. */
const detenciones = new Map<string, string>();
let loteEnCurso: string | null = null;

export function pedirDetencion(lote: LoteImportacion, usuario: Usuario): LoteImportacion {
  if (lote.estado !== "EN_CURSO") throw new ErrorImportacion("El lote no se está creando.");
  detenciones.set(lote.id, usuario.nombre);
  lote.proceso = { ...(lote.proceso ?? { iniciadoEn: ahora(), iniciadoPor: usuario.nombre }), detenidoPor: usuario.nombre };
  guardarLote(lote);
  return lote;
}

/**
 * Empieza a crear en SAFI las filas listas (y reintenta las fallidas). No
 * espera: el lote avanza en segundo plano y la bandeja lo consulta.
 */
export function iniciarCreacion(lote: LoteImportacion, usuario: Usuario): LoteImportacion {
  const adaptador = adaptadorSafi();
  if (adaptador.modo !== "API" || !adaptador.escritura) {
    throw new ErrorImportacion(
      adaptador.modo !== "API"
        ? "La importación necesita la integración con SAFI por API (SAFI_MODO=API)."
        : "La escritura en SAFI está deshabilitada (SAFI_ESCRITURA=false): el lote se puede revisar pero no crear."
    );
  }
  if (loteEnCurso || lotesEnCurso().length > 0) {
    throw new ErrorImportacion("Ya hay un lote creándose en SAFI. Espere a que termine.");
  }
  if (lote.estado === "DESCARTADO") throw new ErrorImportacion("El lote está descartado.");
  if (lote.estado === "EN_CURSO") throw new ErrorImportacion("El lote ya se está creando.");
  const porCrear = lote.filas.filter((fila) => fila.estado === "LISTA" || fila.estado === "FALLIDA");
  if (porCrear.length === 0) throw new ErrorImportacion("No hay filas listas para crear.");

  lote.estado = "EN_CURSO";
  lote.proceso = { iniciadoEn: ahora(), iniciadoPor: usuario.nombre };
  detenciones.delete(lote.id);
  loteEnCurso = lote.id;
  guardarLote(lote);

  registrarBitacora({
    usuario: usuario.usuario,
    area: usuario.area,
    accion: "IMPORTACION_INICIADA",
    entidad: lote.codigo,
    detalle: `${porCrear.length} fila(s) por crear en SAFI.`,
  });

  void procesar(lote.id, usuario).finally(() => {
    loteEnCurso = null;
    detenciones.delete(lote.id);
  });
  return lote;
}

/** Crea una fila en SAFI. Devuelve el motivo para detener el lote, si lo hay. */
async function crearFila(lote: LoteImportacion, fila: FilaImportacion, usuario: Usuario): Promise<string | null> {
  const adaptador = adaptadorSafi();
  const solicitud = solicitudDeFila(lote, fila);

  // Justo antes de crear, SAFI otra vez: entre la revisión y ahora alguien pudo
  // crear a mano un socio con ese número o esa cédula.
  const verificacion = await adaptador
    .verificar({ solicitud, numeroSocio: fila.numero, ordinalDependiente: null })
    .catch((error: unknown) => ({
      consultado: false,
      avisos: [{ mensaje: error instanceof Error ? error.message : String(error), bloquea: false }],
    }));
  if (!verificacion.consultado) {
    fila.estado = "LISTA";
    const detalle = verificacion.avisos.map((a) => a.mensaje).join(" ");
    return `No se pudo consultar SAFI antes de crear la fila ${fila.fila}; no se creó nada. ${detalle}`.trim();
  }
  const bloqueantes = verificacion.avisos.filter((aviso) => aviso.bloquea);
  if (bloqueantes.length > 0) {
    fila.estado = "ERROR";
    fila.errores = bloqueantes.map((aviso) => ({ texto: aviso.mensaje }));
    return `La fila ${fila.fila} ya no se puede crear: ${bloqueantes[0].mensaje} Use «Volver a comprobar» antes de seguir.`;
  }

  const confirmacion = { ...fila.confirmacion, confirmadaPor: usuario.nombre, confirmadaEn: ahora() };
  let alta;
  try {
    alta = await adaptador.darDeAlta({
      solicitud,
      confirmacion,
      cuentaId: fila.cuentaSafiId ?? null,
      descripcionCuenta: `Importación ${lote.codigo} (fila ${fila.fila}) · registrada desde la bandeja del Área de Socios.`,
    });
  } catch (error) {
    alta = { ok: false as const, mensaje: error instanceof Error ? error.message : String(error) };
  }

  if (!alta.ok) {
    fila.estado = "FALLIDA";
    if (alta.cuentaId) fila.cuentaSafiId = alta.cuentaId;
    fila.resultado = { en: ahora(), cuentaSafiId: alta.cuentaId, mensaje: alta.mensaje };
    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "IMPORTACION_FILA_FALLIDA",
      entidad: lote.codigo,
      detalle: `Fila ${fila.fila} · N.º ${fila.numero} · ${alta.mensaje}`,
    });
    return `SAFI no creó la fila ${fila.fila}: ${alta.mensaje}`;
  }

  fila.estado = "CREADA";
  fila.confirmacion = confirmacion;
  fila.resultado = {
    en: ahora(),
    cuentaSafiId: alta.cuentaId,
    socioSafiId: alta.socioId,
    fichaAutomatica: alta.fichaAutomatica,
  };
  registrarBitacora({
    usuario: usuario.usuario,
    area: usuario.area,
    accion: "SAFI_ALTA_CREADA",
    entidad: lote.codigo,
    detalle: `Fila ${fila.fila} · N.º ${fila.numero} · ${nombreCompleto(fila.datos)} · Cuenta ${alta.cuentaId} · Socio ${alta.socioId}`,
  });

  const automatica = alta.fichaAutomatica;
  if (automatica && !automatica.completada) {
    fila.resultado.mensaje = `SAFI creó sola la ficha ${automatica.id} («Complete Aqui») con la Cuenta y no dejó completarla (${(
      automatica.motivo ?? "sin motivo"
    ).replace(/\.$/, "")}). La del socio es la ${alta.socioId}: la ${automatica.id} sobra y hay que borrarla en SAFI.`;
    return `${fila.resultado.mensaje} Se detuvo el lote para no dejar más fichas repetidas: habilite en SAFI la edición de Socios para el usuario de la integración y vuelva a pulsar «Crear».`;
  }
  return null;
}

async function procesar(id: string, usuario: Usuario): Promise<void> {
  const lote = obtenerLote(id);
  if (!lote) return;

  let motivo: string | null = null;
  try {
    for (const fila of lote.filas) {
      if (fila.estado !== "LISTA" && fila.estado !== "FALLIDA") continue;
      if (detenciones.has(id)) {
        const quien = detenciones.get(id) ?? "la Jefatura";
        lote.proceso = { ...(lote.proceso ?? { iniciadoEn: ahora(), iniciadoPor: usuario.nombre }), detenidoPor: quien };
        motivo = `Detenido por ${quien}.`;
        break;
      }
      fila.estado = "EN_CURSO";
      guardarLote(lote);
      motivo = await crearFila(lote, fila, usuario);
      guardarLote(lote);
      if (motivo) break;
    }
  } catch (error) {
    motivo = `Error inesperado: ${error instanceof Error ? error.message : String(error)}`;
    for (const fila of lote.filas) if (fila.estado === "EN_CURSO") fila.estado = "FALLIDA";
  }

  const quedan = lote.filas.some((fila) => fila.estado === "LISTA" || fila.estado === "FALLIDA");
  lote.estado = motivo || quedan ? "DETENIDO" : "TERMINADO";
  const { texto } = resumen(lote);
  lote.proceso = { ...(lote.proceso ?? { iniciadoEn: ahora(), iniciadoPor: usuario.nombre }), terminadoEn: ahora(), motivo: motivo ?? `Terminado: ${texto}.` };
  guardarLote(lote);

  registrarBitacora({
    usuario: usuario.usuario,
    area: usuario.area,
    accion: lote.estado === "TERMINADO" ? "IMPORTACION_TERMINADA" : "IMPORTACION_DETENIDA",
    entidad: lote.codigo,
    detalle: motivo ? `${motivo} · ${texto}` : texto,
  });
}

/**
 * Al arrancar el servidor: un lote que quedó «creándose» se cortó con él. Sus
 * filas a medias se marcan como fallidas; la comprobación previa de SAFI
 * detectará al reintentarlas si llegaron a crearse.
 */
export function recuperarInterrumpidos(): void {
  for (const lote of lotesEnCurso()) {
    for (const fila of lote.filas) {
      if (fila.estado === "EN_CURSO") {
        fila.estado = "FALLIDA";
        fila.resultado = {
          en: ahora(),
          mensaje:
            "El servidor se reinició mientras se creaba esta fila. Compruebe en SAFI si llegó a crearse; al reintentar, la comprobación previa lo detecta.",
        };
      }
    }
    lote.estado = "DETENIDO";
    lote.proceso = { ...(lote.proceso ?? { iniciadoEn: lote.creadaEn, iniciadoPor: "—" }), terminadoEn: ahora(), motivo: "El servidor se reinició mientras se creaba el lote." };
    guardarLote(lote);
  }
}

/* ------------------------------------------------------------------ */
/* Presentación                                                        */
/* ------------------------------------------------------------------ */

export function resumen(lote: LoteImportacion) {
  const cuenta = (estado: FilaImportacion["estado"]) => lote.filas.filter((f) => f.estado === estado).length;
  const datos = {
    filas: lote.filas.length,
    listas: cuenta("LISTA"),
    errores: cuenta("ERROR"),
    creadas: cuenta("CREADA"),
    fallidas: cuenta("FALLIDA"),
    enCurso: cuenta("EN_CURSO"),
  };
  const texto = [
    `${datos.filas} fila(s)`,
    datos.creadas ? `${datos.creadas} creada(s)` : "",
    datos.listas ? `${datos.listas} lista(s)` : "",
    datos.errores ? `${datos.errores} con errores` : "",
    datos.fallidas ? `${datos.fallidas} fallida(s)` : "",
  ]
    .filter(Boolean)
    .join(", ");
  return { ...datos, texto };
}

/** Lo que la bandeja necesita de un lote: sin las celdas ni los datos completos. */
export function vistaDeLote(lote: LoteImportacion, conFilas = true) {
  return {
    id: lote.id,
    codigo: lote.codigo,
    estado: lote.estado,
    archivo: lote.archivo.nombre,
    hoja: lote.archivo.hoja,
    creadaEn: lote.creadaEn,
    creadaPor: lote.creadaPor.nombre,
    revisadoEn: lote.revisadoEn,
    numerarDesde: lote.numerarDesde,
    consultadoEnSafi: lote.consultadoEnSafi,
    mensajes: lote.mensajes,
    proceso: lote.proceso ?? null,
    resumen: resumen(lote),
    filas: conFilas
      ? lote.filas.map((fila) => ({
          fila: fila.fila,
          estado: fila.estado,
          numero: fila.numero,
          numeroAsignado: fila.numeroAsignado,
          cedula: fila.datos?.cedula || (fila.celdas.cedula?.texto ?? ""),
          nombre: fila.datos ? nombreCompleto(fila.datos) : "",
          grado: fila.datos?.gradoMilitar ?? "",
          suscripcion: fila.confirmacion?.suscripcion ?? "",
          valorCuota: fila.confirmacion?.valorCuota ?? "",
          formaPago: fila.confirmacion?.formaPago ?? "",
          grupoFacturacion: fila.confirmacion?.grupoFacturacion ?? "",
          errores: fila.errores.map((m) => ({ ...m, columna: m.columna ? tituloDe(m.columna) : undefined })),
          avisos: fila.avisos.map((m) => ({ ...m, columna: m.columna ? tituloDe(m.columna) : undefined })),
          resultado: fila.resultado ?? null,
        }))
      : undefined,
  };
}

function tituloDe(clave: ClaveColumna): string {
  return COLUMNAS.find((c) => c.clave === clave)?.titulo ?? clave;
}

const ETIQUETA_ESTADO_FILA: Record<FilaImportacion["estado"], string> = {
  ERROR: "Con errores",
  LISTA: "Lista, sin crear",
  EN_CURSO: "Creándose",
  CREADA: "Creada",
  FALLIDA: "Fallida",
};

/** La plantilla vacía, con las listas del CRM de hoy. */
export async function plantillaVacia(): Promise<Buffer> {
  const listas = await adaptadorSafi().listas().catch(() => null);
  return escribirLibro({ listas: listasDePlantilla(catalogosDe(listas)) });
}

/**
 * El informe de un lote: la hoja «Resultado» con cada fila, y la hoja
 * «Socios» con las que no se crearon, tal como se escribieron, para
 * corregirlas y volver a subir este mismo archivo.
 */
export async function informeDeLote(lote: LoteImportacion): Promise<Buffer> {
  const listas = await adaptadorSafi().listas().catch(() => null);
  const noCreadas = lote.filas.filter((fila) => fila.estado !== "CREADA");
  const filas: FilaResultado[] = lote.filas.map((fila) => ({
    fila: fila.fila,
    estado: ETIQUETA_ESTADO_FILA[fila.estado],
    numeroSocio: fila.numero,
    cedula: fila.datos?.cedula || (fila.celdas.cedula?.texto ?? ""),
    nombre: fila.datos ? nombreCompleto(fila.datos) : "",
    cuenta: fila.resultado?.cuentaSafiId ?? fila.cuentaSafiId ?? "",
    socio: fila.resultado?.socioSafiId ?? "",
    detalle: [
      ...fila.errores.map((m) => (m.columna ? `${tituloDe(m.columna)}: ${m.texto}` : m.texto)),
      ...fila.avisos.map((m) => `Aviso${m.columna ? ` (${tituloDe(m.columna)})` : ""}: ${m.texto}`),
      fila.resultado?.mensaje ?? "",
      fila.resultado?.fichaAutomatica?.completada ? `Se completó la ficha que SAFI crea sola (${fila.resultado.fichaAutomatica.id}).` : "",
    ]
      .filter(Boolean)
      .join(" | "),
  }));
  return escribirLibro({
    listas: listasDePlantilla(catalogosDe(listas)),
    filas: noCreadas.map((fila) =>
      Object.fromEntries(Object.entries(fila.celdas).map(([clave, celda]) => [clave, celda?.texto ?? ""]))
    ),
    resultado: { titulo: `Importación ${lote.codigo} · ${lote.archivo.nombre} · ${resumen(lote).texto}`, filas },
  });
}
