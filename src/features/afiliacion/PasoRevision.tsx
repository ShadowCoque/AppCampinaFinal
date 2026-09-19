import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { EstadoFormulario } from "../../domain/formularioAfiliacion";
import { formatFechaCorta } from "../../domain/fechas";
import { CONSENTIMIENTOS, VERSION_AVISO } from "../../domain/privacidad";
import { ORIGEN_IDENTIDAD_META, nombreCompleto, nombreTitular } from "../../domain/solicitud";
import { documentosDelTramite, nombreTipo, reglasDe } from "../../domain/tiposMiembro";
import { colors, radius, spacing, typography } from "../../theme";
import { Card, DataRow, InfoNote } from "../../ui";

type Props = {
  estado: EstadoFormulario;
};

export function PasoRevision({ estado }: Props) {
  const { datos, firmaUri, consentimientos, identidad } = estado;
  const reglas = reglasDe(datos.tipoMiembro);
  const generados = documentosDelTramite(datos.tipoMiembro, datos.estadoCivil);

  return (
    <>
      <InfoNote tone="warning" icon="eye-outline">
        Revise la información antes de enviar. Al enviarla, la afiliación pasa al servidor del Club
        y aparece en la bandeja del Área de Socios para crearla en SAFI; después la revisa
        Contabilidad y la aprueba la Gerencia.
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
        {reglas?.requiereNumeroSocioActivo ? (
          <DataRow
            label={`Oficial FAE N.º ${datos.numeroSocioActivo || "—"}`}
            value={
              datos.oficialDependencia?.resultado === "VERIFICADO" &&
              datos.oficialDependencia.numeroSocio === datos.numeroSocioActivo
                ? `${[
                    datos.oficialDependencia.gradoMilitar,
                    datos.oficialDependencia.nombres,
                    datos.oficialDependencia.apellidos,
                  ]
                    .join(" ")
                    .trim()} (verificado en SAFI)`
                : "Sin verificar: lo comprueba la bandeja antes de crear en SAFI"
            }
          />
        ) : null}
        {generados.map((documento) => (
          <DataRow
            key={documento.codigo}
            label={documento.codigo === "Carta" ? "Carta" : documento.codigo}
            value={documento.titulo}
          />
        ))}
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
        <DataRow label="País" value={datos.pais} />
        <DataRow label="Provincia" value={datos.provincia} />
        <DataRow label="Ciudad" value={datos.ciudad} />
        <DataRow label="Dirección" value={datos.direccion} />
        <DataRow label="Celular" value={datos.celular} />
        <DataRow label="Teléfono domicilio" value={datos.telefonoDomicilio} />
        <DataRow label="Teléfono trabajo" value={datos.telefonoTrabajo} />
        <DataRow label="Correo" value={datos.correo} />
      </Card>

      {reglas?.requiereDatosMilitares ? (
        <Card title="Información institucional" icon="shield">
          <DataRow label="Grado militar" value={datos.gradoMilitar} />
          <DataRow label="Promoción" value={datos.promocion} />
          <DataRow label="Situación" value={datos.situacion} />
          <DataRow label="Fuerza" value={datos.fuerza} />
        </Card>
      ) : null}

      <Card title="Ocupación" icon="briefcase">
        <DataRow label="Profesión" value={datos.profesion} />
        <DataRow label="Lugar de trabajo" value={datos.lugarTrabajo} />
        <DataRow label="Cargo" value={datos.cargo} />
        <DataRow label="Hobbie" value={datos.hobbie} />
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
