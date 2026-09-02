import fs from "node:fs";
import path from "node:path";

import { nombreDocumento } from "../../../src/domain/documentos";
import type { ConfirmacionSafi, SolicitudAfiliacion } from "../../../src/domain/solicitud";
import { tieneCuentaPropia } from "../../../src/domain/tiposMiembro";
import { config } from "../config";
import type { ArchivoExpediente } from "../db/archivos";
import { solicitudPorNumeroSocio } from "../db/solicitudes";
import { CAMPOS_CUENTA, CAMPOS_SOCIO, MODULOS } from "./campos";
import { ClienteApi, ClienteFormulario, type CampoDescrito } from "./cliente";
import { camposCuenta, camposSocio, nombreCuenta } from "./registro";

/**
 * Publicación del expediente en el CRM de SAFI.
 *
 * El contrato quedó determinado el 26 de agosto de 2026 navegando la
 * instalación del Club y creando registros de prueba: SAFI es un vTiger 7, sus
 * módulos son `Accounts` (Cuenta), `Contacts` (Socio) y `Documents`, y un
 * documento se sube y se relaciona con la Cuenta en una sola petición. El
 * detalle está en `SAFI-INTEGRACION.md`.
 *
 * Los documentos se publican **contra la Cuenta del socio titular**, que es la
 * unidad que agrupa a la familia, igual que la carpeta del repositorio digital.
 * SAFI tiene una sola carpeta de documentos, así que el título es lo único que
 * identifica cada archivo: se usa el mismo nombre canónico del repositorio.
 */

export type ResultadoPublicacion =
  | { ok: true; referencia?: string }
  | { ok: false; mensaje: string; reintentable: boolean };

/** Alta de una persona en el CRM: su ficha de Socio y, si es titular, su Cuenta. */
export type ResultadoAlta =
  | { ok: true; cuentaId: string; socioId: string }
  | { ok: false; mensaje: string };

export type EntradaAlta = {
  solicitud: SolicitudAfiliacion;
  confirmacion: ConfirmacionSafi;
  /**
   * Cuenta a la que se cuelga la ficha. En un titular se crea aquí mismo; en un
   * dependiente es la Cuenta de su titular, que ya debe existir.
   */
  cuentaId: string | null;
};

/**
 * Listas de valores del CRM, leídas en vivo con `operation=describe`.
 *
 * Es lo que evita mantener a mano un catálogo que solo vive en SAFI. Cuando no
 * se pueden leer —modo manual, o el CRM no responde— el panel usa el catálogo
 * de respaldo de `campos.ts`.
 */
export type ListasSafi = {
  grupoFacturacion: string[];
  formaPago: string[];
  tipoContribuyente: string[];
  suscripcion: string[];
  cuotaAnual: string[];
  cuotaMensual: string[];
  valorMembresia: string[];
  tipoSocio: string[];
};

export interface AdaptadorSafi {
  readonly modo: "MANUAL" | "HTTP" | "API";
  publicar(archivo: ArchivoExpediente): Promise<ResultadoPublicacion>;
  /** Crea la Cuenta —cuando corresponde— y la ficha del Socio. */
  darDeAlta(entrada: EntradaAlta): Promise<ResultadoAlta>;
  /** Listas vivas del CRM, o `null` si no se pueden consultar. */
  listas(): Promise<ListasSafi | null>;
}

/** Tipos de contenido admitidos por el repositorio, por extensión. */
const TIPOS: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

/* ------------------------------------------------------------------ */
/* Modo manual                                                         */
/* ------------------------------------------------------------------ */

/**
 * No intenta ninguna llamada: deja constancia de que el documento está listo y
 * pendiente de carga manual, que es lo que la bandeja muestra al Área de
 * Socios mientras la integración no esté habilitada.
 */
class AdaptadorManual implements AdaptadorSafi {
  readonly modo = "MANUAL" as const;

