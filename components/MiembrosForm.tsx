import AsyncStorage from "@react-native-async-storage/async-storage";
import { Picker } from "@react-native-picker/picker";
import React, { useMemo, useRef, useState } from "react";
import SignatureScreen from "react-native-signature-canvas";

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

  // Titulares FAE
  | "SF" // Socio Fundador
  | "SA" // Socio Activo (Oficial FAE)

  // Dependientes asociados a cuenta principal
  | "CONYUGE"
  | "PADRES"
  | "JUVENIL"

  // Dependientes con cuenta propia
  | "DA"
  | "DB"
  | "DC"

  // Particulares
  | "PA"
  | "PB"

  // Corresponsales
  | "CA"
  | "CB"
  | "CC"

  // Suscriptores
  | "SG" // Gimnasio
  | "ST" // Tenis
  | "SGO"; // Golf


type SolicitudAfiliacion = {
  id: string;
  createdAt: string;
  tipoMiembro: TipoMiembro;
  nombreSocioPrincipal?: string;
  gradoMilitar?: string;
  estado?: "Activo" | "Pasivo" | "";
  fuerza?: "Terrestre" | "Naval" | "";
  nombreCompleto: string;
  cedula: string;
  telefono?: string;
  correo?: string;
  fechaNacimiento?: string;
  noSocioDemo: string;
};

const STORAGE_KEY = "solicitudes_afiliacion_v1";

