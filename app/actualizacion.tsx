import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { crearActualizacion, nuevaActualizacionId } from "../src/data/actualizaciones";
import { guardarEnExpediente } from "../src/data/archivos";
import { RESUMEN_LOPDP } from "../src/domain/privacidad";
import {
  CAMPOS_ACTUALIZABLES,
  ETIQUETA_CAMPO,
  type CambioRegistrado,
  type CampoActualizable,
} from "../src/domain/solicitud";
import { ESTADOS_CIVILES, TIPOS_ORDENADOS, nombreTipo } from "../src/domain/tiposMiembro";
import {
  formatearNombre,
  normalizarCorreo,
  soloDigitos,
  validarCedula,
  validarNombre,
} from "../src/domain/validaciones";
import { capturarConCamara, elegirDeGaleria } from "../src/services/captura";
import { colors, radius, shadow, spacing, typography } from "../src/theme";
import {
  Button,
  Card,
  Checkbox,
  Field,
  InfoNote,
  SelectField,
  TextField,
} from "../src/ui";

type Errores = Partial<Record<string, string>>;
type Valores = Partial<Record<CampoActualizable, string>>;

/** Campos cuya modificación obliga a reimprimir la credencial del socio. */
const CAMPOS_EN_CREDENCIAL: CampoActualizable[] = ["apellidos", "nombres", "tipoMiembro"];

const CAMPOS_TEXTO_LIBRE: CampoActualizable[] = [
  "apellidos",
  "nombres",
  "ciudad",
  "direccion",
  "profesion",
  "lugarTrabajo",
  "cargo",
];

const CAMPOS_TELEFONO: CampoActualizable[] = ["celular", "telefonoDomicilio", "telefonoTrabajo"];

