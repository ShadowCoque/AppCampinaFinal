import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { EstadoFormulario } from "../../domain/formularioAfiliacion";
import { formatFechaCorta } from "../../domain/fechas";
import { CONSENTIMIENTOS, VERSION_AVISO } from "../../domain/privacidad";
import {
  ORIGEN_IDENTIDAD_META,
  modalidadDebitoDe,
  nombreCompleto,
  nombreTitular,
  type DatosCartaCompromiso,
} from "../../domain/solicitud";
import {
  REGLA_GARANTE,
  REGLA_OFICIAL,
  estadoReferencia,
  nombreConGrado,
  reglaDependencia,
  reglaTitular,
  rotuloDependencia,
  type ReglaSocio,
  type VerificacionSocio,
} from "../../domain/sociosSafi";
import { documentosDelTramite, nombreTipo, reglasDe } from "../../domain/tiposMiembro";
import { colors, radius, spacing, typography } from "../../theme";
import { Button, Card, DataRow, InfoNote } from "../../ui";

type Props = {
  estado: EstadoFormulario;
  /** Abre el formulario completo, tal como se generará. */
  onVistaPrevia: () => void;
};

/** Lo que SAFI dijo de un socio al que se refiere el trámite, en una línea. */
function enSafi(
  verificacion: VerificacionSocio | null | undefined,
  numero: string,
  regla: ReglaSocio | null
): string {
  if (!regla) return "";
  switch (estadoReferencia(verificacion, numero, regla)) {
    case "VERIFICADO":
      return "verificado en SAFI";
    case "NO_ENCONTRADO":
      return "SAFI no lo tiene";
    case "NO_ADMITIDO":
      return `en SAFI es ${verificacion?.tipoSocioSafi || "de otra categoría"}`;
    default:
      return "sin verificar: lo comprueba la bandeja antes de crear en SAFI";
  }
}

/** «Cuenta de ahorros · BANCO PICHINCHA» o «Tarjeta de crédito terminada en 1234». */
function debito(carta: DatosCartaCompromiso): string {
  switch (modalidadDebitoDe(carta)) {
    case "CUENTA":
      return `Cuenta ${carta.tipoCuenta === "CORRIENTE" ? "corriente" : "de ahorros"} · ${
        carta.entidadFinanciera || "—"
      }`;
    case "TARJETA":
      return `Tarjeta de crédito terminada en ${carta.tarjetaCredito.slice(-4) || "—"}`;
    default:
      return "Sin elegir";
  }
}

export function PasoRevision({ estado, onVistaPrevia }: Props) {
  const { datos, firmaUri, consentimientos, identidad } = estado;
  const reglas = reglasDe(datos.tipoMiembro);
  const generados = documentosDelTramite(datos.tipoMiembro, datos.estadoCivil);
  const reglaDep = reglaDependencia(datos.tipoMiembro);
  const reglaTit = reglaTitular(datos.tipoMiembro);

  return (
    <>
      <InfoNote tone="warning" icon="eye-outline">
        Revise la información antes de enviar. Al enviarla, la afiliación pasa al servidor del Club
        y aparece en la bandeja del Área de Socios para crearla en SAFI; después la revisa
        Contabilidad y la aprueba la Gerencia.
      </InfoNote>

      <Button
        label="Ver el formulario completo"
        icon="document-text-outline"
        variant="secondary"
        onPress={onVistaPrevia}
        fullWidth
      />

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
            <DataRow
              label={`Socio titular N.º ${datos.titularNumeroSocio || "—"}`}
              value={`${nombreTitular(datos)} (${enSafi(
                datos.titularVerificado,
                datos.titularNumeroSocio,
                reglaTit
              )})`}
            />
            <DataRow label="Cédula del titular" value={datos.titularCedula} />
          </>
        ) : null}
        {reglaDep ? (
          <DataRow
            label={`${rotuloDependencia(datos.tipoMiembro)} · N.º ${datos.numeroSocioActivo || "—"}`}
            value={
              estadoReferencia(datos.oficialDependencia, datos.numeroSocioActivo, reglaDep) ===
                "VERIFICADO" && datos.oficialDependencia
                ? `${nombreConGrado(datos.oficialDependencia)} (verificado en SAFI)`
                : enSafi(datos.oficialDependencia, datos.numeroSocioActivo, reglaDep)
            }
          />
        ) : null}
        {datos.tipoMiembro === "DC" ? (
          <DataRow
            label={`Oficial FAE del que desciende · N.º ${datos.numeroOficialFae || "—"}`}
            value={
              !datos.numeroOficialFae
                ? "Sin indicar: la Jefatura de Socios lo completa en la bandeja"
                : estadoReferencia(datos.oficialFaeVerificado, datos.numeroOficialFae, REGLA_OFICIAL) ===
                      "VERIFICADO" && datos.oficialFaeVerificado
                  ? `${nombreConGrado(datos.oficialFaeVerificado)} (verificado en SAFI)`
                  : enSafi(datos.oficialFaeVerificado, datos.numeroOficialFae, REGLA_OFICIAL)
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
                value={`${garante.apellidosNombres} · Socio N.º ${garante.numeroSocio} (${enSafi(
                  garante.verificacion,
                  garante.numeroSocio,
                  REGLA_GARANTE
                )})`}
              />
            ))
          : null}
        {datos.carta ? (
          <>
            <DataRow
              label="Carta de compromiso"
              value={`Cuota anual USD ${datos.carta.cuotaAnual || "—"}${
                datos.carta.cuotaMensualizada
                  ? ` · mensualizado USD ${datos.carta.cuotaMensualizada}`
                  : ""
              }`}
            />
            <DataRow label="Débito automático" value={debito(datos.carta)} />
          </>
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
