import fs from "node:fs";
import path from "node:path";

import { nombreDocumento } from "../../../src/domain/documentos";
import {
  nombreCompleto,
  nombreTitular,
  type ConfirmacionSafi,
  type OficialDependencia,
  type SolicitudAfiliacion,
} from "../../../src/domain/solicitud";
import { claveComparacion, normalizarNumeroSocio } from "../../../src/domain/texto";
import { tieneCuentaPropia } from "../../../src/domain/tiposMiembro";
import { config } from "../config";
import type { ArchivoExpediente } from "../db/archivos";
import { cuentaSafiDelTitular } from "../db/solicitudes";
import {
  CAMPOS_CUENTA,
  CAMPOS_DOCUMENTO,
  CAMPOS_SOCIO,
  CARPETA_POR_DEFECTO,
  MODULOS,
  TIPO_SOCIO_SAFI,
  secuenciaSafi,
} from "./campos";
import {
  ClienteApi,
  ClienteFormulario,
  OperacionNoDisponible,
  type CampoDescrito,
  type DescripcionModulo,
} from "./cliente";
import { camposCuenta, camposSocio, nombreCuenta, type AvisoSafi } from "./registro";

/**
 * Publicación del expediente en el CRM de SAFI.
 *
 * El contrato quedó determinado el 26 de agosto de 2026 navegando la
 * instalación del Club y creando registros de prueba: SAFI es un vTiger 7, sus
 * módulos son `Accounts` (Cuenta), `Contacts` (Socio) y `Documents`. El detalle
 * está en `SAFI-INTEGRACION.md`.
 *
 * Dos principios, porque SAFI es el sistema en producción del Club:
 *
 *   · **Antes de escribir, se lee.** Ningún alta se intenta sin comprobar en el
 *     propio CRM que el número de socio esté libre, que la cédula no conste ya,
 *     que exista la Cuenta del titular de un dependiente y que todos los
 *     valores de lista que se van a enviar existan allá. Son consultas de solo
 *     lectura y son las que evitan crear un socio duplicado.
 *   · **La escritura se habilita a propósito** (`SAFI_ESCRITURA`). Con la
 *     escritura apagada todo lo demás funciona: el panel propone, comprueba y
 *     guarda la constancia, y el alta la hace una persona en el CRM.
 */

export type ResultadoPublicacion =
  | { ok: true; referencia?: string }
  | { ok: false; mensaje: string; reintentable: boolean };

/** Alta de una persona en el CRM: su ficha de Socio y, si es titular, su Cuenta. */
export type ResultadoAlta =
  | { ok: true; cuentaId: string; socioId: string }
  | {
      ok: false;
      mensaje: string;
      /**
       * Cuenta que sí quedó creada aunque el alta fallara después. Se guarda
       * para que el reintento la reutilice en lugar de crear una segunda.
       */
      cuentaId?: string;
      /** El alta no se intentó porque la escritura está deshabilitada. */
      requiereAltaManual?: boolean;
    };

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

/** Lo que el CRM dice sobre una persona antes de crearla. */
export type VerificacionSafi = {
  /** Se pudo consultar el CRM. Con `false`, los avisos son solo locales. */
  consultado: boolean;
  avisos: AvisoSafi[];
  /** Cuenta del titular encontrada en SAFI, para un dependiente. */
  cuentaTitular?: { id: string; nombre: string } | null;
  /** Siguiente secuencia libre en la cuenta, según las fichas que ya existen. */
  ordinalSugerido?: number | null;
  /** Fichas que el CRM ya tiene con ese número de socio. */
  fichas?: { secuencia: string; nombre: string; cedula: string }[];
};

/**
 * Lo que el CRM dice del oficial FAE del que depende un socio D-A o D-B.
 * `consultado: false` cuando el CRM no se pudo consultar: sin integración por
 * API, sin red o con SAFI caído. Eso no es un «no»: es un «no se sabe».
 */
export type ConsultaOficial =
  | { consultado: true; oficial: OficialDependencia }
  | { consultado: false; motivo: string };

