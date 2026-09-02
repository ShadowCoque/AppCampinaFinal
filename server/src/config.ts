import path from "node:path";

/**
 * Configuración del servidor, tomada del entorno.
 *
 * Todos los valores tienen un valor por defecto razonable para el despliegue en
 * contenedor descrito en `server/README.md`, salvo el secreto de sesión, que
 * debe fijarse explícitamente en producción.
 */

function texto(clave: string, porDefecto: string): string {
  const valor = process.env[clave];
  return valor && valor.trim() ? valor.trim() : porDefecto;
}

function entero(clave: string, porDefecto: number): number {
  const valor = Number(process.env[clave]);
  return Number.isFinite(valor) && valor > 0 ? Math.trunc(valor) : porDefecto;
}

const enProduccion = texto("NODE_ENV", "production") === "production";

/** Directorio de datos: base SQLite, expedientes y respaldos. */
const datosDir = texto("DATOS_DIR", "/datos");

const urlPublica = texto("URL_PUBLICA", "http://localhost:8080");

/**
 * Si la bandeja se publica sobre TLS.
 *
 * Se deduce del protocolo de `URL_PUBLICA` y no de `NODE_ENV`: el modo de
 * ejecución (producción o desarrollo) y el hecho de que el tráfico vaya
 * cifrado son dos preguntas distintas. El Club tiene servidores en producción
 * sin certificado —redes internas detrás de su propio perímetro, como el que
 * hoy sirve GLPI—, y ahí una cookie marcada `Secure` no viajaría nunca: el
 * navegador la descarta silenciosamente y el inicio de sesión de la bandeja
 * fallaría sin ningún mensaje de error que lo explique.
 */
const usaTls = (() => {
  try {
    return new URL(urlPublica).protocol === "https:";
  } catch {
    return false;
  }
})();

export const config = {
  entorno: enProduccion ? "production" : "development",
  /** Si `URL_PUBLICA` es `https://`. Gobierna la cookie `Secure` y HSTS. */
  usaTls,
  /**
   * Si el servidor debe fiarse de `X-Forwarded-For` para saber la IP real de
   * quien llama.
   *
   * Solo es seguro activarlo cuando, de verdad, hay un proxy inverso propio
   * delante que sobrescribe esa cabecera y el contenedor no es alcanzable de
   * ningún otro modo desde la red. Si el contenedor publica su puerto
   * directamente en la LAN —caso frecuente en un servidor interno sin
   * proxy—, cualquier equipo de la red podría escribir el `X-Forwarded-For`
   * que quisiera y saltarse el límite de intentos de acceso por IP
   * (`http/intentos.ts`). Por eso el valor por defecto es `false`: sin
   * confirmarlo, es más seguro usar la IP real de la conexión.
   */
  confiarProxy: texto("TRUST_PROXY", "false") === "true",
  puerto: entero("PUERTO", 8080),
  /** Interfaz de escucha. En contenedor debe ser 0.0.0.0. */
  host: texto("HOST", "0.0.0.0"),

  /** URL pública desde la que se sirve la bandeja de tareas. */
  urlPublica,

  datosDir,
  /** Base de datos SQLite. Un solo archivo: respaldarla es copiarla. */
  baseDatos: path.join(datosDir, "campina.db"),
  /** Repositorio digital de expedientes, organizado por socio. */
  expedientesDir: texto("EXPEDIENTES_DIR", path.join(datosDir, "expedientes")),

  /**
   * Carpeta compartida (SMB) donde la Jefatura de Socios deposita los escaneos.
   * El servidor solo lee de aquí y mueve lo que reconoce al repositorio.
   */
  escaneosDir: texto("ESCANEOS_DIR", "/escaneos"),
  /** Subcarpeta a la que van los archivos con nombre no reconocido. */
  escaneosRevisarDir: texto("ESCANEOS_REVISAR_DIR", "/escaneos/_REVISAR"),
  /** Cada cuántos segundos se recorre la carpeta compartida. */
  intervaloVigilanciaSeg: entero("INTERVALO_VIGILANCIA_SEG", 30),

  /** Secreto para firmar la cookie de sesión. */
  secretoSesion: texto("SECRETO_SESION", enProduccion ? "" : "desarrollo-no-usar-en-produccion"),
  /** Duración de la sesión, en horas. */
  horasSesion: entero("HORAS_SESION", 10),

  /**
   * Modo de publicación en el CRM de SAFI.
   *
   *   API    — usa webservice.php, la interfaz REST de vTiger. **Es el modo de
   *            trabajo.** Exige SAFI_CLAVE con la CLAVE DE ACCESO del usuario,
   *            no su contraseña (Mis Preferencias del CRM).
   *   HTTP   — plan B: replica la petición que envía el propio navegador al
   *            guardar, por si el servicio web estuviera deshabilitado.
   *            Verificado de extremo a extremo el 26 de agosto de 2026.
   *   MANUAL — sin integración. El servidor deja el expediente listo y lo
   *            reporta como pendiente de carga en la bandeja del Área de
   *            Socios. Es el valor por defecto porque un despliegue sin
   *            credenciales debe arrancar igual, no quedarse abajo.
   */
  safiModo: texto("SAFI_MODO", "MANUAL") as "MANUAL" | "HTTP" | "API",
  safiBaseUrl: texto("SAFI_BASE_URL", ""),
  safiUsuario: texto("SAFI_USUARIO", ""),
  safiClave: texto("SAFI_CLAVE", ""),
  /** Cada cuántos segundos se reintenta la cola de publicación en SAFI. */
  intervaloSafiSeg: entero("INTERVALO_SAFI_SEG", 120),

  /** Tamaño máximo por archivo subido desde la aplicación móvil, en MB. */
  maxArchivoMb: entero("MAX_ARCHIVO_MB", 25),
} as const;

