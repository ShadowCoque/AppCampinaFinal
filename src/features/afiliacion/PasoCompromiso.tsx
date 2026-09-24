import React from "react";

import type { Errores } from "../../domain/formularioAfiliacion";
import {
  modalidadDebitoDe,
  type DatosAfiliacion,
  type DatosCartaCompromiso,
  type ModalidadDebito,
} from "../../domain/solicitud";
import { normalizarTextoInstitucional } from "../../domain/texto";
import { Card, DataRow, DateField, InfoNote, OptionGroup, TextField } from "../../ui";
import { soloDigitos } from "../../domain/validaciones";

/**
 * Carta de compromiso que acompaña a la solicitud de ingreso.
 *
 * Recoge lo que la carta contiene y el formulario no: la autorización de débito
 * automático, el valor de la cuota de mantenimiento anual y la sesión del
 * Directorio que autorizó el ingreso.
 *
 * Las cuotas no se preguntan: salen del tarifario del Club (decisión del
 * Coordinador, 23/09/2026). Y el débito es de una cuenta **o** de una tarjeta:
 * se elige primero la modalidad y se piden solo sus datos, que son los únicos
 * que la carta imprime.
 */

type Props = {
  datos: DatosAfiliacion;
  errores: Errores;
  setDato: <K extends keyof DatosAfiliacion>(campo: K, valor: DatosAfiliacion[K]) => void;
};