export interface AdaptadorSafi {
  readonly modo: "MANUAL" | "HTTP" | "API";
  /** Si el adaptador puede escribir en el CRM. */
  readonly escritura: boolean;
  publicar(archivo: ArchivoExpediente): Promise<ResultadoPublicacion>;
  /** Crea la Cuenta —cuando corresponde— y la ficha del Socio. */
  darDeAlta(entrada: EntradaAlta): Promise<ResultadoAlta>;
  /** Listas vivas del CRM, o `null` si no se pueden consultar. */
  listas(): Promise<ListasSafi | null>;
  /** Comprobaciones de solo lectura previas al alta. */
  verificar(entrada: {
    solicitud: SolicitudAfiliacion;
    numeroSocio: string;
    ordinalDependiente: number | null;
  }): Promise<VerificacionSafi>;
  /**
   * Busca en el CRM la ficha titular (secuencia 00) de un número de socio y
   * dice si es de un Socio Activo o de un Fundador. Solo lectura.
   */
  consultarOficial(numeroSocio: string): Promise<ConsultaOficial>;
  /** Comprueba que los identificadores transcritos a mano sean los correctos. */
  comprobarIdentificadores(entrada: {
    solicitud: SolicitudAfiliacion;
    numeroSocio: string;
    cuentaSafiId: string | null;
    socioSafiId: string | null;
  }): Promise<AvisoSafi[]>;
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

function aviso(
  campo: string,
  etiqueta: string,
  valor: string,
  mensaje: string,
  bloquea = true,
  origen: AvisoSafi["origen"] = "CATALOGO"
): AvisoSafi {
  return { campo, etiqueta, valor, bloquea, origen, mensaje };
}

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
  readonly escritura = false;

  async publicar(archivo: ArchivoExpediente): Promise<ResultadoPublicacion> {
    return {
      ok: false,
      reintentable: false,
      mensaje:
        `Pendiente de cargar a mano en SAFI: ${nombreDocumento(archivo.tipoDocumento)} ` +
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
      requiereAltaManual: true,
      mensaje:
        "La integración con SAFI no está habilitada (SAFI_MODO=MANUAL). Cree la Cuenta y el Socio en el CRM " +
        "con los valores confirmados y registre aquí los identificadores que les asignó.",
    };
  }

  async listas(): Promise<ListasSafi | null> {
    return null;
  }

  async verificar(): Promise<VerificacionSafi> {
    return { consultado: false, avisos: [] };
  }

  async consultarOficial(): Promise<ConsultaOficial> {
    return {
      consultado: false,
      motivo: "La integración con SAFI no está habilitada (SAFI_MODO=MANUAL).",
    };
  }