/** Comprueba la configuración mínima antes de arrancar. */
export function validarConfig(): string[] {
  const problemas: string[] = [];

  if (!config.secretoSesion) {
    problemas.push(
      "Falta SECRETO_SESION. Genere uno con: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  } else if (config.secretoSesion.length < 32) {
    problemas.push("SECRETO_SESION debe tener al menos 32 caracteres.");
  }

  if (config.safiModo !== "MANUAL") {
    if (!config.safiBaseUrl) {
      problemas.push(`SAFI_MODO=${config.safiModo} exige SAFI_BASE_URL.`);
    } else {
      problemas.push(...revisarUrlSafi(config.safiBaseUrl));
    }
    if (!config.safiUsuario || !config.safiClave) {
      problemas.push(
        `SAFI_MODO=${config.safiModo} exige SAFI_USUARIO y SAFI_CLAVE.`
      );
    }
  }

  return problemas;
}

/**
 * Revisa la dirección del CRM antes de arrancar.
 *
 * El CRM del Club escucha en el 8080. Una dirección sin puerto no falla al
 * configurarse: falla en la primera petición, y de la peor manera posible,
 * porque `webservice.php` no responde nada en lugar de devolver un error. Vale
 * la pena decirlo al arrancar y no descubrirlo con la primera afiliación.
 */
function revisarUrlSafi(valor: string): string[] {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return [`SAFI_BASE_URL no es una dirección válida: ${valor}`];
  }

  if (!url.port) {
    return [
      `SAFI_BASE_URL no lleva puerto (${valor}). El CRM del Club escucha en el 8080: ` +
        `use ${url.protocol}//${url.hostname}:8080${url.pathname.replace(/\/+$/, "")}`,
    ];
  }

  if (url.pathname.replace(/\/+$/, "").endsWith("webservice.php")) {
    return [
      "SAFI_BASE_URL debe ser la raíz de la instalación, sin webservice.php: " +
        "el cliente lo añade a cada petición.",
    ];
  }

  return [];
}
