import ExcelJS from "exceljs";

import {
  COLUMNAS,
  COLUMNA_POR_CLAVE,
  COLUMNAS_OBLIGATORIAS,
  MAXIMO_FILAS,
  claveEncabezado,
  columnaDeEncabezado,
  type ClaveColumna,
  type ClaveLista,
} from "./columnas";

/**
 * Lectura y escritura de los libros de Excel de la importación.
 *
 * Se trabaja solo con `.xlsx` (Libro de Excel). Un `.csv` no hace falta y trae
 * problemas que el `.xlsx` no tiene: Excel en español lo guarda con punto y
 * coma y en Windows-1252, y al abrirlo convierte las cédulas en números y se
 * come el 0 inicial. El `.xls` antiguo tampoco se admite; basta «Guardar
 * como → Libro de Excel».
 */

/** Error que se muestra tal cual a la Jefatura: dice qué hacer. */
export class ErrorImportacion extends Error {}

/** Lo que se leyó de una celda, antes de interpretarlo. */
export type CeldaLeida = {
  /** El texto tal como se ve, sin espacios sobrantes a los lados. */
  texto: string;
  /** Si la celda era una fecha de Excel: día, mes y año. */
  fecha?: { anio: number; mes: number; dia: number };
  /** Si la celda era un número. */
  numero?: number;
  /** Si la celda tenía un error de fórmula (#N/A, #VALUE!…). */
  error?: string;
};

export type FilaLeida = {
  /** Número de fila en la hoja, el que ve la Jefatura en Excel. */
  fila: number;
  celdas: Partial<Record<ClaveColumna, CeldaLeida>>;
};

export type LibroLeido = {
  hoja: string;
  filaEncabezado: number;
  columnas: ClaveColumna[];
  /** Encabezados que no corresponden a ninguna columna: se ignoran y se avisa. */
  ignoradas: string[];
  filas: FilaLeida[];
};

/* ------------------------------------------------------------------ */
/* Comprobación previa del archivo                                     */
/* ------------------------------------------------------------------ */

/** Tamaño máximo del archivo subido. Quinientas filas caben en unos 200 KB. */
export const MAXIMO_BYTES = 5 * 1024 * 1024;

/**
 * Un `.xlsx` es un ZIP. Antes de abrirlo se mira su índice: que lo sea, y que
 * lo que contiene, descomprimido, tenga un tamaño razonable. Un archivo que se
 * infla a gigabytes al descomprimirse tumbaría el servidor (y con él la
 * bandeja de las tres áreas) antes de llegar a leer una fila.
 */
