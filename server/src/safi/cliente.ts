import crypto from "node:crypto";

import { config } from "../config";
import { CAMPOS_DOCUMENTO, CARPETA_POR_DEFECTO, MODULOS } from "./campos";

/**
 * Cliente del CRM de SAFI.
 *
 * SAFI es un vTiger 7. Hay dos formas de escribir en él y aquí están las dos,
 * porque cada una sirve en un momento distinto:
 *
 * `FORMULARIO` — replica la petición que envía el propio navegador al guardar.
 *   Es la que se verificó de extremo a extremo el 26 de agosto de 2026,
 *   creando una Cuenta, un Socio y un Documento reales (ver
 *   `SAFI-INTEGRACION.md`). Necesita usuario y contraseña, y leer el token
 *   anti-CSRF del formulario antes de cada envío.
 *
 * `API` — usa `webservice.php`, la interfaz REST propia de vTiger. **Es el modo
 *   con el que se trabaja.** No depende del HTML ni del token anti-CSRF, y
 *   permite además leer del propio CRM las listas de valores con
 *   `operation=describe`. Necesita la **clave de acceso** del usuario, que se
 *   obtiene en Mis Preferencias del CRM.
 *
 * `FORMULARIO` queda como plan B para el caso de que el servicio web esté
 * deshabilitado en la instalación.
 */

export type ResultadoCreacion = { ok: true; id: string } | { ok: false; mensaje: string; reintentable: boolean };

function urlBase(): string {
  return config.safiBaseUrl.replace(/\/+$/, "");
}

/* ------------------------------------------------------------------ */
/* Modo FORMULARIO — verificado                                        */
/* ------------------------------------------------------------------ */

export class ClienteFormulario {
  private cookies: string | null = null;

