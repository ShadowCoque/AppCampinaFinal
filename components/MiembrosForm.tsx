import AsyncStorage from "@react-native-async-storage/async-storage";
import { Picker } from "@react-native-picker/picker";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getNextNoSocio } from "../src/storage/socioCounter";
import { saveSolicitud } from "../src/storage/solicitudes";
const KEY = "no_socio_counter";
const START = 2800;

export async function getNextNoSocio(): Promise<number> {
  const raw = await AsyncStorage.getItem(KEY);
  const current = raw ? parseInt(raw, 10) : START;
  const next = current + 1;
  await AsyncStorage.setItem(KEY, String(next));
  return next;
}

const BRAND = {
  primary: "#003963",
  bg: "#F6F8FB",
  white: "#FFFFFF",
  text: "#0E1B2A",
  muted: "#64748B",
  border: "#E3E8EF",
};

type TipoMiembro =
  | "Default"
  | "SF"
  | "SA"
  | "Cónyuge"
  | "Padres"
  | "Juvenil"
  | "DA"
  | "DB1"
  | "DB2"
  | "DC"
  | "PA"
  | "PB"
  | "CA"
  | "CB"
  | "CC";

type SolicitudAfiliacion = {
  id: string;
  createdAt: string;
  tipoMiembro: TipoMiembro;

  nombreSocioPrincipal?: string;

  // corresponsales
  gradoMilitar?: string;
  estado?: "Activo" | "Pasivo" | "";
  fuerza?: "Terrestre" | "Naval" | "";

  // solicitante
  nombreCompleto: string;
  cedula: string;
  telefono?: string;
  correo?: string;
  fechaNacimiento?: string;

  // demo para facturación
  noSocioDemo: string; // "2800"
};

const STORAGE_KEY = "solicitudes_afiliacion_v1";

async function addSolicitudLocal(solicitud: SolicitudAfiliacion) {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const list: SolicitudAfiliacion[] = raw ? safeJsonParse(raw, []) : [];
  list.unshift(solicitud);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const SimpleCheck = ({
  label,
  checked,
  onPress,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      flexDirection: "row",
      alignItems: "center",
      marginRight: 15,
    }}
  >
    <View
      style={{
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: BRAND.primary,
        backgroundColor: checked ? BRAND.primary : "transparent",
        marginRight: 8,
      }}
    />
    <Text style={{ color: BRAND.text, fontWeight: "700" }}>{label}</Text>
  </TouchableOpacity>
);

