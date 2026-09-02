import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { nombreDocumento } from "../../domain/documentos";
import { FORMA_PAGO_META } from "../../domain/facturacion";
import type { EstadoFormulario } from "../../domain/formularioAfiliacion";
import { formatFechaCorta } from "../../domain/fechas";
import { CONSENTIMIENTOS, VERSION_AVISO } from "../../domain/privacidad";
import { ORIGEN_IDENTIDAD_META, nombreCompleto, nombreTitular } from "../../domain/solicitud";
import { formularioPara, nombreTipo, reglasDe } from "../../domain/tiposMiembro";
import { colors, radius, spacing, typography } from "../../theme";
import { Card, DataRow, InfoNote } from "../../ui";

type Props = {
  estado: EstadoFormulario;
};

export function PasoRevision({ estado }: Props) {
  const { datos, documentos, firmaUri, consentimientos, identidad } = estado;
  const reglas = reglasDe(datos.tipoMiembro);
  const formulario = formularioPara(datos.tipoMiembro, datos.estadoCivil);

  return (
    <>
      <InfoNote tone="warning" icon="eye-outline">
        Revise la información antes de enviar. Una vez enviada, cualquier corrección deberá
        solicitarse al Área de Socios.
      </InfoNote>

      <Card title="Verificación de identidad" icon="shield-checkmark">
        <DataRow label="Origen de los datos" value={ORIGEN_IDENTIDAD_META[identidad.origen].etiqueta} />
        <DataRow
          label="Cotejo de identidad"
          value={
            identidad.origen === "SNIC_BIOMETRICO"
              ? identidad.identidadConfirmada
                ? "Confirmado contra la fotografía del Registro Civil"
                : "Pendiente de confirmación"
              : "Contra la cédula física del solicitante"
          }
        />
        <Text style={styles.detalleIdentidad}>{ORIGEN_IDENTIDAD_META[identidad.origen].detalle}</Text>
      </Card>

      <Card title="Tipo de socio" icon="pricetag">
        <DataRow label="Tipo solicitado" value={nombreTipo(datos.tipoMiembro)} />
        {reglas?.requiereSocioTitular ? (
          <>
            <DataRow label="Socio titular" value={nombreTitular(datos)} />
            <DataRow label="Cédula del titular" value={datos.titularCedula} />
          </>
        ) : null}
        {formulario ? (
          <DataRow
            label="Formulario que se generará"
            value={`${formulario.codigo} — ${formulario.titulo}`}
          />
        ) : null}
        {datos.garantes.length > 0
          ? datos.garantes.map((garante, indice) => (
              <DataRow
                key={garante.id}
                label={
                  datos.garantes.length === 1 ? "Socio garante" : `Socio garante ${indice + 1}`
                }
                value={`${garante.apellidosNombres} · Socio N.º ${garante.numeroSocio}`}
              />
            ))
          : null}
        {datos.carta ? (
          <DataRow
            label="Carta de compromiso"
            value={`Cuota anual USD ${datos.carta.cuotaAnual || "—"}`}
          />
        ) : null}
      </Card>

      <Card title="Datos personales" icon="person">
        <DataRow label="Nombre completo" value={nombreCompleto(datos)} />
        <DataRow label="Cédula" value={datos.cedula} />
        <DataRow
          label="Fecha de nacimiento"
          value={datos.fechaNacimiento ? formatFechaCorta(datos.fechaNacimiento) : null}
        />
        <DataRow label="Sexo" value={datos.sexo} />
        <DataRow label="Lugar de nacimiento" value={datos.lugarNacimiento} />
        <DataRow label="Estado civil" value={datos.estadoCivil} />
        <DataRow label="Tipo de sangre" value={datos.tipoSangre} />
      </Card>

      <Card title="Contacto" icon="call">
        <DataRow label="Provincia" value={datos.provincia} />
        <DataRow label="Ciudad" value={datos.ciudad} />
        <DataRow label="Dirección" value={datos.direccion} />
        <DataRow label="Celular" value={datos.celular} />
        <DataRow label="Teléfono domicilio" value={datos.telefonoDomicilio} />
        <DataRow label="Teléfono trabajo" value={datos.telefonoTrabajo} />
        <DataRow label="Correo" value={datos.correo} />
      </Card>

      <Card title="Forma de pago" icon="card">
        <DataRow
          label="Modalidad"
          value={datos.formaPago ? FORMA_PAGO_META[datos.formaPago].etiqueta : null}
        />
      </Card>

      {reglas?.requiereDatosMilitares ? (
        <Card title="Información institucional" icon="shield">
          <DataRow label="Grado militar" value={datos.gradoMilitar} />
          <DataRow label="Promoción" value={datos.promocion} />
          <DataRow label="Situación" value={datos.situacion} />
          {reglas.requiereFuerza ? <DataRow label="Fuerza" value={datos.fuerza} /> : null}
        </Card>
      ) : null}

      {reglas?.requiereDatosLaborales ? (
        <Card title="Información laboral" icon="briefcase">
          <DataRow label="Profesión" value={datos.profesion} />
          <DataRow label="Lugar de trabajo" value={datos.lugarTrabajo} />
          <DataRow label="Cargo" value={datos.cargo} />
          <DataRow label="Interés recreativo" value={datos.hobbie} />
        </Card>
      ) : null}

      <Card
        title="Fotografía del socio"
        icon="documents"
      >
        {documentos.length === 0 ? (
          <Text style={styles.vacio}>No se adjuntó la fotografía.</Text>
        ) : (
          documentos.map((documento) => (
            <View key={documento.id} style={styles.documento}>
              <Ionicons
                name={documento.mimeType.startsWith("image/") ? "image" : "document-text"}
                size={16}
                color={colors.navy}
              />
              <Text style={styles.documentoTexto} numberOfLines={1}>
                {nombreDocumento(documento.tipo)}
              </Text>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            </View>
          ))
        )}
      </Card>

      <Card title="Consentimiento y firma" icon="shield-checkmark">
        {CONSENTIMIENTOS.map((consentimiento) => {
          const aceptado = consentimientos[consentimiento.clave];
          return (
            <View key={consentimiento.clave} style={styles.consentimiento}>
              <Ionicons
                name={aceptado ? "checkmark-circle" : "close-circle"}
                size={17}
                color={aceptado ? colors.success : colors.textFaint}
              />
              <Text style={styles.consentimientoTexto}>{consentimiento.titulo}</Text>
            </View>
          );
        })}

        <Text style={styles.version}>Aviso de privacidad versión {VERSION_AVISO}</Text>

        {firmaUri ? (
          <View style={styles.firma}>
            <Image source={{ uri: firmaUri }} style={styles.firmaImagen} contentFit="contain" />
            <Text style={styles.firmaPie}>{nombreCompleto(datos) || "Solicitante"}</Text>
          </View>
        ) : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  vacio: { ...typography.caption },
  documento: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  documentoTexto: { flex: 1, fontSize: 13.5, color: colors.text, fontWeight: "600" },

  consentimiento: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 5 },
  consentimientoTexto: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
  version: { ...typography.caption, marginTop: spacing.sm, fontStyle: "italic" },
  detalleIdentidad: { ...typography.caption, marginTop: spacing.sm },

  firma: {
    marginTop: spacing.md,
    height: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
  },
  firmaImagen: { flex: 1 },
  firmaPie: {
    textAlign: "center",
    fontSize: 11.5,
    color: colors.textMuted,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
    paddingTop: 4,
  },
});
