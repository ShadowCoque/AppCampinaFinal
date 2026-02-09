import AsyncStorage from "@react-native-async-storage/async-storage";

export type SolicitudAfiliacion = {
  id: string;
  createdAt: string;
  nombre: string;
  cedula: string;
  telefono?: string;
  email?: string;
  fechaNacimiento?: string;
  noSocioDemo: string; // "2800"
};

const KEY = "solicitudes_afiliacion_v1";

export async function addSolicitud(s: SolicitudAfiliacion) {
  const list = await getSolicitudes();
  list.unshift(s);
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

export async function getSolicitudes(): Promise<SolicitudAfiliacion[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function clearSolicitudes() {
  await AsyncStorage.removeItem(KEY);
}