  async publicar(archivo: ArchivoExpediente): Promise<ResultadoPublicacion> {
    return {
      ok: false,
      reintentable: false,
      mensaje:
        `Pendiente de cargar manualmente en SAFI: ${nombreDocumento(archivo.tipoDocumento)} ` +
        `del socio ${archivo.numeroSocio}. El archivo está en el repositorio, en ${path.basename(
          path.dirname(archivo.ruta)
        )}/${archivo.nombreArchivo}.`,
    };
  }

  /**
   * Sin integración habilitada el alta la hace una persona en el CRM. La
   * confirmación se guarda igual —es la constancia de qué valores se
   * acordaron— y la bandeja los muestra para que se transcriban tal cual.
   */
  async darDeAlta(): Promise<ResultadoAlta> {
    return {
      ok: false,
      mensaje:
        "La integración con SAFI no está habilitada (SAFI_MODO=MANUAL). Cree el socio en el CRM " +
        "con los valores confirmados y registre aquí el número que le asignó.",
    };
  }

  async listas(): Promise<ListasSafi | null> {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Publicación real                                                    */
/* ------------------------------------------------------------------ */

class AdaptadorConectado implements AdaptadorSafi {
  readonly modo: "HTTP" | "API";
  private readonly formulario = new ClienteFormulario();
  private readonly api = new ClienteApi();

  /** Cuentas de SAFI ya localizadas, por número de socio. */
  private readonly cuentas = new Map<string, string>();

  constructor(modo: "HTTP" | "API") {
    this.modo = modo;
  }

  /**
   * Localiza la Cuenta del socio titular en SAFI.
   *
   * PENDIENTE: hoy se toma del expediente local, donde el Área de Socios anota
   * el identificador que SAFI asignó. Cuando la creación del socio se haga
   * también desde la aplicación, ese identificador quedará guardado al crear la
   * Cuenta y esta búsqueda dejará de hacer falta.
   */
  private async cuentaDe(numeroSocio: string): Promise<string | null> {
    const enCache = this.cuentas.get(numeroSocio);
    if (enCache) return enCache;

    const solicitud = solicitudPorNumeroSocio(numeroSocio);
    const id = solicitud?.expediente.cuentaSafiId ?? null;
    if (id) this.cuentas.set(numeroSocio, id);
    return id;
  }

  async publicar(archivo: ArchivoExpediente): Promise<ResultadoPublicacion> {
    try {
      const cuentaId = await this.cuentaDe(archivo.numeroSocio);
      if (!cuentaId) {
        return {
          ok: false,
          reintentable: false,
          mensaje:
            `No se conoce la Cuenta de SAFI del socio ${archivo.numeroSocio}. ` +
            "Regístrela desde el Área de Socios para que el expediente pueda publicarse.",
        };
      }

      if (!fs.existsSync(archivo.ruta)) {
        return { ok: false, reintentable: false, mensaje: "El archivo ya no está en el repositorio." };
      }

      const extension = path.extname(archivo.nombreArchivo).toLowerCase();
      const resultado = await this.formulario.subirDocumento({
        cuentaId,
        // El nombre canónico del repositorio es también el título en SAFI: es
        // lo único que identifica al documento dentro de la carpeta única.
        titulo: path.basename(archivo.nombreArchivo, extension),
        nombreArchivo: archivo.nombreArchivo,
        contenido: fs.readFileSync(archivo.ruta),
        tipoContenido: TIPOS[extension] ?? "application/octet-stream",
        nota: `${nombreDocumento(archivo.tipoDocumento)} · publicado por la aplicación de afiliación.`,
      });

      return resultado.ok
        ? { ok: true, referencia: resultado.id }
        : { ok: false, mensaje: resultado.mensaje, reintentable: resultado.reintentable };
    } catch (error) {
      return {
        ok: false,
        reintentable: true,
        mensaje: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async crear(modulo: string, campos: Record<string, string>) {
    return this.modo === "API"
      ? this.api.crear(modulo, campos)
      : this.formulario.crear(modulo, campos);
  }

  /**
   * Crea la Cuenta —solo si la persona es titular— y su ficha de Socio.
   *
   * El orden importa: la ficha del Socio lleva el identificador de la Cuenta en
   * `account_id`, así que la Cuenta va primero. Si la Cuenta se crea y el Socio
   * falla, la Cuenta queda creada y se devuelve su identificador en el mensaje
   * para que el reintento la reutilice en lugar de duplicarla.
   */
  async darDeAlta({ solicitud, confirmacion, cuentaId }: EntradaAlta): Promise<ResultadoAlta> {
    // En modo API los registros se asignan con el identificador de servicio web
    // del usuario de la integración (`19x1`), que devuelve el propio login.
    const asignadoA = this.modo === "API" ? this.api.asignadoA ?? "" : "";
    const esTitular = tieneCuentaPropia(solicitud.datos.tipoMiembro);

    let cuenta = cuentaId;

    if (esTitular && !cuenta) {
      const creada = await this.crear(
        MODULOS.cuenta,
        camposCuenta(solicitud, confirmacion, asignadoA)
      );
      if (!creada.ok) {
        return { ok: false, mensaje: `No se pudo crear la Cuenta en SAFI: ${creada.mensaje}` };
      }
      cuenta = creada.id;
      this.cuentas.set(solicitud.tramite.numeroSocio, cuenta);
    }

    if (!cuenta) {
      return {
        ok: false,
        mensaje:
          "No se conoce la Cuenta del socio titular en SAFI. Cree primero al titular para que sus " +
          "dependientes puedan colgarse de la misma Cuenta.",
      };
    }

    const socio = await this.crear(
      MODULOS.socio,
      camposSocio(solicitud, confirmacion, {
        cuentaId: cuenta,
        cuentaNombre: nombreCuenta(solicitud),
        asignadoA,
      })
    );

    if (!socio.ok) {
      return {
        ok: false,
        mensaje:
          `La Cuenta ${cuenta} quedó creada, pero SAFI rechazó la ficha del Socio: ${socio.mensaje}` +
          " Corrija el dato y vuelva a confirmar: se reutilizará esa misma Cuenta.",
      };
    }

    return { ok: true, cuentaId: cuenta, socioId: socio.id };
  }

  /**
   * Listas de valores tal como las tiene el CRM ahora mismo.
   *
   * Solo el modo API puede leerlas: `operation=describe` no tiene equivalente
   * replicando el formulario HTML.
   */
  async listas(): Promise<ListasSafi | null> {
    if (this.modo !== "API") return null;

    const [cuenta, socio] = await Promise.all([
      this.api.describir(MODULOS.cuenta),
      this.api.describir(MODULOS.socio),
    ]);
    if (!cuenta && !socio) return null;

    const opciones = (campos: CampoDescrito[] | null, nombre: string): string[] =>
      campos?.find((campo) => campo.name === nombre)?.opciones ?? [];

    return {
      grupoFacturacion: opciones(cuenta, CAMPOS_CUENTA.grupoFacturacion),
      formaPago: opciones(cuenta, CAMPOS_CUENTA.formaPago),
      tipoContribuyente: opciones(cuenta, CAMPOS_CUENTA.tipoContribuyente),
      suscripcion: opciones(socio, CAMPOS_SOCIO.suscripcion),
      cuotaAnual: opciones(socio, CAMPOS_SOCIO.cuotaAnual),
      cuotaMensual: opciones(socio, CAMPOS_SOCIO.cuotaMensual),
      valorMembresia: opciones(socio, CAMPOS_SOCIO.valorMembresia),
      tipoSocio: opciones(socio, CAMPOS_SOCIO.tipoSocio),
    };
  }
}

let instancia: AdaptadorSafi | null = null;

export function adaptadorSafi(): AdaptadorSafi {
  if (!instancia) {
    instancia =
      config.safiModo === "HTTP" || config.safiModo === "API"
        ? new AdaptadorConectado(config.safiModo)
        : new AdaptadorManual();
  }
  return instancia;
}
