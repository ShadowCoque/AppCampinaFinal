import React from "react";

import type { Errores } from "../../domain/formularioAfiliacion";
import type { DatosAfiliacion, DatosCartaCompromiso } from "../../domain/solicitud";
import { normalizarTextoInstitucional } from "../../domain/texto";
import { Card, DateField, InfoNote, OptionGroup, TextField } from "../../ui";
import { soloDigitos } from "../../domain/validaciones";

/**
 * Carta de compromiso que acompaña a la solicitud de ingreso.
 *
 * Recoge lo que la carta contiene y el formulario no: la autorización de débito
 * automático, el valor de la cuota de mantenimiento anual y la sesión del
 * Directorio que autorizó el ingreso.
 */

type Props = {
  datos: DatosAfiliacion;
  errores: Errores;
  setDato: <K extends keyof DatosAfiliacion>(campo: K, valor: DatosAfiliacion[K]) => void;
};

/** Solo dígitos, coma o punto: es un valor monetario. */
function soloMonto(valor: string): string {
  return valor.replace(/[^\d.,]/g, "").slice(0, 12);
}

export function PasoCompromiso({ datos, errores, setDato }: Props) {
  const carta = datos.carta;
  if (!carta) return null;

  const setCarta = <K extends keyof DatosCartaCompromiso>(
    campo: K,
    valor: DatosCartaCompromiso[K]
  ) => setDato("carta", { ...carta, [campo]: valor });

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
        subtitle="Valor que el socio reconoce en la carta."
        icon="cash"
      >
        <TextField
          label="Cuota anual (USD)"
          required
          keyboardType="decimal-pad"
          icon="pricetag-outline"
          value={carta.cuotaAnual}
          onChangeText={(v) => setCarta("cuotaAnual", soloMonto(v))}
          error={errores.cuotaAnual}
          placeholder="1200.00"
        />
        <TextField
          label="Valor mensualizado (USD)"
          helper="Solo si el socio se acoge al pago mensualizado."
          keyboardType="decimal-pad"
          icon="calendar-outline"
          value={carta.cuotaMensualizada}
          onChangeText={(v) => setCarta("cuotaMensualizada", soloMonto(v))}
        />
      </Card>

      <Card
        title="Autorización de débito automático"
        subtitle="Registre una cuenta bancaria o una tarjeta de crédito."
        icon="card"
      >
        <TextField
          label="Banco o cooperativa"
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
          keyboardType="number-pad"
          maxLength={20}
          icon="keypad-outline"
          value={carta.numeroCuenta}
          onChangeText={(v) => setCarta("numeroCuenta", soloDigitos(v, 20))}
        />

        <TextField
          label="Tarjeta de crédito"
          helper="Alternativa a la cuenta bancaria."
          keyboardType="number-pad"
          maxLength={16}
          icon="card-outline"
          value={carta.tarjetaCredito}
          onChangeText={(v) => setCarta("tarjetaCredito", soloDigitos(v, 16))}
        />
        <TextField
          label="Caducidad de la tarjeta"
          helper="Mes y año, en formato MM/AA."
          keyboardType="number-pad"
          maxLength={5}
          icon="time-outline"
          value={carta.caducidadTarjeta}
          onChangeText={(v) => setCarta("caducidadTarjeta", formatearCaducidad(v))}
          error={errores.caducidadTarjeta}
          placeholder="12/29"
        />
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
