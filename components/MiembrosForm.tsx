import { Picker } from "@react-native-picker/picker";
import { CheckBox } from '@rneui/themed';
import { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";

function MiembrosForm() {
  // ------------------------------
  // ESTADOS PRINCIPALES DEL FORM
  // ------------------------------

  const [tipoMiembro, setTipoMiembro] = useState("Default");
  const [acepta, setAcepta] = useState(false);

  // ------------------------------
  // CHECKBOXES PARA ESTADO (ACTIVO / PASIVO)
  // SOLO UNO PUEDE ESTAR ACTIVADO
  // ------------------------------
  const [estadoActivo, setEstadoActivo] = useState(false);
  const [estadoPasivo, setEstadoPasivo] = useState(false);

  // Handler para Estado.Activo
  const toggleEstadoActivo = () => {
    // Si lo prendo, apago el otro
    if (!estadoActivo) {
      setEstadoPasivo(false);
    }
    setEstadoActivo(!estadoActivo);
  };

  // Handler para Estado.Pasivo
  const toggleEstadoPasivo = () => {
    if (!estadoPasivo) {
      setEstadoActivo(false);
    }
    setEstadoPasivo(!estadoPasivo);
  };

  // ------------------------------
  // CHECKBOXES PARA FUERZA (TERRESTRE / NAVAL)
  // SOLO UNO PUEDE ESTAR ACTIVADO
  // ------------------------------
  const [fuerzaTerrestre, setFuerzaTerrestre] = useState(false);
  const [fuerzaNaval, setFuerzaNaval] = useState(false);

  const toggleFuerzaTerrestre = () => {
    if (!fuerzaTerrestre) {
      setFuerzaNaval(false);
    }
    setFuerzaTerrestre(!fuerzaTerrestre);
  };

  const toggleFuerzaNaval = () => {
    if (!fuerzaNaval) {
      setFuerzaTerrestre(false);
    }
    setFuerzaNaval(!fuerzaNaval);
  };

  // ------------------------------
  // RENDER
  // ------------------------------

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.Titulo}>Formulario de ingreso de socio</Text>

      {/* Picker: tipo de miembro */}
      <View style={styles.pickerContainer}>
        <Text style={styles.label}>Tipo de miembro (seleccionar uno)</Text>
        <Picker
          selectedValue={tipoMiembro}
          onValueChange={(itemValue) => setTipoMiembro(itemValue)}
          style={styles.picker}
          dropdownIconColor="#ffffffff"
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

      {/* Campo condicional según tipo de miembro */}
      {(tipoMiembro !== "Default" &&
        tipoMiembro !== "SF" &&
        tipoMiembro !== "SA" &&
        !["CA", "CB", "CC"].includes(tipoMiembro)) && (
        <TextInput
          style={styles.input}
          placeholder="Nombre del Socio Principal"
          placeholderTextColor="#dcdcdc"
        />
      )}

      {/* Campos exclusivos para corresponsales */}
      {["CA", "CB", "CC"].includes(tipoMiembro) && (
        <View style={styles.minicontainer}>
          <TextInput
            style={styles.input}
            placeholder="Grado Militar"
            placeholderTextColor="#dcdcdc"
          />

          {/* ESTADO: Activo / Pasivo */}
          <View style={styles.filaCheck}>
            <Text style={styles.switchText}>Estado:</Text>

            <CheckBox
              title="Activo"
              checked={estadoActivo}
              onPress={toggleEstadoActivo}
              checkedColor="#0A3267"
            />

            <CheckBox
              title="Pasivo"
              checked={estadoPasivo}
              onPress={toggleEstadoPasivo}
              checkedColor="#0A3267"
            />
          </View>

          {/* FUERZA: Terrestre / Naval */}
          <View style={styles.filaCheck}>
            <Text style={styles.switchText}>Fuerza:</Text>

            <CheckBox
              title="Terrestre"
              checked={fuerzaTerrestre}
              onPress={toggleFuerzaTerrestre}
              checkedColor="#0A3267"
            />

            <CheckBox
              title="Naval"
              checked={fuerzaNaval}
              onPress={toggleFuerzaNaval}
              checkedColor="#0A3267"
            />
          </View>
        </View>
      )}

      {/* Resto de inputs */}
      <TextInput
        style={styles.input}
        placeholder="Nombre completo"
        placeholderTextColor="#dcdcdc"
      />
      <TextInput
        style={styles.input}
        placeholder="Cédula de identidad"
        keyboardType="numeric"
        placeholderTextColor="#dcdcdc"
      />
      <TextInput
        style={styles.input}
        placeholder="Teléfono celular"
        keyboardType="phone-pad"
        placeholderTextColor="#dcdcdc"
      />
      <TextInput
        style={styles.input}
        placeholder="Correo electrónico"
        keyboardType="email-address"
        placeholderTextColor="#dcdcdc"
      />
      <TextInput
        style={styles.input}
        placeholder="Fecha de nacimiento (AAAA-MM-DD)"
        placeholderTextColor="#dcdcdc"
      />

      {/* Switch */}
      <View style={styles.switchRow}>
        <Text style={styles.switchText}>Acepta términos y condiciones</Text>
        <Switch
          value={acepta}
          onValueChange={setAcepta}
          thumbColor={acepta ? "#00c853" : "#ffffff"}
          trackColor={{ true: "#4CAF50", false: "#777" }}
        />
      </View>

      {/* Botón */}
      <TouchableOpacity style={styles.btn}>
        <Text style={styles.btnText}>Guardar datos</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#5b646eff',
    width: '100%',
    padding: 20,
    alignItems: 'center',
    marginTop: 10,
  },
  minicontainer: {
    width: "100%",
    alignItems: "flex-start",
  },
  filaCheck: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 5,
  },
  Titulo: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 25,
    color: '#ffffff',
    textAlign: 'center',
  },
  input: {
    backgroundColor: "#ffffff22",
    width: "100%",
    padding: 14,
    borderRadius: 10,
    marginBottom: 15,
    color: "#fff",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#ffffff44",
  },
  label: {
    color: "#fff",
    marginBottom: 8,
    fontWeight: "600",
  },
  pickerContainer: {
    backgroundColor: "#ffffff22",
    width: "100%",
    borderRadius: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#ffffff44",
  },
  picker: {
    color: "#dcdcdc",
  },
  switchRow: {
    flexDirection: "row",
    width: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 15,
  },
  switchText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "500",
  },
  btn: {
    backgroundColor: "#0A3267",
    width: "100%",
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
    alignItems: "center",
  },
  btnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
});

export default MiembrosForm;
