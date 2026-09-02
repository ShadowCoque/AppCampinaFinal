import fs from "node:fs";
import path from "node:path";

import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import estaticos from "@fastify/static";
import Fastify from "fastify";

import { config, validarConfig } from "./config";
import { cerrar, db } from "./db/indice";
import { recalcularAtencion } from "./db/solicitudes";
import { hayUsuarios, purgarSesiones } from "./db/usuarios";
import { iniciarVigilante, detenerVigilante } from "./expediente/vigilante";
import { registrarApi } from "./http/api";
import { detenerColaSafi, iniciarColaSafi } from "./safi/cola";

/**
 * Servidor de afiliación de socios del Club La Campiña.
 *
 * Reúne las tres piezas que el informe CLC-TI-010 sitúa del lado del servidor:
 * la API que consume la aplicación móvil del Área de Socios, la bandeja de
 * tareas web de Contabilidad y Gerencia, y el repositorio digital de
 * expedientes con su vigilante de la carpeta compartida de escaneos.
 */

/**
 * Localiza la carpeta de la bandeja de tareas.
 *
 * La profundidad relativa cambia entre el contenedor (`/app/dist/server/src` →
 * `/app/web`) y la ejecución local desde el repositorio
 * (`<proyecto>/server/dist/server/src` → `<proyecto>/web`), así que se prueban
 * ambas en lugar de fijar una.
 */
function localizarWeb(): string | null {
  const candidatas = [
    process.env.WEB_DIR,
    path.resolve(__dirname, "../../../web"),
    path.resolve(__dirname, "../../../../web"),
  ].filter((ruta): ruta is string => Boolean(ruta));

  return candidatas.find((ruta) => fs.existsSync(path.join(ruta, "index.html"))) ?? null;
}

async function arrancar(): Promise<void> {
  const problemas = validarConfig();
  if (problemas.length > 0) {
    console.error("No se puede arrancar por problemas de configuración:");
    for (const problema of problemas) console.error(`  · ${problema}`);
    process.exit(1);
  }

  // Abrir la base de datos antes de escuchar: si el volumen no está montado,
  // es mejor fallar aquí que aceptar una afiliación y perderla.
  db();

  // Recalcular al arrancar deja la marca de atención coherente tras una
  // migración o tras cualquier intervención manual sobre la base. Es una única
  // pasada al inicio, no un coste por petición.
  const revisadas = recalcularAtencion();
  if (revisadas > 0) console.log(`[base] Estado de atención recalculado en ${revisadas} trámites.`);

  const app = Fastify({
    logger: {
      level: config.entorno === "production" ? "info" : "debug",
      // La bitácora de datos personales vive en la base, no en el log del
      // servidor: aquí no se escriben cédulas ni nombres.
      redact: ["req.headers.cookie", "req.headers.authorization"],
    },
    // Límite del cuerpo JSON. La subida de documentos no pasa por aquí: la
    // gobierna @fastify/multipart con su propio límite, mucho mayor.
    bodyLimit: 2 * 1024 * 1024,
    // Solo se fía de X-Forwarded-For cuando TRUST_PROXY=true, y eso solo debe
    // activarse si de verdad hay un proxy inverso propio delante. Ver
    // `config.confiarProxy`.
    trustProxy: config.confiarProxy,
  });

  await app.register(cookie, { secret: config.secretoSesion });
  await app.register(multipart, {
    limits: {
      fileSize: config.maxArchivoMb * 1024 * 1024,
      files: 1,
      fields: 10,
      fieldSize: 1024,
    },
  });

  /**
   * Cabeceras de seguridad.
   *
   * La bandeja no carga nada de fuera —ni tipografías, ni scripts, ni imágenes
   * externas— porque el servidor vive en la red interna del Club y no debe
   * depender de internet. Declararlo en la política de contenido convierte esa
   * decisión en una defensa: aunque alguna vez se colara texto ajeno en una
   * observación, el navegador no ejecutaría nada.
   */
  app.addHook("onSend", async (_peticion, respuesta) => {
    respuesta.header("X-Content-Type-Options", "nosniff");
    respuesta.header("X-Frame-Options", "DENY");
    respuesta.header("Referrer-Policy", "same-origin");
    respuesta.header("Cross-Origin-Opener-Policy", "same-origin");
    respuesta.header("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
    respuesta.header(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data:",
        "object-src 'self'", // los PDF del expediente se abren en el visor
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "form-action 'self'",
      ].join("; ")
    );
    // HSTS solo tiene sentido, y solo lo respeta el navegador, cuando la
    // conexión ya es TLS: enviarlo sobre HTTP plano no hace nada, pero es una
    // cabecera que promete algo que el servidor no cumple.
    if (config.usaTls) {
      respuesta.header("Strict-Transport-Security", "max-age=15552000");
    }
  });

  const raizWeb = localizarWeb();
  if (raizWeb) {
    await app.register(estaticos, { root: raizWeb, prefix: "/" });
    app.log.info(`Bandeja de tareas servida desde ${raizWeb}`);
  } else {
    app.log.warn("No se encontró la carpeta web; solo se sirve la API.");
  }

  await registrarApi(app);

  if (!hayUsuarios()) {
    app.log.warn(
      "No hay usuarios dados de alta. Cree el primero con: npm run usuario -- crear <usuario> <NOMBRE> <AREA>"
    );
  }

  iniciarVigilante();
  iniciarColaSafi();

  // Limpieza periódica de sesiones vencidas.
  const limpieza = setInterval(() => {
    const purgadas = purgarSesiones();
    if (purgadas > 0) app.log.info(`Sesiones vencidas eliminadas: ${purgadas}`);
  }, 3600_000);

  const cerrarTodo = async (senal: string) => {
    app.log.info(`Recibido ${senal}, cerrando.`);
    clearInterval(limpieza);
    detenerVigilante();
    detenerColaSafi();
    await app.close();
    cerrar();
    process.exit(0);
  };

  process.on("SIGTERM", () => void cerrarTodo("SIGTERM"));
  process.on("SIGINT", () => void cerrarTodo("SIGINT"));

  await app.listen({ port: config.puerto, host: config.host });
  app.log.info(`Bandeja de tareas disponible en ${config.urlPublica}`);
}

void arrancar().catch((error) => {
  console.error("Fallo al arrancar el servidor:", error);
  process.exit(1);
});
