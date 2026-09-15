import React, { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { guardarEnExpediente, persistirFirma } from "../../data/archivos";
import { reemplazarAdjunto, rutaDelAdjunto } from "../../data/solicitudes";
import { requisitoDe } from "../../domain/documentos";
import { formatFechaHora } from "../../domain/fechas";
import { ROL_ADJUNTO_META, nombreCompleto, type RolAdjunto } from "../../domain/solicitud";
import { capturarConCamara, elegirDeGaleria, type ArchivoCapturado } from "../../services/captura";
import {
  enumerarAdjuntos,
  reanudarEnvio,
  situacionDeEntrega,
  sincronizar,
  type ResumenSincronizacion,
  type SituacionEntrega,
} from "../../services/servidor";
import { spacing, typography } from "../../theme";
import { Button, Card, InfoNote, LienzoFirma } from "../../ui";

type Props = {
  situacion: SituacionEntrega;
  /** Vuelve a leer el trámite después de enviar, reenviar o reponer un archivo. */
  onCambio: () => Promise<void>;
  /** Bloquea el scroll de la pantalla mientras se traza una firma. */
  onDibujando: (dibujando: boolean) => void;
};

/**
 * Envío al servidor de un trámite, visto desde la tableta.
 *
 * Dice qué tiene el servidor, qué le falta y, sobre todo, lo que la tableta ya
 * no puede entregar sola: una firma o una fotografía que desaparecieron del
 * dispositivo, o un trámite que el servidor dejó de conocer. Antes eso no se
 * decía en ninguna parte y el operador creía que todo había llegado.
 *
 * Desde aquí se repone lo perdido —con la persona presente, en el mismo lienzo
 * del asistente— y se decide qué hacer con un trámite que el servidor ya no
 * tiene.
 */
export function TarjetaEnvio({ situacion, onCambio, onDibujando }: Props) {
  const { solicitud, enviada, faltantes, perdidas, detenido } = situacion;
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [reponiendo, setReponiendo] = useState<RolAdjunto | null>(null);
  const [firmaNueva, setFirmaNueva] = useState<string | null>(null);

  const disponibles = faltantes.filter((rol) => !perdidas.includes(rol));
  const noExiste = detenido?.motivo === "NO_EXISTE_EN_SERVIDOR";
  const rechazado = detenido?.motivo === "RECHAZADO" ? detenido : null;
  // Lo que se puede volver a capturar: lo perdido y, si el servidor rechazó
  // un archivo concreto, ese archivo. A un trámite que el servidor ya no tiene
  // no se le repone nada hasta decidir si se reenvía.
  const porReponer = noExiste
    ? []
    : Array.from(new Set([...perdidas, ...(rechazado?.rol ? [rechazado.rol] : [])]));

  /** Avisa solo de lo que impide enviar cualquier cosa: la tarjeta ya muestra lo del trámite. */
  const avisarConexion = (resumen: ResumenSincronizacion) => {
    const deConexion = ["SIN_SERVIDOR", "SIN_SESION", "SIN_CONEXION", "ERROR"].includes(resumen.estado);
    if (deConexion && resumen.detalle) Alert.alert("Envío al servidor", resumen.detalle);
  };

  const enviarAhora = async () => {
    setOcupado("enviar");
    try {
      const resumen = await sincronizar();
      await onCambio();
      avisarConexion(resumen);
    } finally {
      setOcupado(null);
    }
  };

  const reanudar = async () => {
    setOcupado("reanudar");
    try {
      const resumen = await reanudarEnvio(solicitud.id);
      await onCambio();
      avisarConexion(resumen);
    } finally {
      setOcupado(null);
    }
  };

  const confirmarReenvio = () => {
    Alert.alert(
      "Volver a enviar al servidor",
      "El servidor lo registrará como un trámite nuevo, con otro código, y tendrá que pasar otra vez por la creación en SAFI, la revisión de Contabilidad y la aprobación de la Gerencia.\n\nSi era una afiliación de prueba, no la reenvíe: elimínela de la tableta.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Volver a enviar", onPress: () => void reanudar() },
      ]
    );
  };

  /** Guarda en la copia de la tableta el archivo repuesto y lo envía de inmediato. */
  const guardarYEnviar = async (
    rol: RolAdjunto,
    archivo: { uri: string; nombreArchivo?: string; mimeType?: string; tamanoBytes?: number }
  ) => {
    if (!(await reemplazarAdjunto(solicitud.id, rol, archivo))) {
      Alert.alert("No se pudo guardar", "La tableta no pudo guardar el archivo. Intente nuevamente.");
      return;
    }

    // Si el servidor había rechazado el envío, reponer el archivo es la
    // corrección: se levanta la detención para que salga ya.
    const resumen = rechazado ? await reanudarEnvio(solicitud.id) : await sincronizar();
    await onCambio();

    const despues = await situacionDeEntrega(solicitud.id);
    const pieza = enumerarAdjuntos([rol]);
    if (despues?.enviada && !despues.detenido && !despues.faltantes.includes(rol)) {
      Alert.alert("Enviado", `El servidor ya tiene ${pieza}.`);
    } else {
      Alert.alert(
        "Guardado en la tableta",
        `${capitalizar(pieza)} quedó guardada y se enviará sola en cuanto haya conexión y sesión.${
          resumen.detalle && resumen.estado !== "ATENCION" ? `\n\n${resumen.detalle}` : ""
        }`
      );
    }
  };

  const guardarFirma = async () => {
    if (!reponiendo || !firmaNueva) return;
    setOcupado("guardar");
    try {
      const prefijo =
        reponiendo === "FIRMA_SOLICITANTE"
          ? "firma"
          : `firma-garante-${reponiendo === "FIRMA_GARANTE_1" ? 1 : 2}`;
      const uri = persistirFirma(solicitud.id, firmaNueva, {
        prefijo,
        anterior: rutaDelAdjunto(solicitud, reponiendo),
      });
      if (!uri) return;
      await guardarYEnviar(reponiendo, { uri });
      setReponiendo(null);
      setFirmaNueva(null);
    } finally {
      setOcupado(null);
    }
  };

  const tomarFotografia = async (obtener: () => Promise<ArchivoCapturado | null>) => {
    setOcupado("foto");
    try {
      const archivo = await obtener();
      if (!archivo) return;
      const guardado = guardarEnExpediente(solicitud.id, archivo.uri, {
        prefijo: "foto_carnet",
        mimeType: archivo.mimeType,
      });
      await guardarYEnviar("FOTO_CARNET", {
        uri: guardado.uri,
        nombreArchivo: archivo.nombre,
        mimeType: archivo.mimeType,
        tamanoBytes: guardado.tamanoBytes || archivo.tamanoBytes,
      });
      setReponiendo(null);
    } catch (error) {
      console.warn("[envio] No se pudo reponer la fotografía:", error);
      Alert.alert("No se pudo adjuntar", "Intente nuevamente con otro método de captura.");
    } finally {
      setOcupado(null);
    }
  };

  const cancelarReposicion = () => {
    setReponiendo(null);
    setFirmaNueva(null);
    onDibujando(false);
  };

  /** Quién tiene que estar presente para reponer cada pieza. */
  const titularDe = (rol: RolAdjunto): string => {
    if (rol === "FOTO_CARNET") return "Fotografía tipo carnet";
    if (rol === "FIRMA_SOLICITANTE") return `Firma de ${nombreCompleto(solicitud.datos) || "el solicitante"}`;
    const garante = solicitud.datos.garantes[rol === "FIRMA_GARANTE_1" ? 0 : 1];
    return `Firma de ${garante?.apellidosNombres || "el socio garante"}, socio garante`;
  };

  const etiquetaReponer = (rol: RolAdjunto): string => {
    if (rol === "FOTO_CARNET") return "Volver a tomar la fotografía";
    if (rol === "FIRMA_SOLICITANTE") return "Volver a capturar la firma del solicitante";
    const garante = solicitud.datos.garantes[rol === "FIRMA_GARANTE_1" ? 0 : 1];
    return `Volver a capturar la firma de ${garante?.apellidosNombres || "el socio garante"}`;
  };

  const omitidos = solicitud.expediente.adjuntosOmitidos ?? [];
  const una = perdidas.length === 1;

  return (
    <Card title="Envío al servidor del Club" icon="cloud-upload">
      {noExiste ? (
        <InfoNote tone="danger" icon="cloud-offline">
          {`El servidor respondió el ${formatFechaHora(detenido.en)} que no tiene este trámite. Suele pasar cuando se vacía o se restaura su base de datos. La tableta dejó de enviarlo para no registrarlo otra vez sin que nadie lo decida.\n\nSi era una afiliación de prueba, elimínela de la tableta. Si debe seguir su curso, vuelva a enviarla.`}
        </InfoNote>
      ) : rechazado ? (
        <InfoNote tone="danger" icon="close-circle">
          {`El servidor rechazó el envío el ${formatFechaHora(rechazado.en)}: «${rechazado.mensaje}». Un reintento automático no lo resolvería, así que la tableta dejó de insistir. ${
            rechazado.rol
              ? `Vuelva a capturar ${enumerarAdjuntos([rechazado.rol])} y se enviará de nuevo.`
              : "Si el problema ya se corrigió, vuelva a intentarlo; si persiste, avise a la Coordinación de TICs."
          }`}
        </InfoNote>
      ) : !enviada ? (
        <InfoNote tone="danger" icon="cloud-offline">
          Esta afiliación todavía no llegó al servidor, así que no aparece en ninguna bandeja. Se
          envía sola en cuanto hay conexión y sesión; también puede enviarla ahora.
        </InfoNote>
      ) : disponibles.length > 0 ? (
        <InfoNote tone="warning" icon="alert-circle-outline">
          {`El servidor tiene el trámite pero le falta ${enumerarAdjuntos(disponibles)}. La tableta ${
            disponibles.length === 1 ? "la envía sola" : "las envía solas"
          } en la próxima sincronización; también puede enviarla ahora.`}
        </InfoNote>
      ) : faltantes.length === 0 ? (
        <InfoNote tone="success" icon="cloud-done">
          El servidor tiene el trámite completo: datos, firmas y fotografía.
        </InfoNote>
      ) : null}

      {perdidas.length > 0 && !noExiste ? (
        <InfoNote tone="danger" icon="alert-circle">
          {`${capitalizar(enumerarAdjuntos(perdidas))} ya no ${una ? "está" : "están"} en esta tableta, así que no ${
            una ? "llegará sola" : "llegarán solas"
          } al servidor. Si la persona está presente, vuelva a ${
            una ? "capturarla" : "capturarlas"
          } aquí. Si ya no lo está, la Jefatura de Socios puede subir el archivo desde la bandeja de tareas o declarar que consta en el formulario en papel.`}
        </InfoNote>
      ) : null}

      {omitidos.map((omision) => (
        <InfoNote key={omision.rol} tone="neutral" icon="document-text-outline">
          {`${ROL_ADJUNTO_META[omision.rol].etiqueta}: no se enviará. ${omision.responsable} lo dejó resuelto el ${formatFechaHora(omision.en)}: «${omision.motivo}».`}
        </InfoNote>
      ))}

      {reponiendo && ROL_ADJUNTO_META[reponiendo].esFirma ? (
        <View style={styles.reposicion}>
          <Text style={styles.reposicionTitulo}>{titularDe(reponiendo)}</Text>
          <Text style={styles.reposicionNota}>
            Debe firmar la misma persona, delante de usted. La firma anterior ya no está en la tableta
            y el servidor no la recibió.
          </Text>
          <LienzoFirma valor={firmaNueva} onChange={setFirmaNueva} onDibujando={onDibujando} />
          <Button
            label="Guardar y enviar"
            icon="send"
            onPress={guardarFirma}
            loading={ocupado === "guardar"}
            disabled={!firmaNueva}
            fullWidth
            style={styles.boton}
          />
          <Button
            label="Cancelar"
            variant="ghost"
            onPress={cancelarReposicion}
            disabled={ocupado === "guardar"}
            fullWidth
          />
        </View>
      ) : reponiendo === "FOTO_CARNET" ? (
        <View style={styles.reposicion}>
          <Text style={styles.reposicionTitulo}>{titularDe(reponiendo)}</Text>
          <Text style={styles.reposicionNota}>
            {`${requisitoDe("FOTO_CARNET").descripcion} Se guarda y se envía en cuanto la acepte.`}
          </Text>
          <View style={styles.fila}>
            <Button
              label="Cámara"
              icon="camera"
              onPress={() => tomarFotografia(() => capturarConCamara({ recorteCuadrado: true }))}
              loading={ocupado === "foto"}
              style={styles.mitad}
            />
            <Button
              label="Galería"
              icon="images"
              variant="secondary"
              onPress={() => tomarFotografia(() => elegirDeGaleria({ recorteCuadrado: true }))}
              disabled={ocupado === "foto"}
              style={styles.mitad}
            />
          </View>
          <Button
            label="Cancelar"
            variant="ghost"
            onPress={cancelarReposicion}
            disabled={ocupado === "foto"}
            fullWidth
          />
        </View>
      ) : (
        <View style={styles.acciones}>
          {porReponer.map((rol) => (
            <Button
              key={rol}
              label={etiquetaReponer(rol)}
              icon={rol === "FOTO_CARNET" ? "camera-outline" : "create-outline"}
              variant="secondary"
              onPress={() => setReponiendo(rol)}
              disabled={ocupado !== null}
              fullWidth
            />
          ))}

          {noExiste ? (
            solicitud.estado !== "RECHAZADA" ? (
              <Button
                label="Volver a enviar al servidor"
                icon="refresh"
                onPress={confirmarReenvio}
                loading={ocupado === "reanudar"}
                fullWidth
              />
            ) : null
          ) : rechazado ? (
            <Button
              label="Volver a intentarlo"
              icon="refresh"
              variant="secondary"
              onPress={reanudar}
              loading={ocupado === "reanudar"}
              fullWidth
            />
          ) : !enviada || disponibles.length > 0 ? (
            <Button
              label="Enviar ahora"
              icon="sync"
              onPress={enviarAhora}
              loading={ocupado === "enviar"}
              fullWidth
            />
          ) : (
            <Button
              label="Actualizar el avance"
              icon="refresh"
              variant="secondary"
              onPress={enviarAhora}
              loading={ocupado === "enviar"}
              fullWidth
            />
          )}
        </View>
      )}
    </Card>
  );
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const styles = StyleSheet.create({
  acciones: { gap: spacing.sm, marginTop: spacing.md },
  reposicion: { marginTop: spacing.lg, gap: spacing.sm },
  reposicionTitulo: { ...typography.cardTitle, fontSize: 15 },
  reposicionNota: { ...typography.caption, lineHeight: 18, marginBottom: spacing.xs },
  boton: { marginTop: spacing.sm },
  fila: { flexDirection: "row", gap: spacing.sm },
  mitad: { flex: 1 },
});
