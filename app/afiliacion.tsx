import React from "react";
import { StyleSheet, View } from "react-native";
import MiembrosForm from "../components/MiembrosForm"; // ajusta ruta según tu proyecto

export default function AfiliacionScreen() {
  return (
    <View style={styles.container}>
      <MiembrosForm />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
