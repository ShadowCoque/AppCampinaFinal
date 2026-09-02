import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";

import { analizarNombreArchivo } from "../../../src/domain/expediente";
import { INSTRUCTIVO_ESCANEO } from "../../../src/domain/expediente";
import {
  AREA_META,
  nombreCompleto,
  nombreTitular,
  type Area,
  type EstadoSolicitud,
  type SolicitudAfiliacion,
} from "../../../src/domain/solicitud";
import {
  atendidasPor,
  calcularTareas,
  contadoresDeTareas,
  tareasDeArea,
} from "../../../src/domain/tareas";
import {
  TIPOS_DISPONIBLES,
  nombreTipo,
  tieneCuentaPropia,
} from "../../../src/domain/tiposMiembro";
import { periodicidadesDe } from "../../../src/domain/cuotas";
import { config } from "../config";
import {
  archivosDeSolicitud,
  incidenciasAbiertas,
  porId,
  resolverIncidencia,
} from "../db/archivos";
import { registrarBitacora } from "../db/indice";
import {
  SolicitudYaRegistrada,
  avanzarTramite,
  cuentaSafiDelTitular,
  guardarAltaSafi,
  listarSolicitudes,
  obtenerSolicitud,
  registrarSolicitud,
  siguienteOrdinalDependiente,
  solicitudesConTareas,
  solicitudesRecientes,
} from "../db/solicitudes";
import { abrirSesion, autenticar, cerrarSesion, usuarioDeSesion } from "../db/usuarios";
import { archivarContenido, rutaSegura } from "../expediente/repositorio";
import { recorrer } from "../expediente/vigilante";
import { adaptadorSafi, type ListasSafi } from "../safi/adaptador";
import {
  CUOTAS_ANUALES_SAFI,
  CUOTAS_MENSUALES_SAFI,
  FORMAS_PAGO_SAFI,
  GRUPOS_FACTURACION,
  MEMBRESIAS_SAFI,
  SUSCRIPCIONES_SAFI,
  TIPOS_CONTRIBUYENTE,
  VALORES_DE_RELLENO,
} from "../safi/campos";
import { diagnosticarSafi } from "../safi/cliente";
import { procesarCola } from "../safi/cola";
import {
  avisosDeConfirmacion,
  faltantesDeConfirmacion,
  sugerirConfirmacion,
} from "../safi/registro";
import { anotarExito, anotarFallo, puedeIntentar } from "./intentos";
import { COOKIE_SESION, OPCIONES_COOKIE, exigirArea, exigirSesion, usuarioDe } from "./sesion";
import {
  recortarObservacion,
  tipoContenidoDe,
  validarConfirmacionSafi,
  validarContenido,
  validarExtension,
  validarOrdinal,
  validarSolicitudEntrante,
  validarTipoDocumento,
} from "./validacion";

/**
 * API del servidor.
 *
 * La consumen dos clientes: la aplicación móvil del Área de Socios, que
 * registra las afiliaciones y sube los documentos capturados, y la bandeja de
 * tareas web, desde la que Contabilidad revisa y la Gerencia aprueba.
 */

function incidenciasParaBandeja() {
  return incidenciasAbiertas().map((i) => ({
    id: i.id,
    archivo: i.archivo,
    motivo: i.motivo as never,
    detalle: i.detalle,
    detectadaEn: i.detectadaEn,
    numeroSocio: i.numeroSocio ?? undefined,
  }));
}

/**
 * Opciones que el panel del Área de Socios ofrece en cada lista.
 *
 * Manda lo que el CRM diga en vivo; el catálogo de `campos.ts` solo entra
 * cuando SAFI no responde o cuando la integración está en modo manual. Así una
 * lista que el Club amplíe en el CRM aparece sin tocar el código, y a la vez la
 * bandeja sigue siendo utilizable con el CRM caído.
 */
