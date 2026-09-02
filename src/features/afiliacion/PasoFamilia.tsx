import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Errores } from "../../domain/formularioAfiliacion";
import {
  ESTADOS_CIVILES_HIJO,
  ESTADO_CIVIL_HIJO_META,
  type DatosAfiliacion,
  type DatosHijo,
  type DependienteACargo,
  type EstadoCivilHijo,
} from "../../domain/solicitud";
import { normalizarNombre, normalizarTextoInstitucional } from "../../domain/texto";
import {
  SEXOS,
  VINCULOS_DEPENDIENTE,
  bloquesPara,
  type Sexo,
  type VinculoDependiente,
} from "../../domain/tiposMiembro";
import { normalizarCorreo, soloDigitos } from "../../domain/validaciones";
import { colors, radius, spacing, typography } from "../../theme";
import { Card, DateField, InfoNote, OptionGroup, TextField } from "../../ui";

/**
 * Recuadros «DATOS DEL CÓNYUGE», «DATOS HIJOS» y «Dependientes a su cargo» del
 * formulario impreso. Solo se muestran los que el formulario del tipo de socio
 * seleccionado contiene.
 */

type Props = {
  datos: DatosAfiliacion;
  errores: Errores;
  setDato: <K extends keyof DatosAfiliacion>(campo: K, valor: DatosAfiliacion[K]) => void;
};

let contador = 0;
const nuevaFilaId = () => `fila-${Date.now().toString(36)}-${(contador += 1)}`;

