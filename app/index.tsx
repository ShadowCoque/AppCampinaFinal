import MiembrosForm from "@/components/MiembrosForm";
import { StyleSheet, View } from "react-native";

export default function Index() {
  return (
    <View style={styles.container}>
      <View style={styles.ImageContainer}>
        {/*<Image
          source={require("@/assets/images-joel/logo-campiña.png")}
          style={styles.logo}
          resizeMode="contain"
        />*/}
      </View>
      <MiembrosForm />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffffff", // Fondo blanco limpio
    alignItems: "center",
    justifyContent: "flex-start", // Alinea al inicio verticalmente
    padding: 10,
    paddingHorizontal: 10,
    width: "100%",
  },
  logo: {
    width: "100%", // Altura fija para el logo
    maxWidth: 500, // Evita que sea enorme en tablets grandes
  },
  ImageContainer: {
    width: "100%",
    height: "auto",
    alignItems: "center",
    backgroundColor: "#0A3267",
    backgroundImage: "radial-gradient(circle, #ffffffff, #0A3267)",
  },
});