  /** Inicia sesión en la pantalla clásica del CRM y guarda la cookie. */
  private async autenticar(): Promise<void> {
    const cuerpo = new URLSearchParams({
      module: "Users",
      action: "Login",
      username: config.safiUsuario,
      password: config.safiClave,
    });

    const respuesta = await fetch(`${urlBase()}/index.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: cuerpo.toString(),
      redirect: "manual",
    });

    const galletas = respuesta.headers.getSetCookie?.() ?? [];
    if (galletas.length === 0) {
      throw new Error("SAFI no devolvió sesión: revise el usuario y la contraseña.");
    }
    this.cookies = galletas.map((c) => c.split(";")[0]).join("; ");
  }

  private async conSesion<T>(accion: () => Promise<T>): Promise<T> {
    if (!this.cookies) await this.autenticar();
    return accion();
  }

  private cabeceras(extra: Record<string, string> = {}): Record<string, string> {
    return this.cookies ? { Cookie: this.cookies, ...extra } : extra;
  }

  /**
   * Obtiene el token anti-CSRF del formulario de creación.
   *
   * vTiger lo renueva y lo exige en cada envío, así que hay que pedirlo justo
   * antes de guardar; guardarlo entre peticiones no funciona.
   */
  private async token(modulo: string, extraUrl = ""): Promise<{ token: string; usuario: string }> {
    const respuesta = await fetch(
      `${urlBase()}/index.php?module=${modulo}&view=Edit${extraUrl}`,
      { headers: this.cabeceras() }
    );
    const html = await respuesta.text();

    const token = /name="__vtrftk"[^>]*value="([^"]+)"/.exec(html)?.[1];
    if (!token) {
      // Sin token es que la sesión caducó y vTiger devolvió la pantalla de acceso.
      this.cookies = null;
      throw new Error("La sesión en SAFI caducó.");
    }

    const usuario = /name="assigned_user_id"[^>]*>[\s\S]*?<option[^>]*selected[^>]*value="(\d+)"/.exec(html)?.[1] ?? "1";
    return { token, usuario };
  }

  /** Crea un registro en un módulo y devuelve su identificador. */
  async crear(modulo: string, campos: Record<string, string>): Promise<ResultadoCreacion> {
    return this.conSesion(async () => {
      const { token, usuario } = await this.token(modulo);

      const cuerpo = new URLSearchParams({
        __vtrftk: token,
        module: modulo,
        action: "Save",
        record: "",
        assigned_user_id: campos.assigned_user_id ?? usuario,
        ...campos,
      });

      const respuesta = await fetch(`${urlBase()}/index.php`, {
        method: "POST",
        headers: this.cabeceras({ "Content-Type": "application/x-www-form-urlencoded" }),
        body: cuerpo.toString(),
      });

      return this.leerRespuesta(respuesta);
    });
  }

  /**
   * Sube un documento y lo relaciona con la Cuenta en el mismo guardado.
   *
   * Los tres campos `relationOperation`, `sourceModule` y `sourceRecord` son los
   * que crean la relación: sin ellos el documento queda suelto y haría falta una
   * segunda petición para vincularlo.
   */
  async subirDocumento(entrada: {
    cuentaId: string;
    titulo: string;
    nombreArchivo: string;
    contenido: Buffer;
    tipoContenido: string;
    nota?: string;
  }): Promise<ResultadoCreacion> {
    return this.conSesion(async () => {
      const contexto = `&relationOperation=true&sourceModule=${MODULOS.cuenta}&sourceRecord=${entrada.cuentaId}`;
      const { token, usuario } = await this.token(MODULOS.documento, contexto);

      const formulario = new FormData();
      formulario.append("__vtrftk", token);
      formulario.append("module", MODULOS.documento);
      formulario.append("action", "Save");
      formulario.append("record", "");
      formulario.append(CAMPOS_DOCUMENTO.asignadoA, usuario);
      formulario.append(CAMPOS_DOCUMENTO.titulo, entrada.titulo);
      formulario.append(CAMPOS_DOCUMENTO.carpeta, CARPETA_POR_DEFECTO);
      formulario.append(CAMPOS_DOCUMENTO.tipoUbicacion, "I");
      formulario.append(CAMPOS_DOCUMENTO.estado, "on");
      if (entrada.nota) formulario.append(CAMPOS_DOCUMENTO.nota, entrada.nota);
      formulario.append(
        CAMPOS_DOCUMENTO.archivo,
        new Blob([new Uint8Array(entrada.contenido)], { type: entrada.tipoContenido }),
        entrada.nombreArchivo
      );
      formulario.append("relationOperation", "true");
      formulario.append("sourceModule", MODULOS.cuenta);
      formulario.append("sourceRecord", entrada.cuentaId);

      const respuesta = await fetch(`${urlBase()}/index.php`, {
        method: "POST",
        headers: this.cabeceras(),
        body: formulario,
      });

      // En una operación relacionada vTiger devuelve al registro de origen, así
      // que el identificador de la respuesta es el de la Cuenta, no el del
      // documento. Que la petición llegue a la vista de detalle basta para saber
      // que se guardó.
      const resultado = await this.leerRespuesta(respuesta);
      return resultado.ok ? { ok: true, id: entrada.cuentaId } : resultado;
    });
  }

  private async leerRespuesta(respuesta: Response): Promise<ResultadoCreacion> {
    await respuesta.text();

    if (respuesta.status === 401 || respuesta.status === 403) {
      this.cookies = null;
      return { ok: false, mensaje: "La sesión en SAFI caducó.", reintentable: true };
    }
    if (!respuesta.ok) {
      return {
        ok: false,
        mensaje: `SAFI respondió HTTP ${respuesta.status}.`,
        reintentable: respuesta.status >= 500,
      };
    }

    const destino = new URL(respuesta.url);
    const id = destino.searchParams.get("record");
    if (destino.searchParams.get("view") !== "Detail" || !id) {
      return {
        ok: false,
        mensaje: "SAFI no confirmó el guardado: revise los campos obligatorios.",
        reintentable: false,
      };
    }

    return { ok: true, id };
  }
}

/* ------------------------------------------------------------------ */
/* Modo API — el modo de trabajo                                       */
/* ------------------------------------------------------------------ */

/**
 * Cliente de `webservice.php`, la API REST de vTiger. Es el modo de trabajo
 * elegido para la integración.
 *
 * Tres detalles del protocolo que no se ven en la documentación y que cuestan
 * una tarde si se descubren por ensayo y error:
 *
 * 1. **La dirección lleva puerto.** El CRM del Club escucha en el 8080, así que
 *    `SAFI_BASE_URL` es `http://192.168.2.100:8080/saficrm_clubcampina_75`.
 *    Pedirle `getchallenge` al puerto 80 no devuelve error: no devuelve nada.
 *
 * 2. **`accessKey` no es la contraseña**, sino el md5 del token del saludo
 *    concatenado con la *clave de acceso* del usuario, la que está en el CRM
 *    bajo Mis Preferencias → Detalles del usuario → Access Key.
 *
 * 3. **`assigned_user_id` viaja como identificador de servicio web** con la
 *    forma `19x1`, no como el número suelto que usa el formulario HTML. El
 *    propio `login` lo devuelve en `userId`, así que se guarda de ahí en lugar
 *    de construirlo a mano.
 */

/** Un campo de un módulo, tal como lo describe `operation=describe`. */
export type CampoDescrito = {
  name: string;
  label: string;
  mandatory: boolean;
  /** Valores admitidos, cuando el campo es una lista cerrada. */
  opciones: string[];
};

type RespuestaApi<T> = {
  success: boolean;
  result?: T;
  error?: { code: string; message: string };
};

export class ClienteApi {
  private sesion: string | null = null;
  /** Identificador de servicio web del usuario de la integración (`19x1`). */
  private usuarioId: string | null = null;

  /** Identificador con el que asignar los registros que se creen. */
  get asignadoA(): string | null {
    return this.usuarioId;
  }

  private async pedir<T>(cuerpo: Record<string, string>): Promise<RespuestaApi<T>> {
    const respuesta = await fetch(`${urlBase()}/webservice.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(cuerpo).toString(),
    });
    return leerJson<T>(respuesta);
  }

  private async abrirSesion(): Promise<void> {
    const saludo = await fetch(
      `${urlBase()}/webservice.php?operation=getchallenge&username=${encodeURIComponent(
        config.safiUsuario
      )}`
    );
    const datosSaludo = await leerJson<{ token: string }>(saludo);
    if (!datosSaludo.success || !datosSaludo.result?.token) {
      throw new Error(
        datosSaludo.error?.message ??
          "SAFI no entregó el token inicial. Compruebe que SAFI_BASE_URL incluya el puerto (:8080) y que el usuario exista."
      );
    }

    // vTiger espera el md5 del token concatenado con la clave de acceso.
    const firma = crypto
      .createHash("md5")
      .update(datosSaludo.result.token + config.safiClave)
      .digest("hex");

    const acceso = await this.pedir<{ sessionName: string; userId: string }>({
      operation: "login",
      username: config.safiUsuario,
      accessKey: firma,
    });

    if (!acceso.success || !acceso.result?.sessionName) {
      throw new Error(
        acceso.error?.message ??
          "SAFI rechazó la clave de acceso. Recuerde que es la Access Key del usuario, no su contraseña."
      );
    }

    this.sesion = acceso.result.sessionName;
    this.usuarioId = acceso.result.userId ?? null;
  }

  private async conSesion<T>(accion: () => Promise<RespuestaApi<T>>): Promise<RespuestaApi<T>> {
    if (!this.sesion) await this.abrirSesion();

    const primera = await accion();
    // Una sesión vencida se renueva y se reintenta una sola vez: repetir en
    // bucle ante un rechazo que no es de sesión solo multiplicaría el fallo.
    if (primera.success || primera.error?.code !== "INVALID_SESSIONID") return primera;

    this.sesion = null;
    await this.abrirSesion();
    return accion();
  }

  /**
   * Campos de un módulo con sus listas de valores, tal como los tiene el CRM
   * ahora mismo.
   *
   * Es lo que evita mantener a mano un catálogo que solo vive en SAFI: el panel
   * del Área de Socios ofrece las opciones que el CRM admite hoy, no las que
   * admitía el día del levantamiento.
   */
  async describir(modulo: string): Promise<CampoDescrito[] | null> {
    try {
      const datos = await this.conSesion<{
        fields?: {
          name: string;
          label: string;
          mandatory: boolean;
          type?: { name?: string; picklistValues?: { label?: string; value?: string }[] };
        }[];
      }>(() =>
        this.pedir({ operation: "describe", sessionName: this.sesion!, elementType: modulo })
      );

      if (!datos.success || !datos.result?.fields) return null;

      return datos.result.fields.map((campo) => ({
        name: campo.name,
        label: campo.label,
        mandatory: Boolean(campo.mandatory),
        opciones: (campo.type?.picklistValues ?? [])
          .map((opcion) => opcion.value ?? opcion.label ?? "")
          .filter(Boolean),
      }));
    } catch {
      // Sin conexión al CRM el panel usa su catálogo de respaldo.
      return null;
    }
  }

  async crear(modulo: string, campos: Record<string, string>): Promise<ResultadoCreacion> {
    try {
      const datos = await this.conSesion<{ id: string }>(() =>
        this.pedir({
          operation: "create",
          sessionName: this.sesion!,
          elementType: modulo,
          element: JSON.stringify(campos),
        })
      );

      if (!datos.success) {
        const caducada = datos.error?.code === "INVALID_SESSIONID";
        if (caducada) this.sesion = null;
        return {
          ok: false,
          mensaje: datos.error?.message ?? "SAFI rechazó la creación.",
          reintentable: caducada,
        };
      }

      // vTiger devuelve el id como `moduloId x registroId`; interesa el segundo.
      const id = (datos.result?.id ?? "").split("x").pop() ?? "";
      return { ok: true, id };
    } catch (error) {
      return {
        ok: false,
        mensaje: error instanceof Error ? error.message : String(error),
        reintentable: true,
      };
    }
  }
}

/**
 * Lee la respuesta de `webservice.php` sin dar por hecho que es JSON.
 *
 * Cuando la dirección apunta al puerto equivocado o a una ruta que no existe, el
 * servidor devuelve una página HTML —o nada— y `respuesta.json()` falla con
 * «Unexpected token <», que no dice qué pasó. Aquí se convierte en un mensaje
 * que sí lo dice.
 */
async function leerJson<T>(respuesta: Response): Promise<RespuestaApi<T>> {
  const texto = await respuesta.text();

  if (!texto.trim()) {
    return {
      success: false,
      error: {
        code: "SIN_RESPUESTA",
        message: `SAFI no devolvió contenido (HTTP ${respuesta.status}). Compruebe la dirección y el puerto.`,
      },
    };
  }

  try {
    return JSON.parse(texto) as RespuestaApi<T>;
  } catch {
    return {
      success: false,
      error: {
        code: "RESPUESTA_NO_JSON",
        message:
          `SAFI respondió con algo que no es JSON (HTTP ${respuesta.status}). ` +
          "Suele significar que la dirección no apunta a webservice.php o que falta el puerto.",
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/* Diagnóstico                                                         */
/* ------------------------------------------------------------------ */

export type PasoDiagnostico = {
  paso: string;
  ok: boolean;
  detalle: string;
};

/**
 * Comprueba la conexión con SAFI paso a paso y dice en cuál falla.
 *
 * Existe porque un `getchallenge` que no responde admite media docena de causas
 * —puerto, ruta, usuario, servicio web deshabilitado— y desde fuera todas se
 * parecen: la petición simplemente no devuelve nada. Cada paso de aquí descarta
 * una.
 */
export async function diagnosticarSafi(): Promise<PasoDiagnostico[]> {
  const pasos: PasoDiagnostico[] = [];
  const base = urlBase();

  if (!base) {
    pasos.push({
      paso: "Configuración",
      ok: false,
      detalle: "Falta SAFI_BASE_URL en server/.env.",
    });
    return pasos;
  }

  let direccion: URL;
  try {
    direccion = new URL(base);
  } catch {
    pasos.push({ paso: "Configuración", ok: false, detalle: `SAFI_BASE_URL no es una dirección válida: ${base}` });
    return pasos;
  }

  // El CRM del Club escucha en el 8080. Sin puerto explícito la petición se va
  // al 80, donde no hay nada: es el error más fácil de cometer y el más difícil
  // de ver, porque no devuelve ningún mensaje.
  const puerto = direccion.port;
  pasos.push({
    paso: "Dirección",
    ok: Boolean(puerto),
    detalle: puerto
      ? `${base} (puerto ${puerto})`
      : `${base} — no lleva puerto, así que la petición irá al ${
          direccion.protocol === "https:" ? "443" : "80"
        }. El CRM del Club escucha en el 8080.`,
  });

  if (!config.safiUsuario || !config.safiClave) {
    pasos.push({
      paso: "Credenciales",
      ok: false,
      detalle: "Faltan SAFI_USUARIO o SAFI_CLAVE en server/.env.",
    });
    return pasos;
  }

  let token = "";
  try {
    const saludo = await fetch(
      `${base}/webservice.php?operation=getchallenge&username=${encodeURIComponent(config.safiUsuario)}`
    );
    const datos = await leerJson<{ token: string }>(saludo);
    token = datos.result?.token ?? "";
    pasos.push({
      paso: "Saludo (getchallenge)",
      ok: Boolean(token),
      detalle: token
        ? `El servicio web responde y entregó un token para ${config.safiUsuario}.`
        : datos.error?.message ?? "SAFI no entregó token.",
    });
  } catch (error) {
    pasos.push({
      paso: "Saludo (getchallenge)",
      ok: false,
      detalle: `No se pudo contactar al CRM: ${error instanceof Error ? error.message : String(error)}`,
    });
    return pasos;
  }

  if (!token) return pasos;

  try {
    const firma = crypto.createHash("md5").update(token + config.safiClave).digest("hex");
    const acceso = await fetch(`${base}/webservice.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        operation: "login",
        username: config.safiUsuario,
        accessKey: firma,
      }).toString(),
    });
    const datos = await leerJson<{ sessionName: string; userId: string }>(acceso);
    pasos.push({
      paso: "Acceso (login)",
      ok: Boolean(datos.result?.sessionName),
      detalle: datos.result?.sessionName
        ? `Sesión abierta. El usuario de la integración es ${datos.result.userId} en el CRM.`
        : datos.error?.message ??
          "SAFI rechazó la clave. Recuerde que es la Access Key del usuario, no su contraseña.",
    });
  } catch (error) {
    pasos.push({
      paso: "Acceso (login)",
      ok: false,
      detalle: error instanceof Error ? error.message : String(error),
    });
  }

  return pasos;
}
