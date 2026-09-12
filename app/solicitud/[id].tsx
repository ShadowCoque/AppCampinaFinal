import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { formatearTamano } from "../../src/data/archivos";
import { eliminarSolicitud, obtenerSolicitud } from "../../src/data/solicitudes";
import { FORMA_PAGO_META } from "../../src/domain/facturacion";
import { formatFechaCorta, formatFechaHora } from "../../src/domain/fechas";
import { CONSENTIMIENTOS } from "../../src/domain/privacidad";
import { MODO_FIRMA_META } from "../../src/domain/firmaElectronica";
import {
  AREA_META,
  ESTADO_META,
  ORIGEN_IDENTIDAD_META,
  ROL_ADJUNTO_META,
  adjuntosFaltantes,
  nombreCompleto,
  nombreTitular,
  type Area,
  type ConstanciaTramite,
  type SolicitudAfiliacion,
} from "../../src/domain/solicitud";
import { nombreDocumento } from "../../src/domain/documentos";
import { numeroEnExpediente } from "../../src/domain/tareas";
import { documentosDelTramite, nombreTipo, reglasDe } from "../../src/domain/tiposMiembro";
import { exportarSolicitudAfiliacion } from "../../src/services/pdf";
import { estaSincronizada, sincronizar } from "../../src/services/servidor";
import { colors, radius, spacing, typography } from "../../src/theme";
import { Badge, Button, Card, DataRow, InfoNote } from "../../src/ui";

/**
 * Constancia del reverso del formulario, lista para mostrarse: quién actuó,
 * cuándo y con qué observación. Las tres se muestran siempre, incluso las que
 * aún están pendientes, tal como el recuadro impreso.
 */
