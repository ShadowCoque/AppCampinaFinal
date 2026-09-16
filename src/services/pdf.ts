import { Asset } from "expo-asset";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";

import { leerBase64 } from "../data/archivos";
import type { SolicitudAfiliacion } from "../domain/solicitud";
import { construirFormulario, type RecursosFormulario } from "./formularios";

/**
 * Generación de los documentos oficiales del trámite en PDF.
 *
 * Sustituye el paso de imprimir, firmar y escanear el formulario: la app
 * produce el mismo documento ya firmado y listo para el expediente digital.
 */

let logoCache: string | null = null;

async function logoBase64(): Promise<string> {
  if (logoCache) return logoCache;
  try {
    const asset = Asset.fromModule(require("../../assets/images/brand/logo-horizontal.png"));
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    const base64 = await leerBase64(uri);
    logoCache = base64 ? `data:image/png;base64,${base64}` : "";
  } catch (error) {
    console.warn("[pdf] No se pudo cargar el logo:", error);
    logoCache = "";
  }
  return logoCache;
}

/* ------------------------------------------------------------------ */
/* Formulario de ingreso del socio                                     */
/* ------------------------------------------------------------------ */

/**
 * Reúne los recursos gráficos que necesita el formulario: el logotipo y las
 * firmas, que en el dispositivo son archivos y en el documento deben ser
 * `data:` URI incrustados.
 */
async function recursosDe(solicitud: SolicitudAfiliacion): Promise<RecursosFormulario> {
  const [logo, firma] = await Promise.all([
    logoBase64(),
    solicitud.firmaUri ? leerBase64(solicitud.firmaUri) : Promise.resolve(null),
  ]);

  const firmasGarantes = await Promise.all(
    solicitud.datos.garantes.map((garante) =>
      garante.firmaUri ? leerBase64(garante.firmaUri) : Promise.resolve(null)
    )
  );

  const comoImagen = (base64: string | null) => (base64 ? `data:image/png;base64,${base64}` : null);

  return {
    logo,
    firmaSolicitante: comoImagen(firma),
    firmasGarantes: firmasGarantes.map(comoImagen),
    // Las firmas de los funcionarios solo las tiene el servidor, y la tableta
    // imprime el formulario antes de que exista ninguna constancia: los
    // recuadros del reverso salen con el nombre, sin firma.
    firmasFuncionarios: {},
  };
}

/**
 * Genera el formulario de ingreso que corresponde al tipo de socio, con su
 * carta de compromiso si la exige y con el reverso de INFORMACIÓN INTERNA DEL
 * CLUB. Es el mismo documento que hoy se llena en papel.
 */
async function htmlAfiliacion(solicitud: SolicitudAfiliacion): Promise<string | null> {
  const resultado = construirFormulario(solicitud, await recursosDe(solicitud));
  return resultado?.html ?? null;
}

/* ------------------------------------------------------------------ */
/* API pública                                                         */
/* ------------------------------------------------------------------ */

async function imprimirYCompartir(html: string, titulo: string): Promise<string | null> {
  try {
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: titulo,
        UTI: "com.adobe.pdf",
      });
    } else {
      Alert.alert("PDF generado", `El documento se guardó en el dispositivo:\n${uri}`);
    }
    return uri;
  } catch (error) {
    console.warn("[pdf] No se pudo generar el documento:", error);
    Alert.alert("No se pudo generar el PDF", "Intente nuevamente en unos segundos.");
    return null;
  }
}

export async function exportarSolicitudAfiliacion(
  solicitud: SolicitudAfiliacion
): Promise<string | null> {
  const html = await htmlAfiliacion(solicitud);
  if (!html) {
    Alert.alert(
      "Sin formulario definido",
      "El Club aún no ha proporcionado el formulario físico de este tipo de socio, por lo que no puede generarse el documento."
    );
    return null;
  }
  return imprimirYCompartir(html, `Formulario ${solicitud.codigo}`);
}