function comprobarZip(contenido: Buffer): void {
  const noEsExcel = () =>
    new ErrorImportacion(
      "El archivo no es un Libro de Excel (.xlsx). Ábralo en Excel y use «Guardar como → Libro de Excel (.xlsx)»."
    );

  if (contenido.length < 22 || contenido.readUInt32LE(0) !== 0x04034b50) {
    // Un .xls antiguo empieza por D0 CF 11 E0.
    if (contenido.length >= 4 && contenido.readUInt32LE(0) === 0xe011cfd0) {
      throw new ErrorImportacion(
        "El archivo es un .xls de Excel antiguo. Ábralo en Excel y use «Guardar como → Libro de Excel (.xlsx)»."
      );
    }
    throw noEsExcel();
  }

  // Registro de fin del directorio central: está en los últimos 64 KB.
  const inicioBusqueda = Math.max(0, contenido.length - 22 - 0xffff);
  let fin = -1;
  for (let i = contenido.length - 22; i >= inicioBusqueda; i -= 1) {
    if (contenido.readUInt32LE(i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw noEsExcel();

  const entradas = contenido.readUInt16LE(fin + 10);
  const inicioDirectorio = contenido.readUInt32LE(fin + 16);
  if (entradas > 5000) throw noEsExcel();

  let posicion = inicioDirectorio;
  let total = 0;
  for (let i = 0; i < entradas; i += 1) {
    if (posicion + 46 > contenido.length || contenido.readUInt32LE(posicion) !== 0x02014b50) {
      throw noEsExcel();
    }
    total += contenido.readUInt32LE(posicion + 24);
    const largoNombre = contenido.readUInt16LE(posicion + 28);
    const largoExtra = contenido.readUInt16LE(posicion + 30);
    const largoComentario = contenido.readUInt16LE(posicion + 32);
    posicion += 46 + largoNombre + largoExtra + largoComentario;
  }

  if (total > 100 * 1024 * 1024) {
    throw new ErrorImportacion(
      "El archivo es demasiado grande una vez abierto. Copie solo las filas de los socios en la plantilla vacía y vuelva a subirla."
    );
  }
}

/* ------------------------------------------------------------------ */
/* Lectura                                                             */
/* ------------------------------------------------------------------ */

/** Texto de una celda de fórmula, enlace o texto enriquecido. */
function leerValor(valor: ExcelJS.CellValue): CeldaLeida {
  if (valor === null || valor === undefined) return { texto: "" };

  if (valor instanceof Date) {
    // exceljs convierte el número de serie de Excel a una fecha UTC.
    const fecha = {
      anio: valor.getUTCFullYear(),
      mes: valor.getUTCMonth() + 1,
      dia: valor.getUTCDate(),
    };
    const texto = `${String(fecha.dia).padStart(2, "0")}/${String(fecha.mes).padStart(2, "0")}/${fecha.anio}`;
    return { texto, fecha };
  }

  if (typeof valor === "number") {
    // Sin notación científica ni decimales espurios en cédulas y teléfonos.
    const texto = Number.isInteger(valor) ? valor.toFixed(0) : String(valor);
    return { texto, numero: valor };
  }

  if (typeof valor === "string") return { texto: valor.replace(/ /g, " ").trim() };
  if (typeof valor === "boolean") return { texto: valor ? "Sí" : "No" };

  if (typeof valor === "object") {
    if ("error" in valor && valor.error) return { texto: "", error: String(valor.error) };
    if ("richText" in valor && Array.isArray(valor.richText)) {
      return { texto: valor.richText.map((parte) => parte.text).join("").replace(/ /g, " ").trim() };
    }
    if ("formula" in valor || "sharedFormula" in valor) {
      const resultado = (valor as { result?: ExcelJS.CellValue }).result;
      return leerValor(resultado ?? null);
    }
    if ("text" in valor) {
      // Un enlace: el correo que Excel convirtió en «mailto:».
      const texto = (valor as { text: unknown }).text;
      return typeof texto === "string" || typeof texto === "object"
        ? leerValor(texto as ExcelJS.CellValue)
        : { texto: String(texto ?? "") };
    }
  }

  return { texto: String(valor).trim() };
}

/**
 * Busca la fila de los encabezados en las primeras filas: la plantilla la tiene
 * en la primera, pero un archivo propio puede traer un título encima.
 */
function buscarEncabezado(hoja: ExcelJS.Worksheet): { fila: number; mapa: Map<number, ClaveColumna>; ignoradas: string[] } | null {
  let mejor: { fila: number; mapa: Map<number, ClaveColumna>; ignoradas: string[] } | null = null;

  const ultima = Math.min(hoja.rowCount, 10);
  for (let numero = 1; numero <= ultima; numero += 1) {
    const fila = hoja.getRow(numero);
    const mapa = new Map<number, ClaveColumna>();
    const ignoradas: string[] = [];
    const repetidas = new Set<ClaveColumna>();

    fila.eachCell({ includeEmpty: false }, (celda, columna) => {
      const texto = leerValor(celda.value).texto;
      if (!texto) return;
      const clave = columnaDeEncabezado(texto);
      if (!clave) {
        ignoradas.push(texto);
        return;
      }
      if ([...mapa.values()].includes(clave)) {
        repetidas.add(clave);
        return;
      }
      mapa.set(columna, clave);
    });

    if (repetidas.size > 0 && mapa.size >= 4) {
      throw new ErrorImportacion(
        `La fila ${numero} tiene dos veces la columna ${[...repetidas]
          .map((clave) => `«${COLUMNA_POR_CLAVE[clave].titulo}»`)
          .join(", ")}. Deje una sola.`
      );
    }
    if (mapa.size >= 4 && (!mejor || mapa.size > mejor.mapa.size)) {
      mejor = { fila: numero, mapa, ignoradas };
    }
  }

  return mejor;
}

export async function leerLibro(contenido: Buffer): Promise<LibroLeido> {
  if (contenido.length > MAXIMO_BYTES) {
    throw new ErrorImportacion(
      `El archivo pesa ${(contenido.length / 1024 / 1024).toFixed(1)} MB y el máximo es ${
        MAXIMO_BYTES / 1024 / 1024
      } MB. Copie solo las filas de los socios en la plantilla vacía.`
    );
  }
  comprobarZip(contenido);

  const libro = new ExcelJS.Workbook();
  try {
    // exceljs declara su propio tipo de Buffer; el de Node es el mismo en uso.
    await libro.xlsx.load(contenido as unknown as ArrayBuffer);
  } catch {
    throw new ErrorImportacion(
      "No se pudo abrir el archivo. Compruebe que sea un Libro de Excel (.xlsx) y que no esté protegido con contraseña."
    );
  }

  // La hoja «Socios» de la plantilla; si no está, la primera visible que tenga
  // encabezados reconocibles.
  const visibles = libro.worksheets.filter((hoja) => hoja.state === "visible");
  const candidatas = [
    ...visibles.filter((hoja) => claveEncabezado(hoja.name) === "socios"),
    ...visibles.filter((hoja) => claveEncabezado(hoja.name) !== "socios"),
  ];

  for (const hoja of candidatas) {
    const encabezado = buscarEncabezado(hoja);
    if (!encabezado) continue;

    const columnas = [...encabezado.mapa.values()];
    const faltan = COLUMNAS_OBLIGATORIAS.filter((clave) => !columnas.includes(clave));
    if (faltan.length > 0) {
      throw new ErrorImportacion(
        `En la hoja «${hoja.name}» faltan columnas obligatorias: ${faltan
          .map((clave) => `«${COLUMNA_POR_CLAVE[clave].titulo}»`)
          .join(", ")}. Use la plantilla que se descarga desde esta misma pantalla.`
      );
    }

    const filas: FilaLeida[] = [];
    for (let numero = encabezado.fila + 1; numero <= hoja.rowCount; numero += 1) {
      const fila = hoja.getRow(numero);
      const celdas: Partial<Record<ClaveColumna, CeldaLeida>> = {};
      let conDatos = false;
      for (const [columna, clave] of encabezado.mapa) {
        const celda = leerValor(fila.getCell(columna).value);
        if (celda.texto || celda.error) conDatos = true;
        celdas[clave] = celda;
      }
      if (!conDatos) continue;
      filas.push({ fila: numero, celdas });
      if (filas.length > MAXIMO_FILAS) {
        throw new ErrorImportacion(
          `La hoja «${hoja.name}» tiene más de ${MAXIMO_FILAS} filas con datos. Divídala en varios archivos.`
        );
      }
    }

    if (filas.length === 0) {
      throw new ErrorImportacion(
        `La hoja «${hoja.name}» tiene los encabezados pero ninguna fila con datos debajo.`
      );
    }

    return {
      hoja: hoja.name,
      filaEncabezado: encabezado.fila,
      columnas,
      ignoradas: encabezado.ignoradas,
      filas,
    };
  }

  throw new ErrorImportacion(
    "No se encontró una hoja con los encabezados de la plantilla (Cédula, Apellidos, Nombres…). Use la plantilla que se descarga desde esta misma pantalla."
  );
}

/* ------------------------------------------------------------------ */
/* Escritura: plantilla y resultado                                    */
/* ------------------------------------------------------------------ */

/** Listas desplegables de la plantilla: las del CRM en vivo o las de respaldo. */
export type ListasPlantilla = Record<ClaveLista, string[]>;

/** Una fila del informe de resultado. */
export type FilaResultado = {
  fila: number;
  estado: string;
  numeroSocio: string;
  cedula: string;
  nombre: string;
  cuenta: string;
  socio: string;
  detalle: string;
};

const AZUL = "FF08407D";
const AZUL_CLARO = "FFEDF3F9";
const DORADO_CLARO = "FFFBF3E2";

/**
 * Validaciones de datos por rango. exceljs las admite (`worksheet.dataValidations`)
 * pero sus tipos no las declaran.
 */
function validaciones(hoja: ExcelJS.Worksheet): { add(rango: string, validacion: ExcelJS.DataValidation): void } {
  return (hoja as unknown as { dataValidations: { add(rango: string, validacion: ExcelJS.DataValidation): void } })
    .dataValidations;
}

/** Filas de la hoja «Socios» que llevan desplegables y formato. */
const FILAS_CON_FORMATO = MAXIMO_FILAS + 1;

/**
 * La plantilla vacía o, con `filas`, rellena: el informe de resultado lleva en
 * su hoja «Socios» las filas que no se crearon, con sus datos, para
 * corregirlas y volver a subir el mismo archivo.
 */
export async function escribirLibro(opciones: {
  listas: ListasPlantilla;
  filas?: Partial<Record<ClaveColumna, string>>[];
  resultado?: { titulo: string; filas: FilaResultado[] };
}): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Club La Campiña · Área de Socios";
  libro.created = new Date();

  const socios = libro.addWorksheet("Socios", {
    views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  });
  const instrucciones = libro.addWorksheet("Instrucciones");
  const listas = libro.addWorksheet("Listas", { state: "hidden" });

  /* --- Listas ------------------------------------------------------- */

  const rangoDeLista = new Map<ClaveLista, string>();
  let columnaLista = 1;
  for (const [clave, valores] of Object.entries(opciones.listas) as [ClaveLista, string[]][]) {
    const letra = listas.getColumn(columnaLista).letter;
    listas.getCell(1, columnaLista).value = clave;
    valores.forEach((valor, i) => {
      listas.getCell(i + 2, columnaLista).value = valor;
    });
    if (valores.length > 0) {
      rangoDeLista.set(clave, `Listas!$${letra}$2:$${letra}$${valores.length + 1}`);
    }
    columnaLista += 1;
  }

  /* --- Hoja «Socios» ------------------------------------------------ */

  socios.columns = COLUMNAS.map((columna) => ({
    header: columna.titulo,
    key: columna.clave,
    width: columna.ancho,
    style:
      columna.formato === "fecha"
        ? { numFmt: "dd/mm/yyyy" }
        : columna.formato === "texto"
          ? { numFmt: "@" }
          : {},
  }));

  const encabezado = socios.getRow(1);
  encabezado.height = 32;
  COLUMNAS.forEach((columna, i) => {
    const celda = encabezado.getCell(i + 1);
    const obligatoria = columna.obligatoria === true;
    celda.font = { bold: true, color: { argb: obligatoria ? "FFFFFFFF" : AZUL } };
    celda.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: obligatoria ? AZUL : columna.obligatoria === "condicional" ? DORADO_CLARO : AZUL_CLARO },
    };
    celda.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    celda.note = {
      texts: [
        {
          text: `${
            columna.obligatoria === true
              ? "Obligatoria. "
              : columna.obligatoria === "condicional"
                ? "Obligatoria en algunos casos. "
                : "Opcional. "
          }${columna.descripcion}`,
        },
      ],
    };
  });

  // Desplegables, formatos y ayudas por columna, en las filas de datos.
  COLUMNAS.forEach((columna, i) => {
    const letra = socios.getColumn(i + 1).letter;
    const rango = `${letra}2:${letra}${FILAS_CON_FORMATO}`;
    const ayuda = {
      showInputMessage: true,
      promptTitle: columna.titulo.slice(0, 32),
      prompt: columna.descripcion.slice(0, 255),
    };

    if (columna.formato === "lista" && columna.lista && rangoDeLista.has(columna.lista)) {
      validaciones(socios).add(rango, {
        type: "list",
        allowBlank: true,
        formulae: [rangoDeLista.get(columna.lista)!],
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: "Valor no admitido",
        error: `Elija un valor de la lista de «${columna.titulo}».`.slice(0, 255),
        ...ayuda,
      });
    } else if (columna.formato === "fecha") {
      validaciones(socios).add(rango, {
        type: "date",
        operator: "between",
        allowBlank: true,
        formulae: [new Date(Date.UTC(1900, 0, 1)), new Date(Date.UTC(2100, 11, 31))],
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: "Fecha no válida",
        error: "Escriba la fecha como dd/mm/aaaa.",
        ...ayuda,
      });
    } else if (columna.clave === "cedula") {
      validaciones(socios).add(rango, {
        type: "textLength",
        operator: "equal",
        allowBlank: true,
        formulae: [10],
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: "Cédula incompleta",
        error: "La cédula tiene 10 dígitos. Si empieza por 0, escríbalo.",
        ...ayuda,
      });
    } else {
      // Sin restricción, solo la ayuda al pararse en la celda. El tipo «any» existe
      // en exceljs aunque sus tipos no lo declaren.
      validaciones(socios).add(rango, { type: "any", allowBlank: true, ...ayuda } as unknown as ExcelJS.DataValidation);
    }
  });

  for (const valores of opciones.filas ?? []) {
    socios.addRow(COLUMNAS.map((columna) => valores[columna.clave] ?? ""));
  }

  socios.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNAS.length } };

  /* --- Hoja «Instrucciones» ----------------------------------------- */

  instrucciones.columns = [
    { key: "a", width: 30 },
    { key: "b", width: 16 },
    { key: "c", width: 90 },
    { key: "d", width: 30 },
  ];
  const titulo = instrucciones.addRow(["Importación de socios oficiales (Socio Activo) · Club La Campiña"]);
  titulo.font = { bold: true, size: 14, color: { argb: AZUL } };
  instrucciones.addRow([]);
  const pasos = [
    "1. Escriba un socio por fila en la hoja «Socios», desde la fila 2. No cambie ni borre la fila de encabezados.",
    "2. Las columnas en azul oscuro son obligatorias; las doradas, en algunos casos; las claras, opcionales. Al pararse en una celda, Excel muestra qué va en ella.",
    "3. Guarde como Libro de Excel (.xlsx) y súbalo en la bandeja del Área de Socios, pestaña «Importar socios».",
    "4. El sistema revisa todas las filas y consulta SAFI sin crear nada. Corrija lo que marque en rojo y vuelva a subir el archivo.",
    "5. Cuando esté conforme, pulse «Crear en SAFI»: se crea la Cuenta y la ficha de cada socio, uno por uno.",
    "Solo para Socios Activos (oficiales FAE). El resto de categorías se afilian desde la tableta.",
    "Una persona que ya consta en SAFI (por ejemplo, como dependiente de su padre) no se importa: eso es un cambio de categoría y se hace en SAFI.",
  ];
  for (const paso of pasos) {
    const fila = instrucciones.addRow([paso]);
    instrucciones.mergeCells(fila.number, 1, fila.number, 4);
    fila.alignment = { wrapText: true, vertical: "top" };
    fila.height = 30;
  }
  instrucciones.addRow([]);
  const cabecera = instrucciones.addRow(["Columna", "¿Obligatoria?", "Qué va", "Ejemplo"]);
  cabecera.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cabecera.eachCell((celda) => {
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  });
  for (const columna of COLUMNAS) {
    const fila = instrucciones.addRow([
      columna.titulo,
      columna.obligatoria === true ? "Sí" : columna.obligatoria === "condicional" ? "En algunos casos" : "No",
      columna.descripcion,
      columna.ejemplo,
    ]);
    fila.alignment = { wrapText: true, vertical: "top" };
  }

  /* --- Hoja «Resultado» (solo en el informe) ------------------------ */

  if (opciones.resultado) {
    const hoja = libro.addWorksheet("Resultado", { views: [{ state: "frozen", ySplit: 2 }] });
    hoja.columns = [
      { key: "fila", width: 7 },
      { key: "estado", width: 16 },
      { key: "numeroSocio", width: 11 },
      { key: "cedula", width: 13 },
      { key: "nombre", width: 38 },
      { key: "cuenta", width: 12 },
      { key: "socio", width: 12 },
      { key: "detalle", width: 90 },
    ];
    const cabeza = hoja.addRow([opciones.resultado.titulo]);
    cabeza.font = { bold: true, size: 13, color: { argb: AZUL } };
    const nombres = hoja.addRow([
      "Fila",
      "Estado",
      "N.º de socio",
      "Cédula",
      "Apellidos y nombres",
      "Cuenta SAFI",
      "Socio SAFI",
      "Detalle",
    ]);
    nombres.font = { bold: true, color: { argb: "FFFFFFFF" } };
    nombres.eachCell((celda) => {
      celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    });
    for (const fila of opciones.resultado.filas) {
      const agregada = hoja.addRow([
        fila.fila,
        fila.estado,
        fila.numeroSocio,
        fila.cedula,
        fila.nombre,
        fila.cuenta,
        fila.socio,
        fila.detalle,
      ]);
      agregada.alignment = { wrapText: true, vertical: "top" };
      agregada.getCell(3).numFmt = "@";
      agregada.getCell(4).numFmt = "@";
    }
    // El resultado se ve primero; «Socios» queda para corregir y resubir.
    libro.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 3, visibility: "visible" }];
  }

  const salida = await libro.xlsx.writeBuffer();
  return Buffer.from(salida as ArrayBuffer);
}