export function PasoFamilia({ datos, errores, setDato }: Props) {
  const bloques = bloquesPara(datos.tipoMiembro, datos.estadoCivil);
  if (!bloques) return null;

  const setConyuge = <K extends keyof DatosAfiliacion["conyuge"]>(
    campo: K,
    valor: DatosAfiliacion["conyuge"][K]
  ) => setDato("conyuge", { ...datos.conyuge, [campo]: valor });

  const setHijo = (indice: number, cambios: Partial<DatosHijo>) =>
    setDato(
      "hijos",
      datos.hijos.map((hijo, i) => (i === indice ? { ...hijo, ...cambios } : hijo))
    );

  const setDependiente = (indice: number, cambios: Partial<DependienteACargo>) =>
    setDato(
      "dependientesACargo",
      datos.dependientesACargo.map((d, i) => (i === indice ? { ...d, ...cambios } : d))
    );

  return (
    <>
      {bloques.conyuge ? (
        <Card
          title="Datos del cónyuge"
          subtitle="Recuadro DATOS DEL CÓNYUGE del formulario impreso."
          icon="heart"
        >
          <TextField
            label="Apellidos"
            autoCapitalize="characters"
            icon="text-outline"
            value={datos.conyuge.apellidos}
            onChangeText={(v) => setConyuge("apellidos", normalizarNombre(v))}
            error={errores.conyugeApellidos}
            placeholder="APELLIDOS"
          />
          <TextField
            label="Nombres"
            autoCapitalize="characters"
            icon="text-outline"
            value={datos.conyuge.nombres}
            onChangeText={(v) => setConyuge("nombres", normalizarNombre(v))}
            error={errores.conyugeNombres}
            placeholder="NOMBRES"
          />
          <TextField
            label="Cédula"
            keyboardType="number-pad"
            maxLength={10}
            icon="card-outline"
            value={datos.conyuge.cedula}
            onChangeText={(v) => setConyuge("cedula", soloDigitos(v, 10))}
            error={errores.conyugeCedula}
          />
          <TextField
            label="Lugar de nacimiento"
            autoCapitalize="characters"
            icon="location-outline"
            value={datos.conyuge.lugarNacimiento}
            onChangeText={(v) => setConyuge("lugarNacimiento", normalizarTextoInstitucional(v))}
          />
          <DateField
            label="Fecha de nacimiento"
            value={datos.conyuge.fechaNacimiento}
            onChange={(iso) => setConyuge("fechaNacimiento", iso)}
            maximumDate={new Date()}
          />
          <TextField
            label="Correo electrónico"
            keyboardType="email-address"
            autoCapitalize="none"
            icon="mail-outline"
            value={datos.conyuge.correo}
            onChangeText={(v) => setConyuge("correo", normalizarCorreo(v))}
            error={errores.conyugeCorreo}
          />
          <TextField
            label="Celular"
            keyboardType="number-pad"
            maxLength={10}
            icon="phone-portrait-outline"
            value={datos.conyuge.celular}
            onChangeText={(v) => setConyuge("celular", soloDigitos(v, 10))}
            error={errores.conyugeCelular}
          />
          <TextField
            label="Teléfono"
            keyboardType="number-pad"
            maxLength={9}
            icon="call-outline"
            value={datos.conyuge.telefono}
            onChangeText={(v) => setConyuge("telefono", soloDigitos(v, 9))}
          />
          <TextField
            label="Ocupación"
            autoCapitalize="characters"
            icon="briefcase-outline"
            value={datos.conyuge.ocupacion}
            onChangeText={(v) => setConyuge("ocupacion", normalizarTextoInstitucional(v))}
          />
          <TextField
            label="Lugar de trabajo"
            autoCapitalize="characters"
            icon="business-outline"
            value={datos.conyuge.lugarTrabajo}
            onChangeText={(v) => setConyuge("lugarTrabajo", normalizarTextoInstitucional(v))}
          />
        </Card>
      ) : null}

      {bloques.hijos ? (
        <Card
          title="Datos de los hijos"
          subtitle="Rejilla DATOS HIJOS del formulario impreso. Deje vacío si no aplica."
          icon="people-circle"
        >
          {datos.hijos.map((hijo, indice) => (
            <View key={hijo.id} style={styles.fila}>
              <View style={styles.filaCabecera}>
                <Text style={styles.filaTitulo}>{`Hijo ${indice + 1}`}</Text>
                <Pressable
                  onPress={() =>
                    setDato(
                      "hijos",
                      datos.hijos.filter((_, i) => i !== indice)
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar hijo ${indice + 1}`}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={20} color={colors.danger} />
                </Pressable>
              </View>

              <TextField
                label="Apellidos y nombres"
                autoCapitalize="characters"
                value={hijo.apellidosNombres}
                onChangeText={(v) => setHijo(indice, { apellidosNombres: normalizarNombre(v) })}
                error={errores[`hijo-${indice}-nombre`]}
                placeholder="APELLIDOS NOMBRES"
              />
              <DateField
                label="Fecha de nacimiento"
                value={hijo.fechaNacimiento}
                onChange={(iso) => setHijo(indice, { fechaNacimiento: iso })}
                maximumDate={new Date()}
                error={errores[`hijo-${indice}-fecha`]}
              />
              <OptionGroup<Sexo>
                label="Sexo"
                options={SEXOS.map((s) => ({ value: s, label: s }))}
                value={hijo.sexo}
                onChange={(v) => setHijo(indice, { sexo: v })}
              />
              <OptionGroup<EstadoCivilHijo>
                label="Estado civil"
                options={ESTADOS_CIVILES_HIJO.map((e) => ({
                  value: e,
                  label: ESTADO_CIVIL_HIJO_META[e],
                }))}
                value={hijo.estadoCivil}
                onChange={(v) => setHijo(indice, { estadoCivil: v })}
              />
              <TextField
                label="Correo electrónico"
                keyboardType="email-address"
                autoCapitalize="none"
                value={hijo.correo}
                onChangeText={(v) => setHijo(indice, { correo: normalizarCorreo(v) })}
                error={errores[`hijo-${indice}-correo`]}
              />
            </View>
          ))}

          <Pressable
            onPress={() =>
              setDato("hijos", [
                ...datos.hijos,
                {
                  id: nuevaFilaId(),
                  apellidosNombres: "",
                  fechaNacimiento: "",
                  sexo: null,
                  estadoCivil: null,
                  correo: "",
                },
              ])
            }
            accessibilityRole="button"
            style={({ pressed }) => [styles.agregar, pressed && styles.agregarPulsado]}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.navy} />
            <Text style={styles.agregarTexto}>Añadir hijo</Text>
          </Pressable>
        </Card>
      ) : null}

      {bloques.dependientesACargo ? (
        <Card
          title="Dependientes a su cargo"
          subtitle="Listado del formulario del socio activo: padres, cónyuge e hijos menores de 21 años."
          icon="people"
        >
          <InfoNote tone="info" icon="information-circle-outline">
            Cada dependiente que se registre aquí deberá llenar después su propio formulario de
            ingreso (PGS1-11) para obtener su credencial.
          </InfoNote>

          {datos.dependientesACargo.map((dependiente, indice) => (
            <View key={dependiente.id} style={styles.fila}>
              <View style={styles.filaCabecera}>
                <Text style={styles.filaTitulo}>{`Dependiente ${indice + 1}`}</Text>
                <Pressable
                  onPress={() =>
                    setDato(
                      "dependientesACargo",
                      datos.dependientesACargo.filter((_, i) => i !== indice)
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar dependiente ${indice + 1}`}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={20} color={colors.danger} />
                </Pressable>
              </View>

              <TextField
                label="Apellidos y nombres"
                autoCapitalize="characters"
                value={dependiente.apellidosNombres}
                onChangeText={(v) =>
                  setDependiente(indice, { apellidosNombres: normalizarNombre(v) })
                }
                error={errores[`dependiente-${indice}-nombre`]}
                placeholder="APELLIDOS NOMBRES"
              />
              <OptionGroup<VinculoDependiente>
                label="Vínculo"
                options={VINCULOS_DEPENDIENTE.map((v) => ({ value: v, label: v }))}
                value={dependiente.vinculo}
                onChange={(v) => setDependiente(indice, { vinculo: v })}
                error={errores[`dependiente-${indice}-vinculo`]}
              />
            </View>
          ))}

          {datos.dependientesACargo.length < 6 ? (
            <Pressable
              onPress={() =>
                setDato("dependientesACargo", [
                  ...datos.dependientesACargo,
                  { id: nuevaFilaId(), apellidosNombres: "", vinculo: null },
                ])
              }
              accessibilityRole="button"
              style={({ pressed }) => [styles.agregar, pressed && styles.agregarPulsado]}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.navy} />
              <Text style={styles.agregarTexto}>Añadir dependiente</Text>
            </Pressable>
          ) : (
            <InfoNote tone="warning" icon="alert-circle-outline">
              El formulario impreso admite hasta seis dependientes.
            </InfoNote>
          )}
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  fila: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  filaCabecera: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  filaTitulo: {
    ...typography.label,
    color: colors.navy,
  },
  agregar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  agregarPulsado: { opacity: 0.6 },
  agregarTexto: { color: colors.navy, fontWeight: "600", fontSize: 14 },
});
