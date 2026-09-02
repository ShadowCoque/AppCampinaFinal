import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { formatFechaCorta } from "../../domain/fechas";
import type { Errores } from "../../domain/formularioAfiliacion";
import {
  NIVEL_ACCESO,
  NIVEL_META,
  TARIFA_CONSULTA,
  aplicarDatosSnic,
  consultaDisponible,
  MODO_DEMOSTRACION,
  type DatosSnic,
  type ValoresDesdeSnic,
} from "../../domain/snic";
import type { DatosAfiliacion, RegistroIdentidad } from "../../domain/solicitud";
import { soloDigitos } from "../../domain/validaciones";
import { consultarPorCedula } from "../../services/snic";
import { colors, radius, spacing, typography } from "../../theme";
import { Badge, Button, Card, Checkbox, DataRow, InfoNote, TextField } from "../../ui";

type Props = {
  datos: DatosAfiliacion;
  identidad: RegistroIdentidad;
  errores: Errores;
  setDato: <K extends keyof DatosAfiliacion>(campo: K, valor: DatosAfiliacion[K]) => void;
  onIdentidad: (identidad: RegistroIdentidad) => void;
  /** Aplica al formulario los valores devueltos por el Registro Civil. */
  onDatosDelRegistro: (valores: ValoresDesdeSnic) => void;
};

type Aviso = { tono: "info" | "warning" | "danger" | "success"; icono: keyof typeof Ionicons.glyphMap; texto: string };