  async comprobarIdentificadores(): Promise<AvisoSafi[]> {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Modo conectado                                                      */
/* ------------------------------------------------------------------ */

/** Solo dígitos: lo único que se interpola en una consulta al CRM. */
function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

type FichaSafi = {
  id?: string;
  firstname?: string;
  lastname?: string;
  account_id?: string;
  [clave: string]: unknown;
};

class AdaptadorConectado implements AdaptadorSafi {
  readonly modo: "HTTP" | "API";
  readonly escritura: boolean;
  private readonly formulario = new ClienteFormulario();
  private readonly api = new ClienteApi();

  /** Cuentas de SAFI ya localizadas, por número de socio. */
  private readonly cuentas = new Map<string, string>();
  /** Si la API admite relacionar documentos; se comprueba una vez. */
  private relacionarDisponible: boolean | null = null;

  constructor(modo: "HTTP" | "API", escritura: boolean) {
    this.modo = modo;
    this.escritura = escritura;
  }

  /* --- Consultas de solo lectura --------------------------------- */

  /** Fichas de Socio que el CRM tiene con un número de socio. */
  private async fichasDeNumero(numeroSocio: string): Promise<FichaSafi[]> {
    const numero = soloDigitos(numeroSocio);
    if (!numero || this.modo !== "API") return [];
    return this.api.consultar<FichaSafi>(
      `SELECT id, firstname, lastname, account_id, ${CAMPOS_SOCIO.numeroSocio}, ${CAMPOS_SOCIO.secuencia}, ${CAMPOS_SOCIO.cedula} FROM ${MODULOS.socio} WHERE ${CAMPOS_SOCIO.numeroSocio} = '${numero}';`
    );
  }

  /** Fichas de Socio con una cédula. */
  private async fichasDeCedula(cedula: string): Promise<FichaSafi[]> {
    const limpia = soloDigitos(cedula);
    if (!limpia || this.modo !== "API") return [];
    return this.api.consultar<FichaSafi>(
      `SELECT id, firstname, lastname, ${CAMPOS_SOCIO.numeroSocio}, ${CAMPOS_SOCIO.secuencia} FROM ${MODULOS.socio} WHERE ${CAMPOS_SOCIO.cedula} = '${limpia}';`
    );
  }

  /** Cuentas con una cédula en el recuadro C.I. */
  private async cuentasDeCedula(cedula: string): Promise<FichaSafi[]> {
    const limpia = soloDigitos(cedula);
    if (!limpia || this.modo !== "API") return [];
    return this.api.consultar<FichaSafi>(
      `SELECT id, accountname FROM ${MODULOS.cuenta} WHERE ${CAMPOS_CUENTA.cedula} = '${limpia}';`
    );
  }

  private valor(ficha: FichaSafi, campo: string): string {
    const dato = ficha[campo];
    return typeof dato === "string" ? dato.trim() : dato === undefined || dato === null ? "" : String(dato);
  }

  private nombreDe(ficha: FichaSafi): string {
    return `${this.valor(ficha, "lastname")} ${this.valor(ficha, "firstname")}`.replace(/\s+/g, " ").trim();
  }

  async consultarOficial(numeroSocio: string): Promise<ConsultaOficial> {
    const numero = soloDigitos(numeroSocio);
    if (!numero) return { consultado: false, motivo: "Falta el número de socio." };
    if (this.modo !== "API") {
      return { consultado: false, motivo: "Con el modo HTTP no se puede consultar el CRM." };
    }

    const fichas = await this.api.consultar<FichaSafi>(
      `SELECT id, firstname, lastname, ${CAMPOS_SOCIO.numeroSocio}, ${CAMPOS_SOCIO.secuencia}, ${CAMPOS_SOCIO.gradoMilitar}, ${CAMPOS_SOCIO.tipoSocio} FROM ${MODULOS.socio} WHERE ${CAMPOS_SOCIO.numeroSocio} = '${numero}';`
    );

    // El oficial es el titular de su número: la ficha de secuencia 00. Las
    // demás de ese número son sus dependientes. Comprobado en el CRM el
    // 19/09/2026: las 1.756 fichas ACTIVO y las 26 FUNDADOR tienen «00». Una
    // secuencia «0» o vacía solo se acepta si no hay ninguna «00», para que un
    // dependiente sin secuencia nunca se tome por el oficial.
    const secuenciaDe = (ficha: FichaSafi) => this.valor(ficha, CAMPOS_SOCIO.secuencia).trim();
    const titular =
      fichas.find((ficha) => secuenciaDe(ficha) === "00") ??
      fichas.find((ficha) => secuenciaDe(ficha) === "0" || secuenciaDe(ficha) === "");
    const en = new Date().toISOString();
    const numeroSocioConsultado = normalizarNumeroSocio(numeroSocio);

    if (!titular) {
      return {
        consultado: true,
        oficial: {
          numeroSocio: numeroSocioConsultado,
          resultado: "NO_ENCONTRADO",
          apellidos: "",
          nombres: "",
          gradoMilitar: "",
          tipoSocioSafi: "",
          en,
        },
      };
    }

    const tipo = this.valor(titular, CAMPOS_SOCIO.tipoSocio).toUpperCase();
    const esOficial = tipo === TIPO_SOCIO_SAFI.SA || tipo === TIPO_SOCIO_SAFI.SF;
    return {
      consultado: true,
      oficial: {
        numeroSocio: numeroSocioConsultado,
        resultado: esOficial ? "VERIFICADO" : "NO_ES_ACTIVO_NI_FUNDADOR",
        apellidos: this.valor(titular, "lastname"),
        nombres: this.valor(titular, "firstname"),
        gradoMilitar: this.valor(titular, CAMPOS_SOCIO.gradoMilitar),
        tipoSocioSafi: tipo,
        en,
      },
    };
  }

  /**
   * Comprobaciones previas al alta, todas de solo lectura.
   *
   * Es la red que evita el error irreversible: crear un socio duplicado o
   * colgar a un dependiente de la Cuenta equivocada. Cuando el CRM no se puede
   * consultar, se dice, y el panel lo advierte en lugar de dar por buena una
   * comprobación que no se hizo.
   */
  async verificar(entrada: {
    solicitud: SolicitudAfiliacion;
    numeroSocio: string;
    ordinalDependiente: number | null;
  }): Promise<VerificacionSafi> {
    const { solicitud } = entrada;
    const esTitular = tieneCuentaPropia(solicitud.datos.tipoMiembro);
    const numero = normalizarNumeroSocio(entrada.numeroSocio);
    const avisos: AvisoSafi[] = [];

    if (this.modo !== "API") {
      return {
        consultado: false,
        avisos: [
          aviso(
            "modo",
            "Comprobación en SAFI",
            this.modo,
            "Con el modo HTTP no se puede consultar el CRM antes de crear: compruebe a mano que el número de socio y la cédula no estén ya registrados.",
            false,
            "COHERENCIA"
          ),
        ],
      };
    }

    try {
      const [fichasNumero, fichasCedula, cuentasCedula] = await Promise.all([
        this.fichasDeNumero(numero),
        this.fichasDeCedula(solicitud.datos.cedula),
        esTitular ? this.cuentasDeCedula(solicitud.datos.cedula) : Promise.resolve([]),
      ]);

      const fichas = fichasNumero.map((ficha) => ({
        secuencia: this.valor(ficha, CAMPOS_SOCIO.secuencia),
        nombre: this.nombreDe(ficha),
        cedula: this.valor(ficha, CAMPOS_SOCIO.cedula),
      }));

      // La cédula del solicitante ya consta como socio: o es un duplicado, o el
      // socio ya existe y lo que toca es registrar su identificador.
      const yaSocio = fichasCedula[0];
      if (yaSocio && !solicitud.expediente.socioSafiId) {
        const referencia = this.nombreDe(yaSocio);
        const numeroExistente = this.valor(yaSocio, CAMPOS_SOCIO.numeroSocio);
        avisos.push(
          aviso(
            "cedula",
            "C.I. ya registrada en SAFI",
            solicitud.datos.cedula,
            `La cédula ${solicitud.datos.cedula} ya consta en SAFI como socio N.º ${
              numeroExistente || "—"
            }${referencia ? ` (${referencia})` : ""}. No cree una ficha nueva: si es la misma persona, registre aquí el identificador que ya tiene.`,
            true,
            "COHERENCIA"
          )
        );
      }

      if (esTitular) {
        if (fichasNumero.length > 0) {
          avisos.push(
            aviso(
              "numeroSocio",
              "Número de socio ocupado en SAFI",
              numero,
              `El número ${numero} ya tiene ${fichasNumero.length} ficha(s) en SAFI (${fichas
                .map((f) => `${f.secuencia} ${f.nombre}`)
                .join(" · ")}). Elija un número libre.`,
              true,
              "COHERENCIA"
            )
          );
        }
        const cuentaPropia = cuentasCedula[0];
        if (cuentaPropia && !solicitud.expediente.cuentaSafiId) {
          avisos.push(
            aviso(
              "cuenta",
              "Cuenta existente con la misma C.I.",
              this.valor(cuentaPropia, "accountname"),
              `SAFI ya tiene una Cuenta con la C.I. ${solicitud.datos.cedula}: «${this.valor(
                cuentaPropia,
                "accountname"
              )}» (identificador ${(this.valor(cuentaPropia, "id").split("x").pop() ?? "").trim()}). Use esa Cuenta en lugar de crear otra.`,
              true,
              "COHERENCIA"
            )
          );
        }
        return { consultado: true, avisos, fichas, ordinalSugerido: null, cuentaTitular: null };
      }

      // Dependiente: su ficha se cuelga de la Cuenta del titular, que ya debe
      // existir en SAFI (la creó este sistema o es un socio antiguo).
      const titular = fichasNumero.find((ficha) => {
        const secuencia = this.valor(ficha, CAMPOS_SOCIO.secuencia).trim();
        return secuencia === "00" || secuencia === "0" || secuencia === "";
      });

      const cuentaLocal = cuentaSafiDelTitular(numero);
      const cuentaDelTitular = titular ? (this.valor(titular, "account_id").split("x").pop() ?? "") : "";
      const cuentaId = cuentaDelTitular || cuentaLocal || "";

      if (!cuentaId) {
        avisos.push(
          aviso(
            "cuentaTitular",
            "Titular no encontrado en SAFI",
            numero,
            `No se encontró en SAFI la ficha del socio titular N.º ${numero} (secuencia 00), así que no se sabe a qué Cuenta colgar a este dependiente. Compruebe el número del titular.`,
            true,
            "COHERENCIA"
          )
        );
      } else if (titular) {
        const declarado = claveComparacion(nombreTitular(solicitud.datos));
        const enSafi = claveComparacion(this.nombreDe(titular));
        if (declarado && enSafi && declarado !== enSafi) {
          avisos.push(
            aviso(
              "titular",
              "Nombre del titular distinto al de SAFI",
              this.nombreDe(titular),
              `El trámite declara como titular a «${nombreTitular(solicitud.datos)}» y el socio N.º ${numero} en SAFI es «${this.nombreDe(
                titular
              )}». Compruebe el número antes de continuar.`,
              false,
              "COHERENCIA"
            )
          );
        }
      }

      const secuencias = fichas
        .map((f) => Number(f.secuencia))
        .filter((n) => Number.isInteger(n) && n >= 0);
      const ordinalSugerido = secuencias.length > 0 ? Math.max(...secuencias) + 1 : 1;

      if (entrada.ordinalDependiente !== null && secuencias.includes(entrada.ordinalDependiente)) {
        const ocupada = fichas.find((f) => Number(f.secuencia) === entrada.ordinalDependiente);
        avisos.push(
          aviso(
            "ordinalDependiente",
            "Secuencia ocupada en SAFI",
            String(entrada.ordinalDependiente),
            `La secuencia ${secuenciaSafi(entrada.ordinalDependiente)} de la cuenta ${numero} ya la ocupa ${
              ocupada?.nombre ?? "otra ficha"
            }. La siguiente libre es ${secuenciaSafi(ordinalSugerido)}.`,
            true,
            "COHERENCIA"
          )
        );
      }

      return {
        consultado: true,
        avisos,
        fichas,
        ordinalSugerido,
        cuentaTitular: cuentaId
          ? { id: cuentaId, nombre: titular ? this.nombreDe(titular) : nombreTitular(solicitud.datos) }
          : null,
      };
    } catch (error) {
      return {
        consultado: false,
        avisos: [
          aviso(
            "conexion",
            "Comprobación en SAFI",
            "",
            `No se pudo consultar el CRM para comprobar duplicados: ${
              error instanceof Error ? error.message : String(error)
            }`,
            false,
            "COHERENCIA"
          ),
        ],
      };
    }
  }

  /**
   * Comprueba que los identificadores que la Jefatura transcribió del CRM
   * correspondan de verdad a esta persona. Un dígito cambiado colgaría los
   * documentos del expediente de otro socio.
   */
  async comprobarIdentificadores(entrada: {
    solicitud: SolicitudAfiliacion;
    numeroSocio: string;
    cuentaSafiId: string | null;
    socioSafiId: string | null;
  }): Promise<AvisoSafi[]> {
    if (this.modo !== "API") return [];
    const avisos: AvisoSafi[] = [];

    try {
      if (entrada.socioSafiId) {
        const wsId = await this.api.idServicio(MODULOS.socio, entrada.socioSafiId);
        const ficha = await this.api.recuperar<FichaSafi>(wsId);
        if (!ficha) {
          avisos.push(
            aviso(
              "socioSafiId",
              "Identificador del Socio",
              entrada.socioSafiId,
              `En SAFI no existe una ficha de Socio con el identificador ${entrada.socioSafiId}.`,
              true,
              "COHERENCIA"
            )
          );
        } else {
          const cedula = soloDigitos(this.valor(ficha, CAMPOS_SOCIO.cedula));
          if (cedula && cedula !== soloDigitos(entrada.solicitud.datos.cedula)) {
            avisos.push(
              aviso(
                "socioSafiId",
                "Identificador del Socio",
                entrada.socioSafiId,
                `La ficha ${entrada.socioSafiId} de SAFI es de «${this.nombreDe(ficha)}» (C.I. ${cedula}), no de ${nombreCompleto(
                  entrada.solicitud.datos
                )}. Revise el identificador.`,
                true,
                "COHERENCIA"
              )
            );
          }
        }
      }

      if (entrada.cuentaSafiId) {
        const wsId = await this.api.idServicio(MODULOS.cuenta, entrada.cuentaSafiId);
        const cuenta = await this.api.recuperar<FichaSafi>(wsId);
        if (!cuenta) {
          avisos.push(
            aviso(
              "cuentaSafiId",
              "Identificador de la Cuenta",
              entrada.cuentaSafiId,
              `En SAFI no existe una Cuenta con el identificador ${entrada.cuentaSafiId}.`,
              true,
              "COHERENCIA"
            )
          );
        }
      }
    } catch (error) {
      avisos.push(
        aviso(
          "conexion",
          "Comprobación de identificadores",
          "",
          `No se pudieron comprobar los identificadores en el CRM: ${
            error instanceof Error ? error.message : String(error)
          }`,
          false,
          "COHERENCIA"
        )
      );
    }

    return avisos;
  }

  /* --- Listas vivas ---------------------------------------------- */

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

  /**
   * Deja fuera los valores de lista que el CRM no admite.
   *
   * Un valor que no está en la lista hace que vTiger rechace el registro
   * entero, con un mensaje que no dice cuál era. Si el campo es opcional, se
   * quita y se avisa; si es obligatorio, no se envía nada y el aviso detiene el
   * alta: es preferible a que el socio quede con un dato falso.
   */
  private depurar(
    campos: Record<string, string>,
    descripcion: DescripcionModulo | null,
    etiquetaModulo: string
  ): { campos: Record<string, string>; avisos: AvisoSafi[] } {
    if (!descripcion) return { campos, avisos: [] };

    const avisos: AvisoSafi[] = [];
    const limpios: Record<string, string> = { ...campos };

    for (const campo of descripcion.campos) {
      const valor = limpios[campo.name];
      if (valor === undefined || valor === "") continue;
      if (campo.tipo !== "picklist" || campo.opciones.length === 0) continue;
      if (campo.opciones.some((opcion) => opcion === valor)) continue;

      // Los importes se comparan por número: el CRM guarda `600` y el
      // tarifario escribe `600.00`.
      const numero = Number(valor.replace(",", "."));
      const equivalente = Number.isFinite(numero)
        ? campo.opciones.find((opcion) => Number(opcion.replace(",", ".")) === numero)
        : undefined;
      if (equivalente) {
        limpios[campo.name] = equivalente;
        continue;
      }

      if (campo.mandatory) {
        avisos.push(
          aviso(
            campo.name,
            `${campo.label} (${campo.name}) de ${etiquetaModulo}`,
            valor,
            `SAFI no admite «${valor}» en la lista «${campo.label}», que es obligatoria. Añádalo en el CRM (Studio → Editor de listas desplegables) o elija un valor admitido.`
          )
        );
      } else {
        delete limpios[campo.name];
        avisos.push(
          aviso(
            campo.name,
            `${campo.label} (${campo.name}) de ${etiquetaModulo}`,
            valor,
            `SAFI no admite «${valor}» en la lista «${campo.label}». El campo es opcional, así que se creará vacío; añada el valor en el CRM si debe constar.`,
            false
          )
        );
      }
    }

    return { campos: limpios, avisos };
  }

  /* --- Alta ------------------------------------------------------- */

  private async crear(
    modulo: string,
    campos: Record<string, string>
  ): Promise<{ ok: true; id: string; wsId: string } | { ok: false; mensaje: string }> {
    if (this.modo === "API") {
      const creado = await this.api.crear(modulo, campos);
      return creado.ok ? creado : { ok: false, mensaje: creado.mensaje };
    }
    const creado = await this.formulario.crear(modulo, campos);
    return creado.ok ? { ok: true, id: creado.id, wsId: creado.id } : { ok: false, mensaje: creado.mensaje };
  }

  /**
   * Crea la Cuenta —solo si la persona es titular— y su ficha de Socio.
   *
   * El orden importa: la ficha del Socio lleva el identificador de la Cuenta en
   * `account_id`, así que la Cuenta va primero. Si la Cuenta se crea y el Socio
   * falla, se devuelve el identificador de la Cuenta creada para que el
   * reintento la reutilice en lugar de duplicarla.
   */
  async darDeAlta({ solicitud, confirmacion, cuentaId }: EntradaAlta): Promise<ResultadoAlta> {
    if (!this.escritura) {
      return {
        ok: false,
        requiereAltaManual: true,
        mensaje:
          "La escritura en SAFI está deshabilitada (SAFI_ESCRITURA=false). Cree la Cuenta y el Socio en el CRM " +
          "con los valores confirmados y registre aquí los identificadores; el sistema los comprueba contra el CRM.",
      };
    }

    const esTitular = tieneCuentaPropia(solicitud.datos.tipoMiembro);
    const via = this.modo;

    // En modo API el usuario asignado lo devuelve el login: hay que abrir la
    // sesión antes de componer los campos, no al enviarlos.
    let asignadoA = "";
    let descripcionCuenta: DescripcionModulo | null = null;
    let descripcionSocio: DescripcionModulo | null = null;
    if (via === "API") {
      try {
        await this.api.asegurarSesion();
      } catch (error) {
        return { ok: false, mensaje: error instanceof Error ? error.message : String(error) };
      }
      asignadoA = this.api.asignadoA ?? "";
      [descripcionCuenta, descripcionSocio] = await Promise.all([
        this.api.describirModulo(MODULOS.cuenta),
        this.api.describirModulo(MODULOS.socio),
      ]);
    }

    let cuenta = cuentaId;

    if (esTitular && !cuenta) {
      const compuesta = this.depurar(
        camposCuenta(solicitud, confirmacion, asignadoA),
        descripcionCuenta,
        "la Cuenta"
      );
      const bloqueantes = compuesta.avisos.filter((a) => a.bloquea);
      if (bloqueantes.length > 0) {
        return { ok: false, mensaje: bloqueantes.map((a) => a.mensaje).join(" ") };
      }

      const creada = await this.crear(MODULOS.cuenta, compuesta.campos);
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

    // La referencia a la Cuenta viaja como identificador de servicio web por la
    // API y como número suelto por el formulario.
    let referenciaCuenta = cuenta;
    if (via === "API") {
      try {
        referenciaCuenta = await this.api.idServicio(MODULOS.cuenta, cuenta);
      } catch (error) {
        return {
          ok: false,
          cuentaId: cuenta,
          mensaje: error instanceof Error ? error.message : String(error),
        };
      }
    }

    const compuestaSocio = this.depurar(
      camposSocio(solicitud, confirmacion, {
        cuentaId: referenciaCuenta,
        cuentaNombre: nombreCuenta(solicitud),
        asignadoA,
        via,
      }),
      descripcionSocio,
      "la ficha del Socio"
    );
    const bloqueantesSocio = compuestaSocio.avisos.filter((a) => a.bloquea);
    if (bloqueantesSocio.length > 0) {
      return {
        ok: false,
        cuentaId: cuenta,
        mensaje: bloqueantesSocio.map((a) => a.mensaje).join(" "),
      };
    }

    const socio = await this.crear(MODULOS.socio, compuestaSocio.campos);
    if (!socio.ok) {
      return {
        ok: false,
        cuentaId: cuenta,
        mensaje:
          `La Cuenta ${cuenta} quedó creada, pero SAFI rechazó la ficha del Socio: ${socio.mensaje}` +
          " Corrija el dato y vuelva a confirmar: se reutilizará esa misma Cuenta.",
      };
    }

    return { ok: true, cuentaId: cuenta, socioId: socio.id };
  }

  /* --- Documentos ------------------------------------------------- */

  /**
   * Localiza la Cuenta del socio titular en SAFI: la que anotó el Área de
   * Socios al dar el alta.
   */
  private async cuentaDe(numeroSocio: string): Promise<string | null> {
    const enCache = this.cuentas.get(numeroSocio);
    if (enCache) return enCache;

    const id = cuentaSafiDelTitular(numeroSocio);
    if (id) this.cuentas.set(numeroSocio, id);
    return id;
  }

  async publicar(archivo: ArchivoExpediente): Promise<ResultadoPublicacion> {
    if (!this.escritura) {
      return {
        ok: false,
        reintentable: false,
        mensaje:
          `Pendiente de cargar a mano en SAFI: ${nombreDocumento(archivo.tipoDocumento)} de ${archivo.numeroSocio}. ` +
          "La escritura en SAFI está deshabilitada (SAFI_ESCRITURA=false).",
      };
    }

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
      const titulo = path.basename(archivo.nombreArchivo, extension);
      const contenido = fs.readFileSync(archivo.ruta);
      const tipoContenido = TIPOS[extension] ?? "application/octet-stream";
      const nota = `${nombreDocumento(archivo.tipoDocumento)} · publicado por la aplicación de afiliación.`;

      if (this.modo === "API") {
        const porApi = await this.publicarPorApi({
          cuentaId,
          titulo,
          nombreArchivo: archivo.nombreArchivo,
          contenido,
          tipoContenido,
          nota,
        });
        // Si la API de esta instalación no admite adjuntar o relacionar, se
        // intenta el plan B verificado —el formulario del CRM— cuando hay
        // contraseña para ello.
        if (porApi.ok || !porApi.usarPlanB) return porApi.resultado;
        if (!config.safiClaveWeb) return porApi.resultado;
      }

      const resultado = await this.formulario.subirDocumento({
        cuentaId,
        titulo,
        nombreArchivo: archivo.nombreArchivo,
        contenido,
        tipoContenido,
        nota,
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

  /**
   * Sube el documento por la API y lo relaciona con la Cuenta.
   *
   * Se comprueba después de crear que el archivo quedó guardado: la API de
   * vTiger toma el adjunto del envío multipart, y una instalación que no lo
   * haga dejaría un documento vacío. Si algo falla a medias, el documento se
   * elimina para no dejar basura en el CRM.
   */
  private async publicarPorApi(entrada: {
    cuentaId: string;
    titulo: string;
    nombreArchivo: string;
    contenido: Buffer;
    tipoContenido: string;
    nota: string;
  }): Promise<{ ok: boolean; usarPlanB: boolean; resultado: ResultadoPublicacion }> {
    const planB = (mensaje: string): { ok: boolean; usarPlanB: boolean; resultado: ResultadoPublicacion } => ({
      ok: false,
      usarPlanB: true,
      resultado: { ok: false, mensaje, reintentable: false },
    });

    if (this.relacionarDisponible === null) {
      this.relacionarDisponible = await this.api.admiteRelacionar();
    }
    if (!this.relacionarDisponible) {
      return planB(
        "La API de este SAFI no permite relacionar documentos con la Cuenta (no tiene add_related), así que no se publica por ahí."
      );
    }

    const cuentaWsId = await this.api.idServicio(MODULOS.cuenta, entrada.cuentaId);

    let carpeta = CARPETA_POR_DEFECTO;
    try {
      carpeta = await this.api.idServicio(MODULOS.carpetaDocumentos, CARPETA_POR_DEFECTO);
    } catch {
      // Sin prefijo de carpetas se envía el número suelto; SAFI tiene una sola.
    }

    const elemento: Record<string, string> = {
      [CAMPOS_DOCUMENTO.titulo]: entrada.titulo,
      [CAMPOS_DOCUMENTO.tipoUbicacion]: "I",
      [CAMPOS_DOCUMENTO.estado]: "1",
      [CAMPOS_DOCUMENTO.carpeta]: carpeta,
      [CAMPOS_DOCUMENTO.nota]: entrada.nota,
      [CAMPOS_DOCUMENTO.archivo]: entrada.nombreArchivo,
    };
    if (this.api.asignadoA) elemento[CAMPOS_DOCUMENTO.asignadoA] = this.api.asignadoA;

    const creado = await this.api.crearDocumento({
      elemento,
      nombreArchivo: entrada.nombreArchivo,
      contenido: entrada.contenido,
      tipoContenido: entrada.tipoContenido,
    });

    if (!creado.ok) {
      return {
        ok: false,
        usarPlanB: !creado.reintentable,
        resultado: { ok: false, mensaje: creado.mensaje, reintentable: creado.reintentable },
      };
    }

    // ¿Quedó el archivo adjunto de verdad?
    const guardado = await this.api.recuperar<{ filename?: string; filesize?: string }>(creado.wsId);
    const tamano = Number(guardado?.filesize ?? 0);
    if (!guardado?.filename || !Number.isFinite(tamano) || tamano <= 0) {
      await this.api.eliminar(creado.wsId);
      return planB(
        "SAFI creó el documento pero sin el archivo adjunto, así que se eliminó para no dejarlo vacío."
      );
    }

    try {
      await this.api.relacionar(cuentaWsId, creado.wsId);
    } catch (error) {
      await this.api.eliminar(creado.wsId);
      if (error instanceof OperacionNoDisponible) {
        this.relacionarDisponible = false;
        return planB(error.message);
      }
      return {
        ok: false,
        usarPlanB: false,
        resultado: {
          ok: false,
          mensaje: `El documento se subió pero no se pudo relacionar con la Cuenta, así que se eliminó: ${
            error instanceof Error ? error.message : String(error)
          }`,
          reintentable: true,
        },
      };
    }

    return { ok: true, usarPlanB: false, resultado: { ok: true, referencia: creado.id } };
  }
}

let instancia: AdaptadorSafi | null = null;

export function adaptadorSafi(): AdaptadorSafi {
  if (!instancia) {
    instancia =
      config.safiModo === "HTTP" || config.safiModo === "API"
        ? new AdaptadorConectado(config.safiModo, config.safiEscritura)
        : new AdaptadorManual();
  }
  return instancia;
}