export function PasoCompromiso({ datos, errores, setDato }: Props) {
  const carta = datos.carta;
  if (!carta) return null;

  const setCarta = <K extends keyof DatosCartaCompromiso>(
    campo: K,
    valor: DatosCartaCompromiso[K]
  ) => setDato("carta", { ...carta, [campo]: valor });

  const modalidad = modalidadDebitoDe(carta);

  // Al cambiar de modalidad se vacían los datos de la otra: la carta imprime
  // una sola, y los números de una cuenta o de una tarjeta que el socio no
  // autorizó no deben quedar guardados.
  const elegirModalidad = (nueva: ModalidadDebito) =>
    setDato("carta", {
      ...carta,
      modalidadDebito: nueva,
      ...(nueva === "CUENTA"
        ? { tarjetaCredito: "", caducidadTarjeta: "" }
        : { entidadFinanciera: "", tipoCuenta: null, numeroCuenta: "" }),
    });

  return (
    <>
      {/* Las dos cartas están transcritas literalmente de los originales del
          Club: la del socio dependiente (una sola para D-A, D-B y D-C) y la
          del socio particular (src/services/formularios/cartas.ts). */}
      <InfoNote tone="info" icon="document-text-outline">
        {carta.modelo === "DEPENDIENTE"
          ? "Estos datos se imprimen en la carta de compromiso del socio dependiente, que se genera firmada junto con el formulario de ingreso y con su socio garante en calidad de codeudor solidario."
          : "Estos datos se imprimen en la carta de compromiso del socio particular, que se genera firmada junto con el formulario de ingreso y con sus socios garantes en calidad de codeudores solidarios."}
      </InfoNote>

      <Card title="Datos del compromiso" icon="reader">
        <TextField
          label="Nacionalidad"
          required
          autoCapitalize="characters"
          icon="flag-outline"
          value={carta.nacionalidad}
          onChangeText={(v) => setCarta("nacionalidad", normalizarTextoInstitucional(v))}
          error={errores.nacionalidad}
          placeholder="ECUATORIANA"
        />

        {carta.modelo === "PARTICULAR" ? (
          <DateField
            label="Fecha de la sesión del Directorio"
            helper="Sesión en la que se autorizó el ingreso."
            value={carta.fechaSesionDirectorio}
            onChange={(iso) => setCarta("fechaSesionDirectorio", iso)}
            maximumDate={new Date()}
          />
        ) : null}
      </Card>

      <Card
        title="Cuota de mantenimiento"
        subtitle="Valor que el socio reconoce en la carta, según el tarifario del Club."
        icon="cash"
      >
        <DataRow
          label="Cuota anual"
          value={carta.cuotaAnual ? `USD ${carta.cuotaAnual}` : null}
        />
        <DataRow
          label="Valor mensualizado"
          value={
            carta.cuotaMensualizada
              ? `USD ${carta.cuotaMensualizada}`
              : "Este tipo de socio no tiene pago mensualizado"
          }
        />
        {errores.cuotaAnual ? (
          <InfoNote tone="danger" icon="alert-circle">
            {errores.cuotaAnual}
          </InfoNote>
        ) : (
          <InfoNote tone="info" icon="calculator-outline">
            No se le preguntan al socio: salen del tarifario del Club para este tipo de socio y se
            imprimen así en la carta. Si cambia la categoría o el estado civil, se actualizan solas.
            La modalidad con la que finalmente paga (anual o mensual) la elige la Jefatura de Socios
            al registrarlo en SAFI.
          </InfoNote>
        )}
      </Card>

      <Card
        title="Autorización de débito automático"
        subtitle="De una cuenta bancaria o de una tarjeta de crédito: una de las dos."
        icon="card"
      >
        <OptionGroup<ModalidadDebito>
          label="El débito automático será de"
          options={[
            { value: "CUENTA", label: "Cuenta bancaria" },
            { value: "TARJETA", label: "Tarjeta de crédito" },
          ]}
          value={modalidad}
          onChange={elegirModalidad}
          error={errores.modalidadDebito}
        />

        {modalidad === "CUENTA" ? (
          <>
            <TextField
              label="Banco o cooperativa"
              required
              autoCapitalize="characters"
              icon="business-outline"
              value={carta.entidadFinanciera}
              onChangeText={(v) => setCarta("entidadFinanciera", normalizarTextoInstitucional(v))}
              error={errores.entidadFinanciera}
              placeholder="BANCO PICHINCHA"
            />
            <OptionGroup<"AHORROS" | "CORRIENTE">
              label="Tipo de cuenta"
              options={[
                { value: "AHORROS", label: "Ahorros" },
                { value: "CORRIENTE", label: "Corriente" },
              ]}
              value={carta.tipoCuenta}
              onChange={(v) => setCarta("tipoCuenta", v)}
              error={errores.tipoCuenta}
            />
            <TextField
              label="Número de cuenta"
              required
              keyboardType="number-pad"
              maxLength={20}
              icon="keypad-outline"
              value={carta.numeroCuenta}
              onChangeText={(v) => setCarta("numeroCuenta", soloDigitos(v, 20))}
              error={errores.numeroCuenta}
            />
          </>
        ) : null}

        {modalidad === "TARJETA" ? (
          <>
            <TextField
              label="Tarjeta de crédito"
              required
              keyboardType="number-pad"
              maxLength={16}
              icon="card-outline"
              value={carta.tarjetaCredito}
              onChangeText={(v) => setCarta("tarjetaCredito", soloDigitos(v, 16))}
              error={errores.tarjetaCredito}
            />
            <TextField
              label="Caducidad de la tarjeta"
              required
              helper="Mes y año, en formato MM/AA."
              keyboardType="number-pad"
              maxLength={5}
              icon="time-outline"
              value={carta.caducidadTarjeta}
              onChangeText={(v) => setCarta("caducidadTarjeta", formatearCaducidad(v))}
              error={errores.caducidadTarjeta}
              placeholder="12/29"
            />
          </>
        ) : null}

        {!modalidad ? (
          <InfoNote tone="info" icon="information-circle-outline">
            Elija primero la modalidad: se piden solo sus datos, y la carta imprime únicamente esa.
          </InfoNote>
        ) : null}
      </Card>
    </>
  );
}

/** `1229` → `12/29`, para que el operador no tenga que escribir la barra. */
function formatearCaducidad(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 4);
  if (digitos.length <= 2) return digitos;
  return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
}
