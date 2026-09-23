import React, { useCallback, useRef, useState } from "react";

import {
  REGLA_META,
  estadoNoActivo,
  estadoReferencia,
  motivoRechazo,
  nombreConGrado,
  verificacionDe,
  type ReglaSocio,
  type SocioSafi,
  type VerificacionSocio,
} from "../../domain/sociosSafi";
import { normalizarNumeroSocio } from "../../domain/texto";
import { consultarSocio } from "../../services/servidor";
import { Button, InfoNote } from "../../ui";

/**
 * Búsqueda en SAFI de un socio al que el trámite hace referencia —un garante,
 * el titular de un dependiente, el socio del que depende un D-A, D-B o D-C—,
 * por su número o por su cédula (pedido del Coordinador, 23/09/2026).
 *
 * El paso que la usa decide qué hacer con lo encontrado: llenar los campos y
 * guardar la verificación. Si SAFI no se puede consultar, se dice y se deja
 * seguir: la bandeja lo vuelve a comprobar antes de crear la ficha.
 */

type Resultado = { verificacion: VerificacionSocio; socio: SocioSafi | null };

export function useBuscarSocio(regla: ReglaSocio | null) {
  const [consultando, setConsultando] = useState(false);
  /** Motivo por el que no se pudo consultar, o un aviso que no se guarda. */
  const [sinConsulta, setSinConsulta] = useState<string | null>(null);
  const [sinCoincidencia, setSinCoincidencia] = useState<string | null>(null);
  const enCurso = useRef(false);

  const buscar = useCallback(
    async (criterio: { numeroSocio: string; cedula: string }): Promise<Resultado | null> => {
      const numero = normalizarNumeroSocio(criterio.numeroSocio);
      const cedula = criterio.cedula.replace(/\D/g, "");
      if (!regla || enCurso.current || (!numero && cedula.length !== 10)) return null;

      enCurso.current = true;
      setConsultando(true);
      setSinConsulta(null);
      setSinCoincidencia(null);
      try {
        const consulta = await consultarSocio(numero ? { numeroSocio: numero } : { cedula });
        if (!consulta.consultado) {
          setSinConsulta(consulta.motivo);
          return null;
        }
        // Por cédula, un «no está» no se guarda: sin número no hay nada que
        // verificar, y el operador puede escribirlo.
        if (!numero && !consulta.socio) {
          setSinCoincidencia(
            `SAFI no tiene ningún socio con la cédula ${cedula}. Escriba su número de socio.`
          );
          return null;
        }
        // Por cédula puede aparecer la ficha de un dependiente —una cónyuge, un
        // juvenil—, que lleva el número de su titular: tomarla llenaría el
        // número de otra persona.
        const socio = consulta.socio;
        if (!numero && socio && !["00", "0", ""].includes(socio.secuencia.trim())) {
          setSinCoincidencia(
            `La cédula ${cedula} es de ${[socio.nombres, socio.apellidos].join(" ").trim()}, ${
              socio.tipoSocioSafi || "dependiente"
            } en la cuenta del socio N.º ${socio.numeroSocio} (secuencia ${socio.secuencia}): no es titular de un número de socio.`
          );
          return null;
        }
        return { verificacion: verificacionDe(regla, numero, socio), socio };
      } finally {
        enCurso.current = false;
        setConsultando(false);
      }
    },
    [regla]
  );

  const olvidar = useCallback(() => {
    setSinConsulta(null);
    setSinCoincidencia(null);
  }, []);

  return { buscar, consultando, sinConsulta, sinCoincidencia, olvidar };
}

type AvisosProps = {
  verificacion: VerificacionSocio | null | undefined;
  numero: string;
  regla: ReglaSocio;
  /** «el garante», «el socio titular»…: para los avisos. */
  papel: string;
  /** Lo que se hace con el socio verificado, al final del aviso verde. */
  detalle?: string;
  /** Cédula escrita en el formulario, para contrastarla con la de SAFI. */
  cedulaDeclarada?: string;
  sinConsulta: string | null;
  sinCoincidencia: string | null;
  consultando: boolean;
  onBuscar: () => void;
  /** Si hay algo que buscar: un número, o una cédula completa. */
  puedeBuscar: boolean;
};

/** Lo que dijo SAFI, en verde, rojo o ámbar, y el botón para consultar. */
export function AvisosSocioSafi({
  verificacion,
  numero,
  regla,
  papel,
  detalle,
  cedulaDeclarada,
  sinConsulta,
  sinCoincidencia,
  consultando,
  onBuscar,
  puedeBuscar,
}: AvisosProps) {
  const estado = estadoReferencia(verificacion, numero, regla);
  const rechazo = motivoRechazo(verificacion, numero, regla, papel);
  const inactivo = estado === "VERIFICADO" ? estadoNoActivo(verificacion) : null;
  const cedulaSafi = verificacion?.cedula ?? "";
  const declarada = (cedulaDeclarada ?? "").replace(/\D/g, "");
  const otraCedula =
    estado === "VERIFICADO" && cedulaSafi && declarada.length === 10 && cedulaSafi !== declarada;

  return (
    <>
      {estado === "VERIFICADO" && verificacion ? (
        <InfoNote tone="success" icon="shield-checkmark">
          {`${nombreConGrado(verificacion)} · Socio ${verificacion.tipoSocioSafi} en SAFI.${
            detalle ? ` ${detalle}` : ""
          }`}
        </InfoNote>
      ) : null}
      {rechazo ? (
        <InfoNote tone="danger" icon="close-circle">
          {rechazo}
        </InfoNote>
      ) : null}
      {inactivo ? (
        <InfoNote tone="info" icon="information-circle-outline">
          {`En SAFI su estado es «${inactivo}». Es un dato para tener en cuenta y no impide continuar.`}
        </InfoNote>
      ) : null}
      {otraCedula ? (
        <InfoNote tone="warning" icon="alert-circle">
          {`La cédula escrita no es la que SAFI tiene para el N.º ${verificacion?.numeroSocio} (${cedulaSafi}). Compruebe que sea la misma persona.`}
        </InfoNote>
      ) : null}
      {sinCoincidencia ? (
        <InfoNote tone="warning" icon="search">
          {sinCoincidencia}
        </InfoNote>
      ) : null}
      {sinConsulta ? (
        <InfoNote tone="warning" icon="cloud-offline">
          {`No se pudo consultar SAFI (${sinConsulta.replace(/\.$/, "")}). Puede continuar escribiendo los datos: la bandeja comprobará que sea ${REGLA_META[regla].exige} antes de crear la ficha.`}
        </InfoNote>
      ) : null}
      {puedeBuscar && estado === "SIN_VERIFICAR" ? (
        <Button
          label={consultando ? "Consultando SAFI…" : "Buscar en SAFI"}
          icon="search-outline"
          variant="secondary"
          onPress={onBuscar}
          loading={consultando}
          fullWidth
        />
      ) : null}
    </>
  );
}