async function addSolicitudLocal(s: SolicitudAfiliacion) {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const list = raw ? JSON.parse(raw) : [];
  list.unshift(s);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
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
  <TouchableOpacity onPress={onPress} style={{ flexDirection: "row", alignItems: "center", marginRight: 15 }}>
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

  const sigRef = useRef<any>(null);
  const [firma, setFirma] = useState<string | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);


  /* =======================
     NUEVOS ESTADOS
  ======================= */
  const [estadoCivil, setEstadoCivil] = useState("");
  const [tipoSangre, setTipoSangre] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [direccion, setDireccion] = useState("");

  const [telDomicilio, setTelDomicilio] = useState("");
  const [telTrabajo, setTelTrabajo] = useState("");

  const [profesion, setProfesion] = useState("");
  const [lugarTrabajo, setLugarTrabajo] = useState("");
  const [cargo, setCargo] = useState("");
  const [hobbie, setHobbie] = useState("");

  const [promocion, setPromocion] = useState("");

  /* =======================
     ESTADOS EXISTENTES
  ======================= */
  const [tipoMiembro, setTipoMiembro] = useState<TipoMiembro>("Default");
  const [acepta, setAcepta] = useState(false);

  const [nombreSocioPrincipal, setNombreSocioPrincipal] = useState("");
  const [gradoMilitar, setGradoMilitar] = useState("");
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [cedula, setCedula] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");

  const [estadoActivo, setEstadoActivo] = useState(false);
  const [estadoPasivo, setEstadoPasivo] = useState(false);
  const [fuerzaTerrestre, setFuerzaTerrestre] = useState(false);
  const [fuerzaNaval, setFuerzaNaval] = useState(false);

  const [socioReferente, setSocioReferente] = useState("");


  const isSelected = tipoMiembro !== "Default";
  const isCorresponsal = ["CA", "CB", "CC"].includes(tipoMiembro);

  /*const requiresSocioPrincipal =
    isSelected &&
    tipoMiembro !== "SF" &&
    tipoMiembro !== "SA" &&
    !isCorresponsal;*/

    //Agregado nuevo
    const requiresSocioPrincipal = ["CONYUGE", "PADRES", "JUVENIL"].includes(tipoMiembro);

    const requiresReferencia =
      ["DA", "DB", "DC", "PA", "PB"].includes(tipoMiembro);

    const isSuscriptor = ["SG", "ST", "SGO"].includes(tipoMiembro);

    const requiresMilitarData =
      ["SF", "SA", "CA", "CB", "CC"].includes(tipoMiembro);




  const canSubmit = useMemo(() => {
    if (!isSelected) return false;
    if (!acepta) return false;
    if (!nombreCompleto.trim()) return false;
    if (!cedula.trim()) return false;
    if (!estadoCivil.trim()) return false;
    if (!ciudad.trim()) return false;
    if (!direccion.trim()) return false;
    //if (!firma) return false;

    const hasPhone =
      telefono.trim() ||
      telDomicilio.trim() ||
      telTrabajo.trim();
    if (!hasPhone) return false;

    if (requiresSocioPrincipal && !nombreSocioPrincipal.trim()) return false;
    //if (!gradoMilitar.trim()) return false;
    //if (!promocion.trim()) return false;
    if (requiresMilitarData) {
    if (!gradoMilitar.trim()) return false;
    if (!promocion.trim()) return false;
    }

    if (requiresSocioPrincipal && !nombreSocioPrincipal.trim()) return false;
    if (requiresReferencia && !socioReferente.trim()) return false;

    

    return true;
  }, [
    isSelected,
    acepta,
    nombreCompleto,
    cedula,
    estadoCivil,
    ciudad,
    direccion,
    telefono,
    telDomicilio,
    telTrabajo,
    requiresSocioPrincipal,
    nombreSocioPrincipal,
    gradoMilitar,
    promocion,
    firma,
  ]);

  /*const onSubmit = async () => {
    if (!canSubmit) {
      Alert.alert("Falta información", "Completa los campos obligatorios.");
      return;
    }

    const payload: SolicitudAfiliacion = {
      id: String(Date.now()),
      createdAt: new Date().toISOString(),
      tipoMiembro,
      nombreSocioPrincipal: requiresSocioPrincipal ? nombreSocioPrincipal : undefined,
      gradoMilitar,
      estado: estadoActivo ? "Activo" : estadoPasivo ? "Pasivo" : "",
      fuerza: isCorresponsal ? (fuerzaTerrestre ? "Terrestre" : fuerzaNaval ? "Naval" : "") : undefined,
      nombreCompleto,
      cedula,
      telefono,
      correo,
      fechaNacimiento,
      noSocioDemo: "2800",
    };

    await addSolicitudLocal(payload);
    Alert.alert("Listo", "Solicitud guardada (pendiente de integración).");
  };*/
  const onSubmit = async () => {
    if (!canSubmit) {
      Alert.alert("Falta información", "Completa los campos obligatorios.");
      return;
    }

    // ⚠️ Pedimos explícitamente la firma
    sigRef.current?.readSignature();
  };


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

  /*const handleOK = (signature: string) => {
    // signature viene en base64 (data:image/png;base64,...)
    setFirma(signature);
  };*/
  /*const handleOK = async (signature: string) => {
    setFirma(signature);

    const payload: SolicitudAfiliacion = {
      id: String(Date.now()),
      createdAt: new Date().toISOString(),
      tipoMiembro,
      nombreSocioPrincipal: requiresSocioPrincipal
        ? nombreSocioPrincipal
        : undefined,
      gradoMilitar: requiresMilitarData ? gradoMilitar : undefined,
      estado: estadoActivo ? "Activo" : estadoPasivo ? "Pasivo" : "",
      fuerza: isCorresponsal
        ? fuerzaTerrestre
          ? "Terrestre"
          : fuerzaNaval
          ? "Naval"
          : ""
        : undefined,
      nombreCompleto,
      cedula,
      telefono,
      correo,
      fechaNacimiento,
      noSocioDemo: "2800",
    };

    await addSolicitudLocal(payload);

    Alert.alert("Listo", "Solicitud guardada correctamente.");
  };*/
  const handleOK = async (signature: string) => {
    if (!signature || signature.length < 100) {
      Alert.alert("Firma requerida", "Por favor firme antes de guardar.");
      return;
    }

    setFirma(signature);

    const payload: SolicitudAfiliacion = {
      id: String(Date.now()),
      createdAt: new Date().toISOString(),
      tipoMiembro,
      nombreSocioPrincipal: requiresSocioPrincipal
        ? nombreSocioPrincipal
        : undefined,
      gradoMilitar: requiresMilitarData ? gradoMilitar : undefined,
      estado: estadoActivo ? "Activo" : estadoPasivo ? "Pasivo" : "",
      fuerza: isCorresponsal
        ? fuerzaTerrestre
          ? "Terrestre"
          : fuerzaNaval
          ? "Naval"
          : ""
        : undefined,
      nombreCompleto,
      cedula,
      telefono,
      correo,
      fechaNacimiento,
      noSocioDemo: "2800",
    };

    await addSolicitudLocal(payload);

    Alert.alert("Listo", "Solicitud guardada correctamente.");
  };



  const handleClear = () => {
    sigRef.current?.clearSignature();
    setFirma(null);
  };


  return (
    <ScrollView
      contentContainerStyle={styles.container}
      scrollEnabled={scrollEnabled}
      keyboardShouldPersistTaps="handled"
    >
      {/* HEADER */}
      <View style={styles.header}>
        <Image source={require("../assets/images/campina-logo.png")} style={styles.logo} />
        <View>
          <Text style={styles.title}>Formulario de afiliación</Text>
          <Text style={styles.subtitle}>Selecciona el tipo de socio</Text>
        </View>
      </View>

      {/* SELECTOR */}
      <View style={styles.card}>
        <Text style={styles.label}>Tipo de miembro *</Text>
        <Picker selectedValue={tipoMiembro} onValueChange={(v) => setTipoMiembro(v)}>
          <Picker.Item label="Seleccionar..." value="Default" />
          <Picker.Item label="Socio Fundador" value="SF" />
          <Picker.Item label="Socio Activo" value="SA" />
          <Picker.Item label="Corresponsal A" value="CA" />
          <Picker.Item label="Corresponsal B" value="CB" />
          <Picker.Item label="Corresponsal C" value="CC" />
          <Picker.Item label="Cónyuge" value="CONYUGE" />
          <Picker.Item label="Padres" value="PADRES" />
          <Picker.Item label="Juvenil" value="JUVENIL" />

          <Picker.Item label="Dependiente A" value="DA" />
          <Picker.Item label="Dependiente B" value="DB" />
          <Picker.Item label="Dependiente C" value="DC" />

          <Picker.Item label="Particular A" value="PA" />
          <Picker.Item label="Particular B" value="PB" />

          <Picker.Item label="Suscriptor Gimnasio" value="SG" />
          <Picker.Item label="Suscriptor Tenis" value="ST" />
          <Picker.Item label="Suscriptor Golf" value="SGO" />
        </Picker>
      </View>

      {!isSelected ? null : (
        <>
          {requiresMilitarData && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                Datos militares / administrativos
              </Text>

              <Text style={styles.label}>Grado militar *</Text>
              <TextInput
                style={styles.input}
                value={gradoMilitar}
                onChangeText={setGradoMilitar}
              />

              <Text style={styles.label}>Promoción *</Text>
              <TextInput
                style={styles.input}
                value={promocion}
                onChangeText={setPromocion}
              />

              <View style={styles.rowChecks}>
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

              {isCorresponsal && (
                <View style={styles.rowChecks}>
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
              )}
            </View>
          )}


          {/* === TARJETA DATOS PERSONALES === */}
          {/* === SOCIO PRINCIPAL / REFERENCIA === */}
          {requiresSocioPrincipal && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Socio principal</Text>
              <TextInput
                style={styles.input}
                value={nombreSocioPrincipal}
                onChangeText={setNombreSocioPrincipal}
                placeholder="Nombre del socio titular"
                placeholderTextColor={BRAND.muted}
              />
            </View>
          )}

          {requiresReferencia && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Socio referente</Text>
              <TextInput
                style={styles.input}
                value={socioReferente}
                onChangeText={setSocioReferente}
                placeholder="Socio que avala la afiliación"
                placeholderTextColor={BRAND.muted}
              />
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Datos personales</Text>

            <TextInput style={styles.input} placeholder="Nombre completo *" value={nombreCompleto} onChangeText={setNombreCompleto} />
            <TextInput style={styles.input} placeholder="Cédula *" value={cedula} onChangeText={setCedula} />
            <TextInput style={styles.input} placeholder="Estado civil *" value={estadoCivil} onChangeText={setEstadoCivil} />
            <TextInput style={styles.input} placeholder="Ciudad *" value={ciudad} onChangeText={setCiudad} />
            <TextInput style={styles.input} placeholder="Dirección *" value={direccion} onChangeText={setDireccion} />
          </View>

          {/* Datos de contacto */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Datos de contacto</Text>

            <Text style={styles.label}>Teléfono celular *</Text>
            <TextInput
              style={styles.input}
              value={telefono}
              onChangeText={setTelefono}
              placeholder="Ej: 0991234567"
              keyboardType="phone-pad"
              placeholderTextColor={BRAND.muted}
            />

            <Text style={styles.label}>Teléfono domicilio (opcional)</Text>
            <TextInput
              style={styles.input}
              value={telDomicilio}
              onChangeText={setTelDomicilio}
              placeholder="Ej: 022345678"
              keyboardType="phone-pad"
              placeholderTextColor={BRAND.muted}
            />

            <Text style={styles.label}>Teléfono trabajo (opcional)</Text>
            <TextInput
              style={styles.input}
              value={telTrabajo}
              onChangeText={setTelTrabajo}
              placeholder="Ej: 022998877"
              keyboardType="phone-pad"
              placeholderTextColor={BRAND.muted}
            />

            <Text style={styles.helperText}>
              Debe registrarse al menos un número de contacto.
            </Text>
          </View>

            {/* Información laboral y personal */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Información laboral y personal</Text>

            <Text style={styles.label}>Profesión</Text>
            <TextInput
              style={styles.input}
              value={profesion}
              onChangeText={setProfesion}
              placeholder="Ej: Ingeniero, Médico, Militar"
              placeholderTextColor={BRAND.muted}
            />

            <Text style={styles.label}>Lugar de trabajo</Text>
            <TextInput
              style={styles.input}
              value={lugarTrabajo}
              onChangeText={setLugarTrabajo}
              placeholder="Ej: FAE, Empresa privada"
              placeholderTextColor={BRAND.muted}
            />

            <Text style={styles.label}>Cargo</Text>
            <TextInput
              style={styles.input}
              value={cargo}
              onChangeText={setCargo}
              placeholder="Ej: Jefe de área, Asesor"
              placeholderTextColor={BRAND.muted}
            />

            <Text style={styles.label}>Hobbie (opcional)</Text>
            <TextInput
              style={styles.input}
              value={hobbie}
              onChangeText={setHobbie}
              placeholder="Ej: Gimnasio, natación"
              placeholderTextColor={BRAND.muted}
            />
          </View>


          {/* === TÉRMINOS Y LOPDP === */}
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>
                Acepto términos y tratamiento de datos personales
              </Text>
              <Switch
                value={acepta}
                onValueChange={setAcepta}
                thumbColor={acepta ? BRAND.primary : "#ffffff"}
                trackColor={{ true: "#B7D2E2", false: "#CBD5E1" }}
              />
            </View>

            <Text style={styles.termsText}>
              Declaro que la información proporcionada es verídica. Autorizo el tratamiento
              de mis datos personales conforme a la Ley Orgánica de Protección de Datos
              Personales (LOPDP) vigente en el Ecuador, únicamente para fines administrativos,
              de control, afiliación y prestación de servicios del Club La Campiña.
              {"\n\n"}
              El Club se compromete a implementar medidas de seguridad para proteger la
              confidencialidad de la información y no compartirla con terceros, salvo
              obligación legal o autorización expresa del titular.
            </Text>
          </View>


          {/* === FIRMA DIGITAL === */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Firma del solicitante</Text>

            <Text style={styles.helperText}>
              Firme dentro del recuadro usando su dedo o lápiz digital.
            </Text>

            <View style={{ height: 220, marginTop: 10, borderWidth: 1, borderColor: BRAND.border, borderRadius: 12, overflow: "hidden" }}>
              <SignatureScreen
                ref={sigRef}
                onOK={handleOK}
                onClear={handleClear}
                onBegin={() => setScrollEnabled(false)}
                onEnd={() => setScrollEnabled(true)}
                descriptionText=""
                webStyle={`
                  .m-signature-pad--footer { display: none; }
                  body, html {
                    background-color: #fff;
                    overscroll-behavior: none;
                    touch-action: none;
                  }
                `}
                minWidth={1.5}
                maxWidth={3}
              />
            </View>

            <TouchableOpacity
              onPress={handleClear}
              style={{ marginTop: 10, alignSelf: "flex-end" }}
            >
              <Text style={{ color: BRAND.primary, fontWeight: "700" }}>
                Limpiar firma
              </Text>
            </TouchableOpacity>
          </View>



          <TouchableOpacity style={styles.btn} onPress={onSubmit}>
            <Text style={styles.btnText}>Guardar</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  header: { flexDirection: "row", gap: 10 },
  logo: { width: 60, height: 60 },
  title: { fontWeight: "800" },
  subtitle: { color: BRAND.muted },
  card: { backgroundColor: "#fff", padding: 14, borderRadius: 14, marginTop: 12 },
  sectionTitle: { fontWeight: "800" },
  label: { fontWeight: "700" },
  input: { borderWidth: 1, padding: 10, borderRadius: 10, marginTop: 6 },
  rowChecks: { flexDirection: "row", marginTop: 6 },
  switchRow: { flexDirection: "row", justifyContent: "space-between" },
  btn: { backgroundColor: BRAND.primary, padding: 14, borderRadius: 14, marginTop: 12 },
  btnText: { color: "#fff", fontWeight: "800", textAlign: "center" },
  helperText: {
    color: BRAND.muted,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  switchText: {
    color: BRAND.text,
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  termsText: {
    color: BRAND.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
});

export default MiembrosForm;