function ConstanciaFila({
  area,
  constancia,
  extra,
}: {
  area: Area;
  constancia: (ConstanciaTramite & { numeroFactura?: string }) | null;
  extra?: string;
}) {
  const meta = AREA_META[area];
  const accion = area === "SOCIOS" ? "Registrado" : area === "CONTABILIDAD" ? "Revisado" : "Aprobado";

  return (
    <View style={styles.constancia}>
      <View style={styles.constanciaCabecera}>
        <Ionicons
          name={constancia ? "checkmark-circle" : "ellipse-outline"}
          size={17}
          color={constancia ? colors.success : colors.textFaint}
        />
        <Text style={styles.constanciaAccion}>{accion}</Text>
        <Text style={styles.constanciaArea}>{meta.etiqueta}</Text>
      </View>
      {constancia ? (
        <>
          <Text style={styles.constanciaResponsable}>{constancia.responsable}</Text>
          <Text style={styles.constanciaFecha}>{formatFechaHora(constancia.en)}</Text>
          {extra ? <Text style={styles.constanciaFecha}>{extra}</Text> : null}
          {constancia.observacion ? (
            <Text style={styles.constanciaObservacion}>{constancia.observacion}</Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.constanciaPendiente}>Pendiente</Text>
      )}
    </View>
  );
}

export default function DetalleSolicitudScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [solicitud, setSolicitud] = useState<SolicitudAfiliacion | null>(null);
  const [enServidor, setEnServidor] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    if (!id) return;
    const [local, entregada] = await Promise.all([obtenerSolicitud(id), estaSincronizada(id)]);
    setSolicitud(local);
    setEnServidor(entregada);
    setCargando(false);
  }, [id]);

  // Al volver a esta pantalla se relee: el avance del trámite pudo cambiar en
  // el servidor mientras tanto.
  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar])
  );

  if (cargando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator color={colors.navy} size="large" />
      </View>
    );
  }

  if (!solicitud) {
    return (
      <View style={styles.centro}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.textFaint} />
        <Text style={styles.noEncontrada}>No se encontró la solicitud.</Text>
        <Button label="Volver" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const { datos } = solicitud;
  const meta = ESTADO_META[solicitud.estado];
  const reglas = reglasDe(datos.tipoMiembro);
  const documentosTramite = documentosDelTramite(datos.tipoMiembro, datos.estadoCivil);
  const { tramite, expediente } = solicitud;
  const faltantes = solicitud.estado === "RECHAZADA" ? [] : adjuntosFaltantes(solicitud);
  const numero = numeroEnExpediente(solicitud);

  const exportar = async () => {
    setExportando(true);
    await exportarSolicitudAfiliacion(solicitud);
    setExportando(false);
  };

  /** Entrega lo pendiente y trae el avance que registró el servidor. */
  const enviarAhora = async () => {
    setEnviando(true);
    try {
      const resumen = await sincronizar();
      await cargar();
      if (resumen.detalle && resumen.estado !== "AL_DIA") {
        Alert.alert("Envío al servidor", resumen.detalle);
      }
    } finally {
      setEnviando(false);
    }
  };

  const borrar = () => {
    Alert.alert(
      "Eliminar solicitud de la tableta",
      enServidor
        ? "Se eliminará la copia de esta tableta. El trámite y su expediente siguen en el servidor del Club."
        : "Esta afiliación TODAVÍA NO LLEGÓ al servidor: si la elimina, se pierde junto con la firma y la fotografía. Esta acción no se puede deshacer.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            await eliminarSolicitud(solicitud.id);
            router.back();
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.pantalla} contentContainerStyle={styles.contenido}>
      <View style={styles.cabecera}>
        <View style={styles.cabeceraFila}>
          <Text style={styles.codigo}>{solicitud.codigo}</Text>
          <Badge label={meta.etiqueta} tone={meta.tono} />
        </View>
        <Text style={styles.nombre}>{nombreCompleto(datos) || "Sin nombre"}</Text>
        <Text style={styles.subtitulo}>
          {nombreTipo(datos.tipoMiembro)} · C.I. {datos.cedula || "—"}
        </Text>
        <Text style={styles.estadoDescripcion}>{meta.descripcion}</Text>
      </View>

      <View style={styles.acciones}>
        <Button
          label="Exportar formulario en PDF"
          icon="download-outline"
          variant="secondary"
          onPress={exportar}
          loading={exportando}
          fullWidth
        />
      </View>

      <Card title="Envío al servidor del Club" icon="cloud-upload">
        {!enServidor ? (
          <InfoNote tone="danger" icon="cloud-offline">
            Esta afiliación todavía no llegó al servidor, así que no aparece en ninguna bandeja. Se
            envía sola en cuanto hay conexión y sesión; también puede enviarla ahora.
          </InfoNote>
        ) : faltantes.length > 0 ? (
          <InfoNote tone="warning" icon="alert-circle-outline">
            {`El servidor tiene el trámite pero le falta: ${faltantes
              .map((rol) => ROL_ADJUNTO_META[rol].etiqueta.toLowerCase())
              .join(", ")}. Sin la firma no se puede componer el formulario.`}
          </InfoNote>
        ) : (
          <InfoNote tone="success" icon="cloud-done">
            El servidor tiene el trámite completo: datos, firmas y fotografía.
          </InfoNote>
        )}
        {!enServidor || faltantes.length > 0 ? (
          <Button
            label="Enviar ahora"
            icon="sync"
            onPress={enviarAhora}
            loading={enviando}
            fullWidth
            style={styles.botonEnviar}
          />
        ) : (
          <Button
            label="Actualizar el avance"
            icon="refresh"
            variant="secondary"
            onPress={enviarAhora}
            loading={enviando}
            fullWidth
            style={styles.botonEnviar}
          />
        )}
      </Card>

      <Card title="Información interna del Club" icon="clipboard" subtitle="Reverso del formulario">
        <DataRow
          label="Fecha de registro"
          value={tramite.fechaRegistro ? formatFechaCorta(tramite.fechaRegistro) : null}
        />
        <DataRow label="Número de socio" value={numero || "Lo asigna el Área de Socios en la bandeja"} />
        <DataRow label="Número de tarjeta" value={tramite.numeroTarjeta} />
        {reglas?.requiereNumeroSocioActivo ? (
          <DataRow label="Número de socio activo" value={datos.numeroSocioActivo} />
        ) : null}
        {documentosTramite.map((documento) => (
          <DataRow
            key={documento.codigo}
            label={documento.codigo === "Carta" ? "Carta" : documento.codigo}
            value={documento.titulo}
          />
        ))}

        {tramite.devolucion && solicitud.estado === "OBSERVADA" ? (
          <InfoNote tone="warning" icon="return-down-back">
            {`${AREA_META[tramite.devolucion.area].etiqueta} la devolvió el ${formatFechaHora(
              tramite.devolucion.en
            )}: «${tramite.devolucion.observacion}». Se atiende desde la bandeja web del Área de Socios.`}
          </InfoNote>
        ) : null}
        {tramite.anulacion ? (
          <InfoNote tone="danger" icon="close-circle">
            {`Anulada el ${formatFechaHora(tramite.anulacion.en)} por ${tramite.anulacion.responsable}: «${tramite.anulacion.observacion}».`}
          </InfoNote>
        ) : null}

        <View style={styles.constancias}>
          <ConstanciaFila area="SOCIOS" constancia={tramite.registro} />
          <ConstanciaFila
            area="CONTABILIDAD"
            constancia={tramite.revision}
            extra={tramite.revision?.numeroFactura ? `FC: ${tramite.revision.numeroFactura}` : undefined}
          />
          <ConstanciaFila area="GERENCIA" constancia={tramite.aprobacion} />
        </View>
      </Card>

      <Card title="Expediente digital" icon="folder-open">
        <DataRow
          label="Carpeta del repositorio"
          value={tramite.numeroSocio ? `${tramite.numeroSocio} ${nombreCompleto(datos)}` : "Sin asignar"}
        />
        <DataRow
          label="Creado en SAFI"
          value={expediente.socioSafiId ? `Sí (ficha ${expediente.socioSafiId})` : "Todavía no"}
        />
        <DataRow
          label="Documentos en SAFI"
          value={
            expediente.safi === "CARGADO"
              ? "Publicados"
              : expediente.safi === "ERROR"
                ? `Con error: ${expediente.safiMensaje ?? "sin detalle"}`
                : solicitud.estado === "APROBADA"
                  ? "Pendientes"
                  : "Se publican al aprobarse"
          }
        />
        {expediente.escaneosPendientes.length > 0 ? (
          <InfoNote tone="warning" icon="scan-outline">
            {`Falta depositar en la carpeta compartida: ${expediente.escaneosPendientes
              .map(nombreDocumento)
              .join(", ")}.`}
          </InfoNote>
        ) : (
          <InfoNote tone="success" icon="checkmark-circle-outline">
            Toda la documentación escaneada esperada fue recibida.
          </InfoNote>
        )}
      </Card>

      <Card title="Forma de pago" icon="card">
        <DataRow
          label="Modalidad"
          value={
            datos.formaPago
              ? FORMA_PAGO_META[datos.formaPago].etiqueta
              : reglas?.requiereSocioTitular
                ? "La cubre la cuenta del titular"
                : null
          }
        />
        {/* La factura la emite Contabilidad en el CRM; aquí solo consta el
            número que anotó al revisar, como en el reverso del formulario. */}
        <DataRow label="N.º de factura" value={tramite.revision?.numeroFactura} />
      </Card>

      <Card title="Datos personales" icon="person">
        <DataRow label="Apellidos" value={datos.apellidos} />
        <DataRow label="Nombres" value={datos.nombres} />
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
        <DataRow label="Ciudad" value={datos.ciudad} />
        <DataRow label="Dirección" value={datos.direccion} />
        <DataRow label="Celular" value={datos.celular} />
        <DataRow label="Teléfono domicilio" value={datos.telefonoDomicilio} />
        <DataRow label="Teléfono trabajo" value={datos.telefonoTrabajo} />
        <DataRow label="Correo" value={datos.correo} />
      </Card>

      {reglas?.requiereSocioTitular ? (
        <Card title="Vínculo con el socio titular" icon="people">
          <DataRow label="Socio titular" value={nombreTitular(datos)} />
          <DataRow label="Cédula del titular" value={datos.titularCedula} />
          <DataRow label="N.º de socio del titular" value={datos.titularNumeroSocio} />
          <DataRow label="Vínculo" value={datos.vinculoConTitular} />
          <DataRow label="Grado militar del titular" value={datos.titularGradoMilitar} />
        </Card>
      ) : null}

      {datos.garantes.length > 0 ? (
        <Card
          title={datos.garantes.length === 1 ? "Socio garante" : "Socios garantes"}
          icon="ribbon"
        >
          {datos.garantes.map((garante, indice) => (
            <View key={garante.id}>
              <DataRow
                label={`Garante ${indice + 1}`}
                value={`${garante.apellidosNombres} · Socio N.º ${garante.numeroSocio}`}
              />
              <DataRow label="Celular" value={garante.celular} />
              {garante.firmaUri ? (
                <View style={styles.firma}>
                  <Image
                    source={{ uri: garante.firmaUri }}
                    style={styles.firmaImagen}
                    contentFit="contain"
                  />
                  <Text style={styles.firmaPie}>{`Firma de ${garante.apellidosNombres}`}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      {datos.carta ? (
        <Card title="Carta de compromiso" icon="reader">
          <DataRow label="Nacionalidad" value={datos.carta.nacionalidad} />
          <DataRow label="Cuota anual" value={`USD ${datos.carta.cuotaAnual || "—"}`} />
          <DataRow label="Valor mensualizado" value={`USD ${datos.carta.cuotaMensualizada || "—"}`} />
          <DataRow
            label="Débito autorizado"
            value={
              datos.carta.numeroCuenta
                ? `${datos.carta.entidadFinanciera} · cuenta ${datos.carta.tipoCuenta === "CORRIENTE" ? "corriente" : "de ahorros"}`
                : datos.carta.tarjetaCredito
                  ? `Tarjeta de crédito, caduca ${datos.carta.caducidadTarjeta}`
                  : null
            }
          />
        </Card>
      ) : null}

      {reglas?.requiereDatosMilitares ? (
        <Card title="Información institucional" icon="shield">
          <DataRow label="Grado militar" value={datos.gradoMilitar} />
          <DataRow label="Promoción" value={datos.promocion} />
          <DataRow label="Situación" value={datos.situacion} />
          {reglas.requiereFuerza ? <DataRow label="Fuerza" value={datos.fuerza} /> : null}
        </Card>
      ) : null}

      <Card title="Ocupación" icon="briefcase">
        <DataRow label="Profesión" value={datos.profesion} />
        <DataRow label="Lugar de trabajo" value={datos.lugarTrabajo} />
        <DataRow label="Cargo" value={datos.cargo} />
        <DataRow label="Hobbie" value={datos.hobbie} />
        <DataRow
          label="Fecha de ingreso al Club"
          value={datos.fechaIngresoClub ? formatFechaCorta(datos.fechaIngresoClub) : null}
        />
      </Card>

      <Card title={`Expediente digital (${solicitud.documentos.length})`} icon="folder-open">
        {solicitud.documentos.length === 0 ? (
          <Text style={styles.vacio}>No se adjuntaron documentos.</Text>
        ) : (
          <View style={styles.galeria}>
            {solicitud.documentos.map((documento) => (
              <View key={documento.id} style={styles.documento}>
                {documento.mimeType.startsWith("image/") ? (
                  <Image
                    source={{ uri: documento.uri }}
                    style={styles.miniatura}
                    contentFit="cover"
                    transition={120}
                  />
                ) : (
                  <View style={[styles.miniatura, styles.miniaturaPdf]}>
                    <Ionicons name="document-text" size={24} color={colors.navy} />
                  </View>
                )}
                <Text style={styles.documentoNombre} numberOfLines={2}>
                  {nombreDocumento(documento.tipo)}
                </Text>
                <Text style={styles.documentoPeso}>{formatearTamano(documento.tamanoBytes)}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card title="Verificación de identidad y firma" icon="shield-checkmark">
        <DataRow
          label="Origen de los datos"
          value={ORIGEN_IDENTIDAD_META[solicitud.identidad?.origen ?? "MANUAL"].etiqueta}
        />
        <DataRow
          label="Consulta al Registro Civil"
          value={
            solicitud.identidad?.consultadoEn
              ? formatFechaHora(solicitud.identidad.consultadoEn)
              : "No se realizó"
          }
        />
        <DataRow
          label="Identidad confirmada"
          value={solicitud.identidad?.identidadConfirmada ? "Sí, contra la fotografía oficial" : "Cotejo con cédula física"}
        />
        <DataRow
          label="Modalidad de firma"
          value={MODO_FIRMA_META[solicitud.modoFirma ?? "MANUSCRITA_EN_PANTALLA"].etiqueta}
        />

        {solicitud.identidad?.fotoRegistroCivilUri ? (
          <View style={styles.fotoRegistro}>
            <Image
              source={{ uri: solicitud.identidad.fotoRegistroCivilUri }}
              style={styles.fotoRegistroImagen}
              contentFit="cover"
            />
            <Text style={styles.fotoRegistroPie}>Fotografía del Registro Civil</Text>
          </View>
        ) : null}
      </Card>

      <Card title="Consentimiento LOPDP" icon="shield-checkmark">
        {solicitud.consentimiento ? (
          <>
            <DataRow label="Versión del aviso" value={solicitud.consentimiento.versionAviso} />
            <DataRow
              label="Aceptado el"
              value={formatFechaHora(solicitud.consentimiento.aceptadoEn)}
            />
            <View style={styles.consentimientos}>
              {CONSENTIMIENTOS.map((consentimiento) => {
                const aceptado = solicitud.consentimiento?.valores?.[consentimiento.clave];
                return (
                  <View key={consentimiento.clave} style={styles.consentimiento}>
                    <Ionicons
                      name={aceptado ? "checkmark-circle" : "close-circle"}
                      size={16}
                      color={aceptado ? colors.success : colors.textFaint}
                    />
                    <Text style={styles.consentimientoTexto}>{consentimiento.titulo}</Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : (
          <InfoNote tone="danger" icon="warning-outline">
            No se registró evidencia de consentimiento para esta solicitud.
          </InfoNote>
        )}

        {solicitud.firmaUri ? (
          <View style={styles.firma}>
            <Image source={{ uri: solicitud.firmaUri }} style={styles.firmaImagen} contentFit="contain" />
            <Text style={styles.firmaPie}>Firma del solicitante</Text>
          </View>
        ) : null}
      </Card>

      <Card title="Historial del trámite" icon="time">
        {solicitud.historial.map((evento, indice) => {
          const metaEvento = ESTADO_META[evento.estado];
          const ultimo = indice === solicitud.historial.length - 1;
          return (
            <View key={`${evento.en}-${indice}`} style={styles.evento}>
              <View style={styles.eventoLinea}>
                <View style={[styles.eventoPunto, ultimo && styles.eventoPuntoActual]} />
                {!ultimo ? <View style={styles.eventoConector} /> : null}
              </View>
              <View style={styles.eventoTexto}>
                <Text style={styles.eventoTitulo}>{metaEvento.etiqueta}</Text>
                {evento.nota ? <Text style={styles.eventoNota}>{evento.nota}</Text> : null}
                <Text style={styles.eventoFecha}>{formatFechaHora(evento.en)}</Text>
              </View>
            </View>
          );
        })}
      </Card>

      <View style={styles.accionesSecundarias}>
        <Button
          label="Eliminar solicitud del dispositivo"
          icon="trash-outline"
          variant="danger"
          onPress={borrar}
          fullWidth
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  constancias: { gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.md },
  constancia: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  constanciaCabecera: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  constanciaAccion: { ...typography.label, color: colors.navy },
  constanciaArea: { fontSize: 11.5, color: colors.textFaint, marginLeft: "auto" },
  constanciaResponsable: { fontSize: 13.5, fontWeight: "600", color: colors.text, marginTop: 4 },
  constanciaFecha: { fontSize: 12, color: colors.textMuted },
  constanciaObservacion: { fontSize: 12.5, color: colors.text, marginTop: 4, lineHeight: 17 },
  constanciaPendiente: { fontSize: 13, color: colors.textFaint, marginTop: 4, fontStyle: "italic" },
  pantalla: { flex: 1, backgroundColor: colors.bg },
  contenido: { padding: spacing.lg, paddingBottom: spacing.xxl },
  centro: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    backgroundColor: colors.bg,
    padding: spacing.xl,
  },
  noEncontrada: { ...typography.cardTitle, color: colors.textMuted },

  cabecera: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  cabeceraFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  codigo: { ...typography.overline, color: colors.gold },
  nombre: { color: colors.textOnDark, fontSize: 19, fontWeight: "800", marginTop: spacing.sm },
  subtitulo: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 3 },
  estadoDescripcion: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12.5,
    marginTop: spacing.md,
    lineHeight: 18,
  },

  acciones: { gap: spacing.sm, marginTop: spacing.lg },
  accionesSecundarias: { gap: spacing.sm, marginTop: spacing.xl },
  botonEnviar: { marginTop: spacing.md },

  vacio: { ...typography.caption },
  galeria: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  documento: { width: "30%" },
  miniatura: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.skySoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  miniaturaPdf: { alignItems: "center", justifyContent: "center" },
  documentoNombre: { fontSize: 11.5, color: colors.text, fontWeight: "600", marginTop: 5, lineHeight: 15 },
  documentoPeso: { fontSize: 10.5, color: colors.textFaint, marginTop: 1 },

  fotoRegistro: { marginTop: spacing.md, alignItems: "center", gap: 4 },
  fotoRegistroImagen: {
    width: 82,
    height: 102,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceAlt,
  },
  fotoRegistroPie: { fontSize: 11, color: colors.textMuted },

  consentimientos: { marginTop: spacing.md, gap: 5 },
  consentimiento: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  consentimientoTexto: { flex: 1, fontSize: 12.5, color: colors.text, lineHeight: 18 },

  firma: {
    marginTop: spacing.md,
    height: 110,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
  },
  firmaImagen: { flex: 1 },
  firmaPie: {
    textAlign: "center",
    fontSize: 11,
    color: colors.textMuted,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
    paddingTop: 3,
  },

  evento: { flexDirection: "row", gap: spacing.md },
  eventoLinea: { alignItems: "center", width: 14 },
  eventoPunto: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginTop: 5,
  },
  eventoPuntoActual: { backgroundColor: colors.gold },
  eventoConector: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 3 },
  eventoTexto: { flex: 1, paddingBottom: spacing.md },
  eventoTitulo: { fontSize: 13.5, fontWeight: "800", color: colors.text },
  eventoNota: { fontSize: 12.5, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  eventoFecha: { fontSize: 11.5, color: colors.textFaint, marginTop: 3 },
});