function MiembrosForm() {
  // ------------------------------
  // ESTADOS PRINCIPALES
  // ------------------------------
  const [tipoMiembro, setTipoMiembro] = useState<TipoMiembro>("Default");
  const [acepta, setAcepta] = useState(false);

  // Datos (solo se “activan” cuando ya eligió tipo)
  const [nombreSocioPrincipal, setNombreSocioPrincipal] = useState("");
  const [gradoMilitar, setGradoMilitar] = useState("");
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [cedula, setCedula] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");

  // ------------------------------
  // CHECKBOXES (solo para corresponsales)
  // ------------------------------
  const [estadoActivo, setEstadoActivo] = useState(false);
  const [estadoPasivo, setEstadoPasivo] = useState(false);

  const [fuerzaTerrestre, setFuerzaTerrestre] = useState(false);
  const [fuerzaNaval, setFuerzaNaval] = useState(false);

  const isSelected = tipoMiembro !== "Default";
  const isCorresponsal = useMemo(
    () => ["CA", "CB", "CC"].includes(tipoMiembro),
    [tipoMiembro]
  );

  const requiresSocioPrincipal = useMemo(() => {
    // Mostrar “Nombre del Socio Principal” para tipos que NO son SF/SA y NO son corresponsales
    return (
      isSelected &&
      tipoMiembro !== "SF" &&
      tipoMiembro !== "SA" &&
      !["CA", "CB", "CC"].includes(tipoMiembro)
    );
  }, [isSelected, tipoMiembro]);

  const toggleEstadoActivo = () => {
    if (!estadoActivo) setEstadoPasivo(false);
    setEstadoActivo((v) => !v);
  };

  const toggleEstadoPasivo = () => {
    if (!estadoPasivo) setEstadoActivo(false);
    setEstadoPasivo((v) => !v);
  };

  const toggleFuerzaTerrestre = () => {
    if (!fuerzaTerrestre) setFuerzaNaval(false);
    setFuerzaTerrestre((v) => !v);
  };

  const toggleFuerzaNaval = () => {
    if (!fuerzaNaval) setFuerzaTerrestre(false);
    setFuerzaNaval((v) => !v);
  };

  const resetFormForType = (t: TipoMiembro) => {
    setTipoMiembro(t);
    setAcepta(false);

    // Limpia inputs al cambiar tipo (evita datos “mezclados”)
    setNombreSocioPrincipal("");
    setGradoMilitar("");
    setNombreCompleto("");
    setCedula("");
    setTelefono("");
    setCorreo("");
    setFechaNacimiento("");

    // Limpia checks
    setEstadoActivo(false);
    setEstadoPasivo(false);
    setFuerzaTerrestre(false);
    setFuerzaNaval(false);
  };

  const canSubmit = useMemo(() => {
    if (!isSelected) return false;
    if (!acepta) return false;

    // Mínimos razonables
    if (!nombreCompleto.trim()) return false;
    if (!cedula.trim()) return false;

    // Si es corresponsal, al menos grado militar (lo demás opcional)
    if (isCorresponsal) {
      if (!gradoMilitar.trim()) return false;
    }

    // Si requiere socio principal, exigirlo
    if (requiresSocioPrincipal && !nombreSocioPrincipal.trim()) return false;

    return true;
  }, [
    isSelected,
    acepta,
    nombreCompleto,
    cedula,
    isCorresponsal,
    gradoMilitar,
    requiresSocioPrincipal,
    nombreSocioPrincipal,
  ]);

  const onSubmit = async () => {
  if (!canSubmit) {
    Alert.alert("Falta información", "Completa los campos obligatorios.");
    return;
  }

  const noSocio = await getNextNoSocio();

  const payload = {
  id: Date.now().toString(),
  nombre: nombreCompleto,     // 🔥 clave: mapear correctamente
  cedula,
  telefono,
  correo,
  fechaNacimiento,
  tipoMiembro,
  noSocioDemo: noSocio,       // 🔥 number, no string
  createdAt: new Date().toISOString(),
};


  await saveSolicitud(payload); // tu storage local actual

  Alert.alert(
    "Solicitud registrada",
    `Solicitud guardada.\nNo. Socio asignado: ${noSocio}`
  );
};


  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header con logo + identidad */}
      <View style={styles.header}>
        <Image
          source={require("../assets/images/campina-logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Formulario de afiliación</Text>
          <Text style={styles.subtitle}>
            Selecciona el tipo de socio para cargar el formulario.
          </Text>
        </View>
      </View>

      {/* Selector */}
      <View style={styles.card}>
        <Text style={styles.label}>Tipo de miembro (seleccionar uno)</Text>

        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={tipoMiembro}
            onValueChange={(itemValue) =>
              resetFormForType(itemValue as TipoMiembro)
            }
            style={styles.picker}
            dropdownIconColor={BRAND.primary}
            mode="dialog"
          >
            <Picker.Item label="Seleccionar..." value="Default" />
            <Picker.Item label="Socio Fundador" value="SF" />
            <Picker.Item label="Socio Activo" value="SA" />
            <Picker.Item label="Cónyuge (Oficial FAE)" value="Cónyuge" />
            <Picker.Item label="Padres (Oficial FAE)" value="Padres" />
            <Picker.Item label="Juvenil (Oficial FAE)" value="Juvenil" />
            <Picker.Item label="Dependiente A" value="DA" />
            <Picker.Item label="Dependiente B - Tipo 1" value="DB1" />
            <Picker.Item label="Dependiente B - Tipo 2" value="DB2" />
            <Picker.Item label="Dependiente C" value="DC" />
            <Picker.Item label="Particular A" value="PA" />
            <Picker.Item label="Particular B" value="PB" />
            <Picker.Item label="Corresponsal A" value="CA" />
            <Picker.Item label="Corresponsal B" value="CB" />
            <Picker.Item label="Corresponsal C" value="CC" />
          </Picker>
        </View>
      </View>

      {/* IMPORTANTE: No renderizar nada hasta elegir tipo */}
      {!isSelected ? (
        <View style={styles.card}>
          <Text style={styles.helperText}>
            Primero selecciona el tipo de miembro para mostrar los campos
            correspondientes.
          </Text>
        </View>
      ) : (
        <>
          {/* Campo condicional: Socio principal */}
          {requiresSocioPrincipal && (
            <View style={styles.card}>
              <Text style={styles.label}>Nombre del Socio Principal *</Text>
              <TextInput
                style={styles.input}
                value={nombreSocioPrincipal}
                onChangeText={setNombreSocioPrincipal}
                placeholder="Ej: Apellidos y nombres"
                placeholderTextColor={BRAND.muted}
              />
            </View>
          )}

          {/* Campos exclusivos para corresponsales */}
          {isCorresponsal && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Datos para corresponsales</Text>

              <Text style={styles.label}>Grado Militar *</Text>
              <TextInput
                style={styles.input}
                value={gradoMilitar}
                onChangeText={setGradoMilitar}
                placeholder="Ej: Tnte., Cap., etc."
                placeholderTextColor={BRAND.muted}
              />

              <View style={styles.rowChecks}>
                <Text style={styles.switchText}>Estado:</Text>

                <SimpleCheck
                  label="Activo"
                  checked={estadoActivo}
                  onPress={toggleEstadoActivo}
                />
                <SimpleCheck
                  label="Pasivo"
                  checked={estadoPasivo}
                  onPress={toggleEstadoPasivo}
                />
              </View>

              <View style={styles.rowChecks}>
                <Text style={styles.switchText}>Fuerza:</Text>

                <SimpleCheck
                  label="Terrestre"
                  checked={fuerzaTerrestre}
                  onPress={toggleFuerzaTerrestre}
                />
                <SimpleCheck
                  label="Naval"
                  checked={fuerzaNaval}
                  onPress={toggleFuerzaNaval}
                />
              </View>
            </View>
          )}

          {/* Datos generales */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Datos del solicitante</Text>

            <Text style={styles.label}>Nombre completo *</Text>
            <TextInput
              style={styles.input}
              value={nombreCompleto}
              onChangeText={setNombreCompleto}
              placeholder="Ej: Nombres y apellidos"
              placeholderTextColor={BRAND.muted}
            />

            <Text style={styles.label}>Cédula de identidad *</Text>
            <TextInput
              style={styles.input}
              value={cedula}
              onChangeText={setCedula}
              placeholder="Ej: 1712345678"
              keyboardType="numeric"
              placeholderTextColor={BRAND.muted}
            />

            <Text style={styles.label}>Teléfono celular</Text>
            <TextInput
              style={styles.input}
              value={telefono}
              onChangeText={setTelefono}
              placeholder="Ej: 0991234567"
              keyboardType="phone-pad"
              placeholderTextColor={BRAND.muted}
            />

            <Text style={styles.label}>Correo electrónico</Text>
            <TextInput
              style={styles.input}
              value={correo}
              onChangeText={setCorreo}
              placeholder="Ej: correo@dominio.com"
              keyboardType="email-address"
              placeholderTextColor={BRAND.muted}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Fecha de nacimiento</Text>
            <TextInput
              style={styles.input}
              value={fechaNacimiento}
              onChangeText={setFechaNacimiento}
              placeholder="AAAA-MM-DD"
              placeholderTextColor={BRAND.muted}
            />
          </View>

          {/* Términos y LOPDP */}
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>
                Acepto términos y tratamiento de datos
              </Text>
              <Switch
                value={acepta}
                onValueChange={setAcepta}
                thumbColor={acepta ? BRAND.primary : "#ffffff"}
                trackColor={{ true: "#B7D2E2", false: "#CBD5E1" }}
              />
            </View>

            <Text style={styles.termsText}>
              Declaro que la información proporcionada es verídica. Acepto que mis
              datos personales sean tratados conforme a la normativa aplicable en
              Ecuador (LOPDP), únicamente para fines administrativos y de gestión
              interna del Club La Campiña (afiliación, control de acceso, atención
              y servicios). El Club implementará medidas de seguridad para
              proteger mi información y no la utilizará con fines comerciales ni
              la compartirá con terceros, salvo obligación legal o autorización
              expresa.
            </Text>
          </View>

          {/* Botón */}
          <TouchableOpacity
            style={[styles.btn, !canSubmit && styles.btnDisabled]}
            disabled={!canSubmit}
            onPress={onSubmit}
          >
            <Text style={styles.btnText}>Guardar datos</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: BRAND.bg,
    width: "100%",
    padding: 16,
    gap: 12,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  logo: { width: 48, height: 48 },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: BRAND.primary,
  },
  subtitle: {
    marginTop: 2,
    color: BRAND.muted,
  },

  card: {
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: BRAND.text,
    marginBottom: 4,
  },

  label: {
    color: BRAND.text,
    fontWeight: "700",
  },

  helperText: {
    color: BRAND.muted,
    lineHeight: 18,
  },

  pickerContainer: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    overflow: "hidden",
  },
  picker: {
    color: BRAND.text,
  },

  input: {
    backgroundColor: "#F8FAFC",
    width: "100%",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    color: BRAND.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
  },

  rowChecks: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  switchText: {
    color: BRAND.text,
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },

  termsText: {
    color: BRAND.muted,
    lineHeight: 18,
  },

  btn: {
    backgroundColor: BRAND.primary,
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 6,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    color: BRAND.white,
    fontSize: 17,
    fontWeight: "800",
  },
});

export default MiembrosForm;