export default function ActualizacionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [actualizacionId] = useState(nuevaActualizacionId);
  const [numeroSocio, setNumeroSocio] = useState("");
  const [nombreSocio, setNombreSocio] = useState("");
  const [cedula, setCedula] = useState("");

  const [seleccionados, setSeleccionados] = useState<CampoActualizable[]>([]);
  const [anteriores, setAnteriores] = useState<Valores>({});
  const [nuevos, setNuevos] = useState<Valores>({});
  const [fotoUri, setFotoUri] = useState<string | null>(null);

  const [observacion, setObservacion] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [errores, setErrores] = useState<Errores>({});
  const [guardando, setGuardando] = useState(false);

  const opcionesTipo = useMemo(
    () =>
      TIPOS_ORDENADOS.map((tipo) => ({
        value: tipo.codigo,
        label: tipo.nombre,
        group: tipo.categoria,
      })),
    []
  );

  const requiereNuevaCredencial =
    !!fotoUri || seleccionados.some((campo) => CAMPOS_EN_CREDENCIAL.includes(campo));

  const alternarCampo = (campo: CampoActualizable) => {
    setSeleccionados((previos) =>
      previos.includes(campo) ? previos.filter((c) => c !== campo) : [...previos, campo]
    );
    setErrores({});
  };

  const tomarFoto = async (origen: "camara" | "galeria") => {
    const archivo =
      origen === "camara"
        ? await capturarConCamara({ recorteCuadrado: true })
        : await elegirDeGaleria({ recorteCuadrado: true });
    if (!archivo) return;

    const guardado = guardarEnExpediente(actualizacionId, archivo.uri, {
      prefijo: "foto-actualizacion",
      mimeType: archivo.mimeType,
    });
    setFotoUri(guardado.uri);
  };

  const validar = (): boolean => {
    const problemas: Errores = {};

    const nombre = validarNombre(nombreSocio, "nombre del socio");
    if (nombre) problemas.nombreSocio = nombre;

    const ci = validarCedula(cedula);
    if (ci) problemas.cedula = ci;

    if (!numeroSocio.trim()) {
      problemas.numeroSocio = "Ingrese el número de socio que consta en el sistema.";
    }

    if (seleccionados.length === 0 && !fotoUri) {
      problemas.campos = "Seleccione al menos un campo a modificar o actualice la fotografía.";
    }

    for (const campo of seleccionados) {
      if (!(nuevos[campo] ?? "").trim()) {
        problemas[`nuevo-${campo}`] = `Ingrese el nuevo valor de ${ETIQUETA_CAMPO[campo].toLowerCase()}.`;
      }
    }

    if (!acepta) {
      problemas.acepta = "Debe registrarse la autorización del socio para continuar.";
    }

    setErrores(problemas);
    return Object.keys(problemas).length === 0;
  };

  const enviar = async () => {
    if (!validar()) return;

    const cambios: CambioRegistrado[] = seleccionados.map((campo) => ({
      campo,
      anterior: (anteriores[campo] ?? "").trim(),
      nuevo: (nuevos[campo] ?? "").trim(),
    }));

    if (fotoUri) {
      cambios.push({ campo: "fotografia", anterior: "", nuevo: "Nueva fotografía capturada" });
    }

    setGuardando(true);
    try {
      const solicitud = await crearActualizacion(actualizacionId, {
        numeroSocio,
        nombreSocio,
        cedula,
        cambios,
        fotoUri,
        observacion,
        requiereNuevaCredencial,
        aceptaTratamiento: acepta,
      });

      Alert.alert(
        "Actualización registrada",
        requiereNuevaCredencial
          ? `Se registró ${solicitud.codigo}. Este cambio afecta a la credencial impresa: recuerde generar la solicitud de credencial correspondiente.`
          : `Se registró ${solicitud.codigo} con ${cambios.length} cambio(s).`,
        [{ text: "Entendido", onPress: () => router.back() }]
      );
    } catch (error) {
      console.warn("[actualizacion] Error al registrar:", error);
      Alert.alert("No se pudo registrar", "Ocurrió un problema al guardar la actualización.");
    } finally {
      setGuardando(false);
    }
  };

  const renderCampo = (campo: CampoActualizable) => {
    const etiqueta = ETIQUETA_CAMPO[campo];

    const editorNuevo = () => {
      if (campo === "tipoMiembro") {
        return (
          <SelectField
            label="Nuevo tipo de socio"
            title="Nuevo tipo de socio"
            searchable
            value={(nuevos.tipoMiembro as never) ?? null}
            options={opcionesTipo}
            onChange={(v) => setNuevos((p) => ({ ...p, tipoMiembro: v }))}
            error={errores["nuevo-tipoMiembro"]}
          />
        );
      }

      if (campo === "estadoCivil") {
        return (
          <SelectField
            label="Nuevo estado civil"
            title="Nuevo estado civil"
            value={(nuevos.estadoCivil as never) ?? null}
            options={ESTADOS_CIVILES.map((e) => ({ value: e, label: e }))}
            onChange={(v) => setNuevos((p) => ({ ...p, estadoCivil: v }))}
            error={errores["nuevo-estadoCivil"]}
          />
        );
      }

      const esTelefono = CAMPOS_TELEFONO.includes(campo);
      const esCorreo = campo === "correo";

      return (
        <TextField
          label={`Nuevo valor`}
          required
          multiline={campo === "direccion"}
          keyboardType={esTelefono ? "phone-pad" : esCorreo ? "email-address" : "default"}
          autoCapitalize={esCorreo ? "none" : "sentences"}
          maxLength={esTelefono ? 10 : undefined}
          value={nuevos[campo] ?? ""}
          onChangeText={(v) =>
            setNuevos((p) => ({ ...p, [campo]: esTelefono ? soloDigitos(v, 10) : v }))
          }
          onBlur={() => {
            if (esCorreo) setNuevos((p) => ({ ...p, correo: normalizarCorreo(p.correo ?? "") }));
            else if (CAMPOS_TEXTO_LIBRE.includes(campo) && campo !== "direccion") {
              setNuevos((p) => ({ ...p, [campo]: formatearNombre(p[campo] ?? "").trim() }));
            }
          }}
          error={errores[`nuevo-${campo}`]}
        />
      );
    };

    return (
      <View key={campo} style={styles.campo}>
        <Text style={styles.campoTitulo}>{etiqueta}</Text>

        <TextField
          label="Valor anterior (opcional)"
          value={anteriores[campo] ?? ""}
          onChangeText={(v) => setAnteriores((p) => ({ ...p, [campo]: v }))}
          placeholder="Lo que consta hoy en el sistema"
          helper="Solo para dejar constancia de qué se modificó."
        />

        {editorNuevo()}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.pantalla}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <InfoNote tone="info" icon="sync-outline">
          Registre aquí las correcciones a la ficha de un socio ya existente. La actualización no
          genera cobro. Solo lo hace la credencial, si debe reimprimirse.
        </InfoNote>

        <Card title="Socio a actualizar" icon="person">
          <TextField
            label="N.º de socio"
            required
            keyboardType="number-pad"
            maxLength={8}
            icon="barcode-outline"
            value={numeroSocio}
            onChangeText={(v) => setNumeroSocio(soloDigitos(v, 8))}
            error={errores.numeroSocio}
          />

          <TextField
            label="Nombre completo del socio"
            required
            autoCapitalize="sentences"
            icon="person-outline"
            value={nombreSocio}
            onChangeText={setNombreSocio}
            onBlur={() => setNombreSocio(formatearNombre(nombreSocio).trim())}
            error={errores.nombreSocio}
          />

          <TextField
            label="Cédula de identidad"
            required
            keyboardType="number-pad"
            maxLength={10}
            icon="card-outline"
            value={cedula}
            onChangeText={(v) => setCedula(soloDigitos(v, 10))}
            error={errores.cedula}
          />
        </Card>

        <Card
          title="¿Qué se va a modificar?"
          subtitle="Marque solo los campos que cambian."
          icon="create"
        >
          <Field error={errores.campos}>
            <View style={styles.chips}>
              {CAMPOS_ACTUALIZABLES.map((campo) => {
                const activo = seleccionados.includes(campo);
                return (
                  <Pressable
                    key={campo}
                    onPress={() => alternarCampo(campo)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: activo }}
                    style={({ pressed }) => [
                      styles.chip,
                      activo && styles.chipActivo,
                      pressed && styles.presionado,
                    ]}
                  >
                    <Ionicons
                      name={activo ? "checkmark-circle" : "ellipse-outline"}
                      size={15}
                      color={activo ? colors.navy : colors.textFaint}
                    />
                    <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>
                      {ETIQUETA_CAMPO[campo]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>
        </Card>

        {seleccionados.map(renderCampo)}

        <Card
          title="Fotografía"
          subtitle="Actualícela solo si el socio necesita cambiar la imagen de su credencial."
          icon="camera"
        >
          {fotoUri ? (
            <View style={styles.fotoFila}>
              <Image source={{ uri: fotoUri }} style={styles.foto} contentFit="cover" />
              <View style={styles.fotoAcciones}>
                <Button
                  label="Reemplazar"
                  variant="secondary"
                  icon="refresh"
                  onPress={() => tomarFoto("camara")}
                />
                <Button
                  label="Quitar"
                  variant="ghost"
                  icon="trash-outline"
                  onPress={() => setFotoUri(null)}
                />
              </View>
            </View>
          ) : (
            <View style={styles.fotoVacia}>
              <Pressable
                onPress={() => tomarFoto("camara")}
                accessibilityRole="button"
                accessibilityLabel="Tomar fotografía"
                style={({ pressed }) => [styles.fotoBoton, pressed && styles.presionado]}
              >
                <Ionicons name="camera" size={22} color={colors.navy} />
                <Text style={styles.fotoBotonTexto}>Tomar foto</Text>
              </Pressable>
              <Pressable
                onPress={() => tomarFoto("galeria")}
                accessibilityRole="button"
                accessibilityLabel="Elegir de la galería"
                style={({ pressed }) => [styles.fotoBoton, pressed && styles.presionado]}
              >
                <Ionicons name="images" size={22} color={colors.navy} />
                <Text style={styles.fotoBotonTexto}>Elegir</Text>
              </Pressable>
            </View>
          )}
        </Card>

        {requiereNuevaCredencial ? (
          <InfoNote tone="warning" icon="card-outline">
            Este cambio afecta a la información impresa en la credencial. Al terminar, registre
            también una solicitud de credencial por “Cambio de fotografía o de tipo de socio”.
          </InfoNote>
        ) : null}

        <Card title="Observaciones" icon="chatbox-ellipses">
          <TextField
            label="Motivo de la actualización"
            multiline
            maxLength={300}
            showCounter
            value={observacion}
            onChangeText={setObservacion}
            placeholder="Ej. El socio cambió de domicilio y de número celular."
          />
        </Card>

        <Card title="Protección de datos" icon="shield-checkmark">
          <Text style={styles.lopdp}>{RESUMEN_LOPDP}</Text>
          <Checkbox
            label="El socio autoriza la actualización de sus datos *"
            description="Confirmo que el socio solicitó estos cambios y que la información entregada es verídica."
            checked={acepta}
            onChange={(valor) => {
              setAcepta(valor);
              setErrores((p) => (p.acepta ? { ...p, acepta: undefined } : p));
            }}
            error={errores.acepta}
          />
        </Card>

        {seleccionados.length > 0 || fotoUri ? (
          <Card title="Resumen de cambios" icon="list">
            {seleccionados.map((campo) => (
              <View key={campo} style={styles.resumenFila}>
                <Text style={styles.resumenCampo}>{ETIQUETA_CAMPO[campo]}</Text>
                <Text style={styles.resumenValor} numberOfLines={2}>
                  {campo === "tipoMiembro"
                    ? nombreTipo((nuevos.tipoMiembro as never) ?? null)
                    : (nuevos[campo] ?? "").trim() || "—"}
                </Text>
              </View>
            ))}
            {fotoUri ? (
              <View style={styles.resumenFila}>
                <Text style={styles.resumenCampo}>Fotografía</Text>
                <Text style={styles.resumenValor}>Nueva imagen capturada</Text>
              </View>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>

      <View style={[styles.pie, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Button
          label="Registrar actualización"
          icon="save-outline"
          onPress={enviar}
          loading={guardando}
          fullWidth
          size="lg"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.bg },
  contenido: { padding: spacing.lg, paddingBottom: spacing.xxl },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1.4,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipActivo: { borderColor: colors.navy, backgroundColor: colors.skySoft },
  chipTexto: { fontSize: 12.5, fontWeight: "700", color: colors.textMuted },
  chipTextoActivo: { color: colors.navy },

  campo: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.gold,
    padding: spacing.lg,
    marginTop: spacing.md,
    ...shadow.card,
  },
  campoTitulo: { ...typography.sectionTitle, fontSize: 15 },

  fotoFila: { flexDirection: "row", gap: spacing.lg, alignItems: "center", marginTop: spacing.sm },
  foto: {
    width: 104,
    height: 104,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  fotoAcciones: { flex: 1, gap: spacing.sm },
  fotoVacia: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  fotoBoton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.4,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceAlt,
  },
  fotoBotonTexto: { fontSize: 13, fontWeight: "700", color: colors.navy },
  presionado: { opacity: 0.85 },

  lopdp: { ...typography.body, fontSize: 13, lineHeight: 19 },

  resumenFila: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resumenCampo: { fontSize: 13, color: colors.textMuted, flexShrink: 0, maxWidth: "45%" },
  resumenValor: { flex: 1, fontSize: 13.5, fontWeight: "600", color: colors.text, textAlign: "right" },

  pie: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    ...shadow.sticky,
  },
});