export function PasoIdentificacion({
  datos,
  identidad,
  errores,
  setDato,
  onIdentidad,
  onDatosDelRegistro,
}: Props) {
  const [consultando, setConsultando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [respuesta, setRespuesta] = useState<DatosSnic | null>(null);

  const disponible = consultaDisponible();
  const tarifa = NIVEL_ACCESO === "NO_DISPONIBLE" ? null : TARIFA_CONSULTA[NIVEL_ACCESO];

  const consultar = async () => {
    setConsultando(true);
    setAviso(null);
    setRespuesta(null);

    try {
      const resultado = await consultarPorCedula(datos.cedula);

      if (resultado.estado === "OK") {
        const { valores, camposLlenos } = aplicarDatosSnic(resultado.datos);
        onDatosDelRegistro(valores);
        setRespuesta(resultado.datos);
        onIdentidad({
          origen: resultado.nivel === "DEMOGRAFICO_BIOMETRICO" ? "SNIC_BIOMETRICO" : "SNIC_DEMOGRAFICO",
          consultadoEn: new Date().toISOString(),
          camposVerificados: camposLlenos,
          fotoRegistroCivilUri: resultado.datos.fotografiaBase64
            ? `data:image/jpeg;base64,${resultado.datos.fotografiaBase64}`
            : null,
          identidadConfirmada: false,
        });
        setAviso({
          tono: "success",
          icono: "checkmark-circle",
          texto: `Se obtuvieron ${camposLlenos.length} datos del Registro Civil. Revise que correspondan a la cédula física del solicitante.`,
        });
        return;
      }

      const tonos: Record<string, Aviso["tono"]> = {
        NO_ENCONTRADO: "danger",
        FALLECIDO: "danger",
        SIN_CONVENIO: "info",
        ERROR: "warning",
      };
      setAviso({
        tono: tonos[resultado.estado] ?? "warning",
        icono: resultado.estado === "SIN_CONVENIO" ? "information-circle" : "alert-circle",
        texto: resultado.mensaje,
      });
      onIdentidad({ origen: "MANUAL", camposVerificados: [], identidadConfirmada: false });
    } finally {
      setConsultando(false);
    }
  };

  return (
    <>
      <Card
        title="Número de cédula"
        subtitle="Es el único dato que debe escribir el solicitante para empezar."
        icon="card"
      >
        <TextField
          label="Cédula de identidad"
          required
          keyboardType="number-pad"
          maxLength={10}
          icon="card-outline"
          value={datos.cedula}
          onChangeText={(v) => {
            setDato("cedula", soloDigitos(v, 10));
            setAviso(null);
            setRespuesta(null);
          }}
          error={errores.cedula}
          helper="Se verifica automáticamente el dígito verificador."
          placeholder="10 dígitos"
        />

        {disponible ? (
          <>
            <Button
              label="Consultar en el Registro Civil"
              icon="cloud-download-outline"
              onPress={consultar}
              loading={consultando}
              disabled={datos.cedula.length !== 10}
              fullWidth
              style={styles.boton}
            />
            {tarifa !== null ? (
              <Text style={styles.tarifa}>
                Nivel habilitado: {NIVEL_META[NIVEL_ACCESO].etiqueta} · costo por consulta USD{" "}
                {tarifa.toFixed(2)}
              </Text>
            ) : null}
            {MODO_DEMOSTRACION ? (
              <InfoNote tone="warning" icon="flask-outline">
                Modo demostración activo: los datos que se muestran son ficticios y no provienen del
                Registro Civil.
              </InfoNote>
            ) : null}
          </>
        ) : (
          <InfoNote tone="info" icon="time-outline">
            {NIVEL_META.NO_DISPONIBLE.descripcion} Continúe con el formulario: los datos de identidad
            se solicitan en el paso “Datos personales”.
          </InfoNote>
        )}

        {aviso ? (
          <InfoNote tone={aviso.tono} icon={aviso.icono}>
            {aviso.texto}
          </InfoNote>
        ) : null}

        {disponible ? (
          <Text style={styles.lopdp}>
            La consulta al Registro Civil se realiza para verificar su identidad como medida previa a
            la afiliación, y está informada en el numeral 2.1 del aviso de privacidad del Club.
          </Text>
        ) : null}
      </Card>

      {respuesta ? (
        <Card title="Datos entregados por el Registro Civil" icon="shield-checkmark">
          <View style={styles.origen}>
            <Badge
              label={NIVEL_META[NIVEL_ACCESO].etiqueta}
              tone={identidad.origen === "SNIC_BIOMETRICO" ? "success" : "info"}
              icon="ribbon"
            />
          </View>

          <DataRow label="Apellidos" value={respuesta.apellidos} />
          <DataRow label="Nombres" value={respuesta.nombres} />
          <DataRow
            label="Fecha de nacimiento"
            value={respuesta.fechaNacimiento ? formatFechaCorta(respuesta.fechaNacimiento) : null}
          />
          <DataRow label="Estado civil" value={respuesta.estadoCivil} />
          <DataRow label="Nacionalidad" value={respuesta.nacionalidad} />
          <DataRow label="Lugar de nacimiento" value={respuesta.lugarNacimiento} />

          <Text style={styles.nota}>
            Estos valores ya quedaron cargados en el formulario. Podrá corregir el domicilio y los
            datos de contacto en los pasos siguientes.
          </Text>
        </Card>
      ) : null}

      {identidad.fotoRegistroCivilUri ? (
        <Card
          title="Verificación de identidad"
          subtitle="Compare al solicitante con la fotografía oficial."
          icon="finger-print"
        >
          <View style={styles.cotejo}>
            <Image
              source={{ uri: identidad.fotoRegistroCivilUri }}
              style={styles.foto}
              contentFit="cover"
            />
            <View style={styles.cotejoTexto}>
              <Text style={styles.cotejoTitulo}>Fotografía del Registro Civil</Text>
              <Text style={styles.cotejoDetalle}>
                Verifique además que coincida con la cédula física que presenta el solicitante.
              </Text>
            </View>
          </View>

          <Checkbox
            label="Confirmo que la persona presente corresponde a esta fotografía *"
            description="Queda registrado como evidencia de la verificación de identidad realizada por el Área de Socios."
            checked={identidad.identidadConfirmada}
            onChange={(valor) => onIdentidad({ ...identidad, identidadConfirmada: valor })}
            error={errores.identidadConfirmada}
          />
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  boton: { marginTop: spacing.lg },
  tarifa: { ...typography.caption, marginTop: spacing.sm, textAlign: "center" },
  lopdp: { ...typography.caption, fontSize: 11.5, marginTop: spacing.md, lineHeight: 16 },
  origen: { marginBottom: spacing.sm },
  nota: { ...typography.caption, marginTop: spacing.md },

  cotejo: { flexDirection: "row", gap: spacing.lg, alignItems: "center" },
  foto: {
    width: 96,
    height: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceAlt,
  },
  cotejoTexto: { flex: 1 },
  cotejoTitulo: { ...typography.cardTitle, fontSize: 14 },
  cotejoDetalle: { ...typography.caption, marginTop: 4 },
});
