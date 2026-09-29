import type { FastifyInstance, FastifyReply } from "fastify";

import { registrarBitacora } from "../db/indice";
import { ErrorImportacion } from "../importacion/excel";
import { lotesRecientes, obtenerLote } from "../importacion/lotes";
import {
  descartar,
  iniciarCreacion,
  informeDeLote,
  pedirDetencion,
  plantillaVacia,
  recuperarInterrumpidos,
  revalidar,
  revisarArchivo,
  vistaDeLote,
} from "../importacion/proceso";
import { esModoImportacion, type ModoImportacion } from "../importacion/columnas";
import { adaptadorSafi } from "../safi/adaptador";
import { exigirArea } from "./sesion";

/**
 * Importación de socios oficiales desde Excel, en la bandeja del Área de
 * Socios. Ver `server/src/importacion/proceso.ts`.
 */

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function enviarXlsx(respuesta: FastifyReply, contenido: Buffer, nombre: string) {
  const seguro = nombre.replace(/[^\w .-]+/g, "_");
  return respuesta
    .header("Content-Type", TIPO_XLSX)
    .header("Content-Disposition", `attachment; filename="${seguro}"`)
    .header("Cache-Control", "no-store")
    .send(contenido);
}

/** `?modo=SAFI` o `?modo=FORMULARIO`; sin él, solo SAFI. */
function modoDe(consulta: unknown): ModoImportacion | null {
  const valor = (consulta as { modo?: string } | undefined)?.modo;
  if (valor === undefined || valor === "") return "SAFI";
  return esModoImportacion(valor) ? valor : null;
}

function fallo(respuesta: FastifyReply, error: unknown) {
  if (error instanceof ErrorImportacion) return respuesta.code(409).send({ error: error.message });
  return respuesta.code(500).send({ error: error instanceof Error ? error.message : String(error) });
}