function listasParaPanel(delCrm: ListasSafi | null) {
  const elegir = (vivas: string[] | undefined, respaldo: readonly string[]): string[] =>
    depurar(vivas && vivas.length > 0 ? vivas : [...respaldo]);

  return {
    grupoFacturacion: elegir(delCrm?.grupoFacturacion, GRUPOS_FACTURACION),
    formaPago: elegir(delCrm?.formaPago, FORMAS_PAGO_SAFI),
    tipoContribuyente: elegir(delCrm?.tipoContribuyente, TIPOS_CONTRIBUYENTE),
    suscripcion: elegir(delCrm?.suscripcion, SUSCRIPCIONES_SAFI),
    cuotaAnual: elegir(delCrm?.cuotaAnual, CUOTAS_ANUALES_SAFI),
    cuotaMensual: elegir(delCrm?.cuotaMensual, CUOTAS_MENSUALES_SAFI),
    valorMembresia: elegir(delCrm?.valorMembresia, MEMBRESIAS_SAFI),
  };
}

/**
 * Deja fuera lo que nadie debería llegar a elegir.
 *
 * Las listas del CRM arrastran restos de la carga histórica: marcadores como
 * `????` o `Complete Aqui`, y duplicados del mismo importe escritos de dos
 * maneras (`7000` y `7000,00`). Se siguen aceptando si una ficha antigua los
 * trae —por eso están en el catálogo de `campos.ts`— pero ofrecerlos en un
 * desplegable sería invitar a repetir el error.
 *
 * De cada importe duplicado se conserva la primera forma, que en el CRM es
 * siempre la escrita sin decimales.
 */
function depurar(valores: string[]): string[] {
  const vistos = new Set<string>();
  const limpios: string[] = [];

  for (const valor of valores) {
    if (VALORES_DE_RELLENO.has(valor)) continue;

    const numero = Number(valor.replace(",", "."));
    const clave = Number.isFinite(numero) && valor.trim() !== "" ? String(numero) : valor;
    if (vistos.has(clave)) continue;

    vistos.add(clave);
    limpios.push(valor);
  }

  return limpios;
}

/** Resumen de una solicitud para las listas: no viaja el expediente completo. */
function resumir(solicitud: SolicitudAfiliacion) {
  return {
    id: solicitud.id,
    codigo: solicitud.codigo,
    estado: solicitud.estado,
    numeroSocio: solicitud.tramite.numeroSocio,
    cedula: solicitud.datos.cedula,
    nombre: `${solicitud.datos.apellidos} ${solicitud.datos.nombres}`.replace(/\s+/g, " ").trim(),
    tipoMiembro: solicitud.datos.tipoMiembro,
    creadaEn: solicitud.creadaEn,
    actualizadaEn: solicitud.actualizadaEn,
    revision: solicitud.tramite.revision,
    aprobacion: solicitud.tramite.aprobacion,
  };
}

