import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Alert, Linking } from "react-native";

/**
 * Captura de documentos y fotografías.
 *
 * Encapsula los permisos y la cancelación del usuario para que las pantallas
 * solo tengan que preocuparse por el resultado: un archivo o `null`.
 */

export type ArchivoCapturado = {
  uri: string;
  nombre: string;
  mimeType: string;
  tamanoBytes: number;
};

function avisarPermisoDenegado(que: string) {
  Alert.alert(
    "Permiso necesario",
    `Para ${que} debe habilitar el permiso correspondiente en la configuración del dispositivo.`,
    [
      { text: "Ahora no", style: "cancel" },
      { text: "Abrir configuración", onPress: () => Linking.openSettings() },
    ]
  );
}

function desdeImagen(asset: ImagePicker.ImagePickerAsset): ArchivoCapturado {
  return {
    uri: asset.uri,
    nombre: asset.fileName ?? `captura-${Date.now()}.jpg`,
    mimeType: asset.mimeType ?? "image/jpeg",
    tamanoBytes: asset.fileSize ?? 0,
  };
}

/** Abre la cámara para fotografiar un documento o al solicitante. */
export async function capturarConCamara(
  opciones: { recorteCuadrado?: boolean } = {}
): Promise<ArchivoCapturado | null> {
  const permiso = await ImagePicker.requestCameraPermissionsAsync();
  if (!permiso.granted) {
    avisarPermisoDenegado("tomar fotografías");
    return null;
  }

  const resultado = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.7,
    allowsEditing: true,
    aspect: opciones.recorteCuadrado ? [1, 1] : undefined,
    exif: false,
  });

  if (resultado.canceled || !resultado.assets?.length) return null;
  return desdeImagen(resultado.assets[0]);
}

/** Permite elegir una imagen ya existente en el dispositivo. */
export async function elegirDeGaleria(
  opciones: { recorteCuadrado?: boolean } = {}
): Promise<ArchivoCapturado | null> {
  const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permiso.granted) {
    avisarPermisoDenegado("seleccionar imágenes");
    return null;
  }

  const resultado = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
    allowsEditing: true,
    aspect: opciones.recorteCuadrado ? [1, 1] : undefined,
    exif: false,
  });

  if (resultado.canceled || !resultado.assets?.length) return null;
  return desdeImagen(resultado.assets[0]);
}

/** Permite adjuntar un PDF o una imagen desde el explorador de archivos. */
export async function elegirArchivo(): Promise<ArchivoCapturado | null> {
  const resultado = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (resultado.canceled || !resultado.assets?.length) return null;

  const asset = resultado.assets[0];
  return {
    uri: asset.uri,
    nombre: asset.name ?? `documento-${Date.now()}`,
    mimeType: asset.mimeType ?? "application/octet-stream",
    tamanoBytes: asset.size ?? 0,
  };
}