export async function registrarImportacion(app: FastifyInstance): Promise<void> {
  recuperarInterrumpidos();

  /** Lotes recientes y estado de la integración. */
  app.get("/api/importaciones", async (peticion, respuesta) => {
    if (!exigirArea(peticion, respuesta, "SOCIOS")) return respuesta;
    const adaptador = adaptadorSafi();
    return respuesta.send({
      safiModo: adaptador.modo,
      safiEscritura: adaptador.escritura,
      lotes: lotesRecientes(15).map((lote) => vistaDeLote(lote, false)),
    });
  });

  /** Los últimos números de socio titulares creados en SAFI, para elegir desde cuál numerar. */
  app.get("/api/importaciones/numeracion", async (peticion, respuesta) => {
    if (!exigirArea(peticion, respuesta, "SOCIOS")) return respuesta;
    return respuesta.send({ recientes: await adaptadorSafi().titularesRecientes(12) });
  });

  app.get("/api/importaciones/plantilla", async (peticion, respuesta) => {
    if (!exigirArea(peticion, respuesta, "SOCIOS")) return respuesta;
    const modo = modoDe(peticion.query);
    if (!modo) return respuesta.code(400).send({ error: "Importación desconocida." });
    try {
      return enviarXlsx(
        respuesta,
        await plantillaVacia(modo),
        modo === "FORMULARIO"
          ? "Plantilla socios oficiales - con formulario.xlsx"
          : "Plantilla socios oficiales - solo SAFI.xlsx"
      );
    } catch (error) {
      return fallo(respuesta, error);
    }
  });

  /**
   * Sube un archivo y lo revisa. `?modo=FORMULARIO|SAFI` elige la importación;
   * `?desde=2929` numera las filas sin número.
   */
  app.post("/api/importaciones", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;
    const modo = modoDe(peticion.query);
    if (!modo) return respuesta.code(400).send({ error: "Importación desconocida." });

    const parte = await peticion.file();
    if (!parte) return respuesta.code(400).send({ error: "No se recibió ningún archivo." });
    const nombre = (parte.filename ?? "archivo.xlsx").slice(0, 200);
    if (!/\.xlsx$/i.test(nombre)) {
      return respuesta.code(415).send({
        error: /\.(xls|csv|ods)$/i.test(nombre)
          ? "Ese formato no se admite. Ábralo en Excel y use «Guardar como → Libro de Excel (.xlsx)»."
          : "Suba un Libro de Excel (.xlsx), por ejemplo la plantilla de esta pantalla.",
      });
    }

    try {
      const contenido = await parte.toBuffer();
      const desde = (peticion.query as { desde?: string } | undefined)?.desde ?? "";
      const lote = await revisarArchivo({ contenido, nombreArchivo: nombre, numerarDesde: desde, modo, usuario });
      return respuesta.code(201).send({ lote: vistaDeLote(lote) });
    } catch (error) {
      return fallo(respuesta, error);
    }
  });

  app.get("/api/importaciones/:id", async (peticion, respuesta) => {
    if (!exigirArea(peticion, respuesta, "SOCIOS")) return respuesta;
    const lote = obtenerLote((peticion.params as { id: string }).id);
    if (!lote) return respuesta.code(404).send({ error: "Lote no encontrado." });
    return respuesta.send({ lote: vistaDeLote(lote) });
  });

  /** «Volver a comprobar», opcionalmente con otro número de partida. */
  app.post("/api/importaciones/:id/revisar", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;
    const lote = obtenerLote((peticion.params as { id: string }).id);
    if (!lote) return respuesta.code(404).send({ error: "Lote no encontrado." });
    const cuerpo = (peticion.body ?? {}) as { desde?: unknown };
    try {
      const desde = typeof cuerpo.desde === "string" ? cuerpo.desde : undefined;
      return respuesta.send({ lote: vistaDeLote(await revalidar(lote, desde, usuario)) });
    } catch (error) {
      return fallo(respuesta, error);
    }
  });

  app.post("/api/importaciones/:id/crear", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;
    const lote = obtenerLote((peticion.params as { id: string }).id);
    if (!lote) return respuesta.code(404).send({ error: "Lote no encontrado." });
    try {
      return respuesta.code(202).send({ lote: vistaDeLote(iniciarCreacion(lote, usuario)) });
    } catch (error) {
      return fallo(respuesta, error);
    }
  });

  app.post("/api/importaciones/:id/detener", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;
    const lote = obtenerLote((peticion.params as { id: string }).id);
    if (!lote) return respuesta.code(404).send({ error: "Lote no encontrado." });
    try {
      return respuesta.send({ lote: vistaDeLote(pedirDetencion(lote, usuario)) });
    } catch (error) {
      return fallo(respuesta, error);
    }
  });

  app.delete("/api/importaciones/:id", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;
    const lote = obtenerLote((peticion.params as { id: string }).id);
    if (!lote) return respuesta.code(404).send({ error: "Lote no encontrado." });
    try {
      return respuesta.send({ lote: vistaDeLote(descartar(lote, usuario)) });
    } catch (error) {
      return fallo(respuesta, error);
    }
  });

  /** Informe del lote en Excel: resultado de cada fila y las no creadas, para corregir. */
  app.get("/api/importaciones/:id/resultado", async (peticion, respuesta) => {
    const usuario = exigirArea(peticion, respuesta, "SOCIOS");
    if (!usuario) return respuesta;
    const lote = obtenerLote((peticion.params as { id: string }).id);
    if (!lote) return respuesta.code(404).send({ error: "Lote no encontrado." });
    try {
      const contenido = await informeDeLote(lote);
      registrarBitacora({
        usuario: usuario.usuario,
        area: usuario.area,
        accion: "IMPORTACION_INFORME_DESCARGADO",
        entidad: lote.codigo,
      });
      return enviarXlsx(respuesta, contenido, `Resultado ${lote.codigo}.xlsx`);
    } catch (error) {
      return fallo(respuesta, error);
    }
  });
}