export async function registrarApi(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------------- */
  /* Sesión                                                            */
  /* ---------------------------------------------------------------- */

  app.post("/api/sesion", async (peticion, respuesta) => {
    const cuerpo = peticion.body as { usuario?: string; clave?: string } | undefined;
    if (!cuerpo?.usuario || !cuerpo?.clave) {
      return respuesta.code(400).send({ error: "Indique usuario y contraseña." });
    }

    const espera = puedeIntentar(cuerpo.usuario, peticion.ip);
    if (!espera.permitido) {
      return respuesta.code(429).send({
        error: `Demasiados intentos fallidos. Vuelva a intentarlo en ${espera.segundos} segundos.`,
      });
    }

    const usuario = autenticar(cuerpo.usuario, cuerpo.clave);
    if (!usuario) {
      anotarFallo(cuerpo.usuario, peticion.ip);
      registrarBitacora({
        usuario: cuerpo.usuario,
        accion: "SESION_RECHAZADA",
        detalle: peticion.ip,
      });
      return respuesta.code(401).send({ error: "Usuario o contraseña incorrectos." });
    }

    anotarExito(cuerpo.usuario, peticion.ip);
    const sesion = abrirSesion(usuario.id, config.horasSesion);
    registrarBitacora({ usuario: usuario.usuario, area: usuario.area, accion: "SESION_INICIADA" });

    return respuesta
      .setCookie(COOKIE_SESION, sesion, OPCIONES_COOKIE)
      .send({ usuario: usuario.usuario, nombre: usuario.nombre, area: usuario.area });
  });

  app.delete("/api/sesion", async (peticion, respuesta) => {
    const bruta = peticion.cookies[COOKIE_SESION];
    if (bruta) {
      const verificada = peticion.unsignCookie(bruta);
      if (verificada.valid && verificada.value) cerrarSesion(verificada.value);
    }
    return respuesta.clearCookie(COOKIE_SESION, { path: "/" }).send({ ok: true });
  });

  app.get("/api/sesion", async (peticion, respuesta) => {
    const usuario = usuarioDe(peticion);
    if (!usuario) return respuesta.code(401).send({ error: "Sin sesión." });
    return respuesta.send({
      usuario: usuario.usuario,
      nombre: usuario.nombre,
      area: usuario.area,
      etiquetaArea: AREA_META[usuario.area].etiqueta,
    });
  });

  /* ---------------------------------------------------------------- */
  /* Bandeja de tareas                                                 */
  /* ---------------------------------------------------------------- */

  app.get("/api/bandeja", async (peticion, respuesta) => {
    const usuario = exigirSesion(peticion, respuesta);
    if (!usuario) return respuesta;

    // Solo se recorren las solicitudes que aún generan tareas y las últimas
    // actualizadas: el coste depende de lo pendiente, no del histórico.
    const incidencias = incidenciasParaBandeja();
    const tareas = calcularTareas(solicitudesConTareas(), incidencias);

    return respuesta.send({
      area: usuario.area,
      etiquetaArea: AREA_META[usuario.area].etiqueta,
      accion: AREA_META[usuario.area].accion,
      pendientes: tareasDeArea(usuario.area, tareas),
      atendidas: atendidasPor(usuario.area, solicitudesRecientes()).slice(0, 100).map(resumir),
      contadores: contadoresDeTareas(tareas),
      instructivoEscaneo: usuario.area === "SOCIOS" ? INSTRUCTIVO_ESCANEO : [],
    });
  });

  /* ---------------------------------------------------------------- */
  /* Solicitudes                                                       */
  /* ---------------------------------------------------------------- */

  app.get("/api/solicitudes", async (peticion, respuesta) => {
    const usuario = exigirSesion(peticion, respuesta);
    if (!usuario) return respuesta;

    const filtro = peticion.query as { estado?: EstadoSolicitud } | undefined;
    return respuesta.send(listarSolicitudes(filtro?.estado ? { estado: filtro.estado } : undefined).map(resumir));
  });

  app.get("/api/solicitudes/:id", async (peticion, respuesta) => {
    const usuario = exigirSesion(peticion, respuesta);
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const solicitud = obtenerSolicitud(id);
    if (!solicitud) return respuesta.code(404).send({ error: "Solicitud no encontrada." });

    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "CONSULTAR_EXPEDIENTE",
      entidad: solicitud.codigo,
    });

    return respuesta.send({
      solicitud,
      archivos: archivosDeSolicitud(solicitud.id).map((a) => ({
        id: a.id,
        tipoDocumento: a.tipoDocumento,
        nombreArchivo: a.nombreArchivo,
        bytes: a.bytes,
        origen: a.origen,
        registradoEn: a.registradoEn,
        safiEstado: a.safiEstado,
      })),
    });
  });

  /** Registro de una afiliación desde la aplicación móvil. */
  app.post("/api/solicitudes", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const comprobacion = validarSolicitudEntrante(peticion.body);
    if (!comprobacion.ok) return respuesta.code(400).send({ error: comprobacion.error });

    try {
      const registrada = registrarSolicitud(
        (peticion.body as { solicitud: SolicitudAfiliacion }).solicitud,
        { usuario: usuario.usuario, area: usuario.area, nombre: usuario.nombre }
      );
      return respuesta.code(201).send(registrada);
    } catch (error) {
      // La tableta reintenta cuando pierde la respuesta. No es un fallo: se le
      // devuelve lo que ya está almacenado para que deje de reintentar.
      if (error instanceof SolicitudYaRegistrada) {
        return respuesta.code(200).send(error.existente);
      }
      throw error;
    }
  });

  /* ---------------------------------------------------------------- */
  /* Constancias del reverso: revisar, aprobar, observar                */
  /* ---------------------------------------------------------------- */

  type CuerpoAccion = { observacion?: string; numeroFactura?: string; numeroSocio?: string; numeroTarjeta?: string };

  /** Contabilidad marca REVISADO y registra la casilla FC del formulario. */
  app.post("/api/solicitudes/:id/revisar", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "CONTABILIDAD");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const cuerpo = (peticion.body ?? {}) as CuerpoAccion;

    const actual = obtenerSolicitud(id);
    if (!actual) return respuesta.code(404).send({ error: "Solicitud no encontrada." });
    if (actual.estado !== "REGISTRADA") {
      return respuesta
        .code(409)
        .send({ error: `La solicitud está en estado ${actual.estado}; solo se revisa lo registrado.` });
    }

    const actualizada = avanzarTramite(
      id,
      {
        estado: "REVISADA",
        constancia: {
          area: "CONTABILIDAD",
          responsable: usuario.nombre,
          en: new Date().toISOString(),
          observacion: recortarObservacion(cuerpo.observacion),
          numeroFactura: recortarObservacion(cuerpo.numeroFactura, 60),
        },
      },
      { usuario: usuario.usuario, area: usuario.area }
    );

    return respuesta.send(actualizada);
  });

  /** La Gerencia aprueba el ingreso. */
  app.post("/api/solicitudes/:id/aprobar", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "GERENCIA");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const cuerpo = (peticion.body ?? {}) as CuerpoAccion;

    const actual = obtenerSolicitud(id);
    if (!actual) return respuesta.code(404).send({ error: "Solicitud no encontrada." });
    if (actual.estado !== "REVISADA") {
      return respuesta.code(409).send({
        error: "La Gerencia aprueba con la revisión previa de Contabilidad. Esta solicitud aún no ha sido revisada.",
      });
    }

    const actualizada = avanzarTramite(
      id,
      {
        estado: "APROBADA",
        constancia: {
          area: "GERENCIA",
          responsable: usuario.nombre,
          en: new Date().toISOString(),
          observacion: recortarObservacion(cuerpo.observacion),
        },
      },
      { usuario: usuario.usuario, area: usuario.area }
    );

    return respuesta.send(actualizada);
  });

  /** Contabilidad o Gerencia devuelven el trámite con observaciones. */
  app.post("/api/solicitudes/:id/observar", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "CONTABILIDAD", "GERENCIA");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const cuerpo = (peticion.body ?? {}) as CuerpoAccion;
    const observacion = recortarObservacion(cuerpo.observacion);

    if (observacion.length < 10) {
      return respuesta
        .code(400)
        .send({ error: "Escriba la observación: es lo que el Área de Socios debe corregir." });
    }

    const actualizada = avanzarTramite(
      id,
      {
        estado: "OBSERVADA",
        constancia: {
          area: usuario.area,
          responsable: usuario.nombre,
          en: new Date().toISOString(),
          observacion,
        },
      },
      { usuario: usuario.usuario, area: usuario.area }
    );

    if (!actualizada) return respuesta.code(404).send({ error: "Solicitud no encontrada." });
    return respuesta.send(actualizada);
  });

  /** El Área de Socios registra los números que asignó el CRM. */
  app.post("/api/solicitudes/:id/numeros", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const cuerpo = (peticion.body ?? {}) as CuerpoAccion;

    const actual = obtenerSolicitud(id);
    if (!actual) return respuesta.code(404).send({ error: "Solicitud no encontrada." });

    const actualizada = avanzarTramite(
      id,
      {
        estado: actual.estado,
        numeroSocio: cuerpo.numeroSocio,
        numeroTarjeta: cuerpo.numeroTarjeta,
        constancia: {
          area: "SOCIOS",
          responsable: actual.tramite.registro?.responsable ?? usuario.nombre,
          en: actual.tramite.registro?.en ?? new Date().toISOString(),
          observacion: actual.tramite.registro?.observacion ?? "",
        },
      },
      { usuario: usuario.usuario, area: usuario.area }
    );

    return respuesta.send(actualizada);
  });

  /* ---------------------------------------------------------------- */
  /* Alta en el CRM de SAFI                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Lo que el Área de Socios necesita para confirmar el alta: la propuesta del
   * sistema, las listas de valores que SAFI admite y los avisos de lo que el
   * CRM todavía no puede guardar.
   */
  app.get("/api/solicitudes/:id/safi", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const solicitud = obtenerSolicitud(id);
    if (!solicitud) return respuesta.code(404).send({ error: "Solicitud no encontrada." });

    const adaptador = adaptadorSafi();
    // Las listas vivas del CRM mandan sobre el catálogo de respaldo: si el Club
    // añadió un valor esta semana, debe aparecer aquí sin tocar el código.
    const delCrm = await adaptador.listas();

    const propuesta = solicitud.expediente.confirmacionSafi ?? sugerirConfirmacion(solicitud);
    const esTitular = tieneCuentaPropia(solicitud.datos.tipoMiembro);
    const numeroTitular = solicitud.datos.titularNumeroSocio;

    return respuesta.send({
      codigo: solicitud.codigo,
      nombreSocio: nombreCompleto(solicitud.datos),
      cedula: solicitud.datos.cedula,
      tipoMiembro: nombreTipo(solicitud.datos.tipoMiembro),
      modo: adaptador.modo,
      esTitular,
      // En un dependiente el número y la Cuenta son los del titular: no se
      // piden de nuevo ni se pueden cambiar aquí.
      numeroSocio: esTitular ? solicitud.tramite.numeroSocio : numeroTitular,
      ordinalDependiente: esTitular
        ? null
        : solicitud.tramite.ordinalDependiente ?? siguienteOrdinalDependiente(numeroTitular),
      cuentaTitular: esTitular ? null : cuentaSafiDelTitular(numeroTitular),
      nombreTitular: nombreTitular(solicitud.datos),
      // El cónyuge, los padres y el juvenil no pagan cuota propia: quedan
      // cubiertos por la del titular, y el panel no debe pedírsela.
      pagaCuota:
        periodicidadesDe(solicitud.datos.tipoMiembro, solicitud.datos.estadoCivil).length > 0,
      propuesta,
      listas: listasParaPanel(delCrm),
      listasEnVivo: delCrm !== null,
      avisos: avisosDeConfirmacion(solicitud, propuesta, delCrm ?? undefined),
      yaCreado: Boolean(solicitud.expediente.socioSafiId),
    });
  });

  /** Confirmación de la Jefatura de Socios y alta efectiva en el CRM. */
  app.post("/api/solicitudes/:id/safi", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const solicitud = obtenerSolicitud(id);
    if (!solicitud) return respuesta.code(404).send({ error: "Solicitud no encontrada." });
    if (solicitud.expediente.socioSafiId) {
      return respuesta
        .code(409)
        .send({ error: "Esta persona ya fue creada en SAFI. No se vuelve a crear." });
    }

    const comprobacion = validarConfirmacionSafi(peticion.body);
    if (!comprobacion.ok) return respuesta.code(400).send({ error: comprobacion.error });

    const { numeroSocio, ordinalDependiente } = comprobacion;
    const confirmacion = {
      ...comprobacion.confirmacion,
      confirmadaPor: usuario.nombre,
      confirmadaEn: new Date().toISOString(),
    };

    const faltan = faltantesDeConfirmacion(solicitud, confirmacion);
    if (faltan.length > 0) {
      return respuesta
        .code(400)
        .send({ error: `Complete antes de crear en SAFI: ${faltan.join(", ")}.` });
    }

    // La solicitud debe llevar ya el número de socio para poder componer los
    // campos del CRM y el nombre de la carpeta del expediente.
    const conNumeros = {
      ...solicitud,
      tramite: { ...solicitud.tramite, numeroSocio, ordinalDependiente },
    };

    const adaptador = adaptadorSafi();
    const esTitular = tieneCuentaPropia(solicitud.datos.tipoMiembro);
    const cuentaId = esTitular
      ? solicitud.expediente.cuentaSafiId ?? null
      : cuentaSafiDelTitular(solicitud.datos.titularNumeroSocio);

    // Un valor que SAFI no puede guardar hace fallar el alta, así que se detiene
    // antes de intentarla. En modo manual quien escribe en el CRM es una
    // persona, que puede haber añadido ya el valor: ahí ese aviso informa y no
    // detiene. Los de coherencia detienen siempre, porque una ficha con dos
    // cuotas a la vez es igual de falsa se escriba a mano o por la API.
    const avisos = avisosDeConfirmacion(
      conNumeros,
      confirmacion,
      (await adaptador.listas()) ?? undefined
    );
    const bloqueantes = avisos.filter(
      (aviso) =>
        aviso.bloquea && (aviso.origen === "COHERENCIA" || adaptador.modo !== "MANUAL")
    );

    if (bloqueantes.length > 0) {
      return respuesta.code(409).send({
        error: bloqueantes.map((aviso) => aviso.mensaje).join(" "),
        avisos: bloqueantes,
      });
    }

    const alta = await adaptador.darDeAlta({ solicitud: conNumeros, confirmacion, cuentaId });

    // Con la integración deshabilitada el alta la hace una persona en el CRM y
    // transcribe aquí los identificadores que SAFI le asignó. Sin ellos el
    // expediente no puede publicar después sus documentos contra la Cuenta.
    const manual = adaptador.modo === "MANUAL";
    const cuentaFinal = alta.ok ? alta.cuentaId : comprobacion.cuentaSafiId ?? cuentaId;
    const socioFinal = alta.ok ? alta.socioId : manual ? comprobacion.socioSafiId : null;

    const actualizada = guardarAltaSafi(
      id,
      {
        numeroSocio,
        ordinalDependiente,
        confirmacion,
        cuentaSafiId: cuentaFinal,
        socioSafiId: socioFinal,
        mensaje: alta.ok || socioFinal ? undefined : alta.mensaje,
      },
      { usuario: usuario.usuario, area: usuario.area }
    );

    const creado = alta.ok || Boolean(socioFinal);
    return respuesta.code(creado ? 200 : 202).send({
      creado,
      mensaje: alta.ok
        ? `Creado en SAFI: Cuenta ${alta.cuentaId}, Socio ${alta.socioId}.`
        : socioFinal
          ? `Registrado el alta hecha a mano en SAFI: Cuenta ${cuentaFinal}, Socio ${socioFinal}.`
          : alta.mensaje,
      avisos,
      solicitud: actualizada,
    });
  });

  /**
   * Diagnóstico de la conexión con SAFI, paso a paso.
   *
   * Un `getchallenge` que no responde admite media docena de causas y desde
   * fuera todas se parecen. Esto dice en cuál falla.
   */
  app.get("/api/safi/diagnostico", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "SAFI_DIAGNOSTICO",
    });

    return respuesta.send({ modo: config.safiModo, pasos: await diagnosticarSafi() });
  });

  /* ---------------------------------------------------------------- */
  /* Expediente digital                                                */
  /* ---------------------------------------------------------------- */

  /** Subida de un documento capturado con la tableta. */
  app.post("/api/expediente/:id/documentos", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { id } = peticion.params as { id: string };
    const solicitud = obtenerSolicitud(id);
    if (!solicitud) return respuesta.code(404).send({ error: "Solicitud no encontrada." });
    if (!solicitud.tramite.numeroSocio) {
      return respuesta.code(409).send({
        error: "Registre primero el número de socio: el expediente se archiva bajo ese número.",
      });
    }

    const parte = await peticion.file();
    if (!parte) return respuesta.code(400).send({ error: "No se recibió ningún archivo." });

    // Los campos del formulario deben viajar ANTES del archivo: es la única
    // forma de conocerlos sin acumular el archivo entero en memoria primero.
    const campos = parte.fields as Record<string, { value?: string } | undefined>;

    const tipo = validarTipoDocumento(campos.tipoDocumento?.value);
    if (!tipo.ok) return respuesta.code(400).send({ error: tipo.error });

    const ordinal = validarOrdinal(campos.ordinalDependiente?.value);
    if (!ordinal.ok) return respuesta.code(400).send({ error: ordinal.error });

    const extension = validarExtension(parte.filename ?? "");
    if (!extension.ok) return respuesta.code(415).send({ error: extension.error });

    const contenido = await parte.toBuffer();
    const formato = validarContenido(contenido, extension.valor);
    if (!formato.ok) return respuesta.code(415).send({ error: formato.error });

    const resultado = archivarContenido({
      contenido,
      extension: extension.valor,
      clave: {
        numeroSocio: solicitud.tramite.numeroSocio,
        ordinalDependiente: ordinal.valor,
        apellidosNombres: `${solicitud.datos.apellidos} ${solicitud.datos.nombres}`,
      },
      tipoDocumento: tipo.valor,
    });

    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "SUBIR_DOCUMENTO",
      entidad: solicitud.codigo,
      detalle: resultado.archivo.nombreArchivo,
    });

    return respuesta.code(201).send({
      id: resultado.archivo.id,
      nombreArchivo: resultado.archivo.nombreArchivo,
      bytes: resultado.archivo.bytes,
      reemplazado: resultado.reemplazado,
    });
  });

  /** Descarga de un documento del expediente. */
  app.get("/api/expediente/documentos/:archivoId", async (peticion, respuesta) => {
    const usuario = exigirSesion(peticion, respuesta);
    if (!usuario) return respuesta;

    const { archivoId } = peticion.params as { archivoId: string };
    const archivo = porId(archivoId);
    if (!archivo) return respuesta.code(404).send({ error: "Documento no encontrado." });

    const ruta = rutaSegura(archivo.ruta);
    if (!ruta) return respuesta.code(404).send({ error: "El archivo ya no está en el repositorio." });

    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "DESCARGAR_DOCUMENTO",
      entidad: archivo.nombreArchivo,
    });

    // El tipo se deduce de la extensión, que ya fue validada al archivar, y
    // se acompaña de `nosniff` para que el navegador no intente adivinar otro.
    return respuesta
      .header("Content-Type", tipoContenidoDe(path.extname(archivo.nombreArchivo)))
      .header("X-Content-Type-Options", "nosniff")
      .header(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(archivo.nombreArchivo)}"`
      )
      .send(fs.createReadStream(ruta));
  });

  /* ---------------------------------------------------------------- */
  /* Escaneos                                                          */
  /* ---------------------------------------------------------------- */

  /** Fuerza una pasada del vigilante sin esperar al temporizador. */
  app.post("/api/escaneos/revisar", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;
    return respuesta.send(await recorrer());
  });

  /** Comprueba un nombre de archivo sin depositarlo: ayuda para la Jefatura. */
  app.get("/api/escaneos/comprobar", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { nombre } = peticion.query as { nombre?: string };
    if (!nombre) return respuesta.code(400).send({ error: "Indique el nombre del archivo." });

    return respuesta.send(analizarNombreArchivo(nombre));
  });

  /** Cierra manualmente una incidencia de escaneo ya corregida. */
  app.post("/api/escaneos/incidencias/:archivo/resolver", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;

    const { archivo } = peticion.params as { archivo: string };
    resolverIncidencia(decodeURIComponent(archivo));
    registrarBitacora({
      usuario: usuario.usuario,
      area: usuario.area,
      accion: "RESOLVER_INCIDENCIA",
      entidad: archivo,
    });
    return respuesta.send({ ok: true });
  });

  /** Reintenta la publicación en el CRM de SAFI. */
  app.post("/api/safi/reintentar", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;
    return respuesta.send(await procesarCola());
  });

  /* ---------------------------------------------------------------- */
  /* Catálogos y estado                                                */
  /* ---------------------------------------------------------------- */

  /**
   * Catálogo de tipos de socio. La aplicación móvil lo consulta al arrancar
   * para no quedar desfasada si el Club modifica un formulario.
   */
  app.get("/api/catalogo/tipos", async (_peticion, respuesta) =>
    respuesta.send(
      TIPOS_DISPONIBLES.map((tipo) => ({
        codigo: tipo.codigo,
        nombre: tipo.nombre,
        categoria: tipo.categoria,
        descripcion: tipo.descripcion,
        formularios: tipo.formularios.map((f) => ({ codigo: f.codigo, titulo: f.titulo })),
        cartaCompromiso: tipo.cartaCompromiso,
      }))
    )
  );

  app.get("/api/salud", async (_peticion, respuesta) =>
    respuesta.send({
      ok: true,
      version: 1,
      safiModo: config.safiModo,
      escaneosDir: config.escaneosDir,
      vigilanciaActiva: fs.existsSync(config.escaneosDir),
      en: new Date().toISOString(),
    })
  );
}

/** Áreas válidas, expuestas para la utilidad de línea de comandos. */
export const AREAS_VALIDAS: Area[] = ["SOCIOS", "CONTABILIDAD", "GERENCIA"];

/** Reexportado para las pruebas. */
export { usuarioDeSesion };
