import AsyncStorage from "@react-native-async-storage/async-storage";

export type SolicitudAfiliacion = {
  id: string;
  nombreCompleto: string; // 👈 ESTE
  cedula: string;
  telefono: string;
  correo: string;
  fechaNacimiento: string;
  tipoMiembro: TipoMiembro;
  noSocioDemo: number;
  createdAt: string;
};



const KEY = "solicitudes_afiliacion_v1";

export async function addSolicitud(s: SolicitudAfiliacion) {
  const list = await getSolicitudes();
  list.unshift(s);
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}
export async function saveSolicitud(solicitud: SolicitudAfiliacion) {
  const prev = await getSolicitudes();
  const next = [solicitud, ...prev];
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
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
