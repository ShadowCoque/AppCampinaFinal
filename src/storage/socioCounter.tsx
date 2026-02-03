import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "no_socio_counter";
const START = 2800;

export async function getNextNoSocio(): Promise<number> {
  const raw = await AsyncStorage.getItem(KEY);
  const current = raw ? parseInt(raw, 10) : START;
  const next = current + 1;
  await AsyncStorage.setItem(KEY, String(next));
  return next;
}
