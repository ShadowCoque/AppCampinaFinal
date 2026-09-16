import React from "react";

import type { Errores } from "../../domain/formularioAfiliacion";
import type { DatosAfiliacion } from "../../domain/solicitud";
import { PAIS_POR_DEFECTO, PROVINCIAS } from "../../domain/tiposMiembro";
import { formatearNombre, normalizarCorreo, soloDigitos } from "../../domain/validaciones";
import { Card, InfoNote, SelectField, TextField } from "../../ui";

type Props = {
  datos: DatosAfiliacion;
  errores: Errores;
  setDato: <K extends keyof DatosAfiliacion>(campo: K, valor: DatosAfiliacion[K]) => void;
};

/** La lista cerrada `PROVINCIAS` es la del Ecuador: fuera de él no significa nada. */
function esEcuador(pais: string): boolean {
  return pais.trim().toLocaleUpperCase("es-EC") === PAIS_POR_DEFECTO.toLocaleUpperCase("es-EC");
}

export function PasoContacto({ datos, errores, setDato }: Props) {
  const enEcuador = esEcuador(datos.pais);

  return (
    <>
      <Card title="Domicilio" icon="home">
        {/* El país va primero porque decide cómo se piden la provincia y la
            ciudad. Viaja al «País (Factura)» de la ficha del Socio y de la
            Cuenta en SAFI, que hasta el 15/09/2026 quedaban vacíos. */}
        <TextField
          label="País"
          required
          autoCapitalize="sentences"
          icon="earth-outline"
          value={datos.pais}
          onChangeText={(v) => setDato("pais", v)}
          onBlur={() => setDato("pais", formatearNombre(datos.pais).trim())}
          error={errores.pais}
          placeholder={PAIS_POR_DEFECTO}
          helper={`Viene puesto como ${PAIS_POR_DEFECTO}. Cámbielo solo si el socio vive fuera del país.`}
        />

        {enEcuador ? (
          <SelectField
            label="Provincia"
            title="Provincia de residencia"
            required
            icon="map-outline"
            value={datos.provincia || null}
            options={PROVINCIAS.map((p) => ({ value: p, label: p }))}
            onChange={(v) => setDato("provincia", v as string)}
            error={errores.provincia}
          />
        ) : (
          <TextField
            label="Provincia, estado o región"
            required
            autoCapitalize="sentences"
            icon="map-outline"
            value={datos.provincia}
            onChangeText={(v) => setDato("provincia", v)}
            onBlur={() => setDato("provincia", formatearNombre(datos.provincia).trim())}
            error={errores.provincia}
            placeholder="Ej. Lombardía"
            helper="La lista de provincias es la del Ecuador: fuera del país se escribe como conste en su domicilio."
          />
        )}

        <TextField
          label="Ciudad"
          required
          autoCapitalize="sentences"
          icon="location-outline"
          value={datos.ciudad}
          onChangeText={(v) => setDato("ciudad", v)}
          onBlur={() => setDato("ciudad", formatearNombre(datos.ciudad).trim())}
          error={errores.ciudad}
          placeholder="Ej. Quito"
        />

        <TextField
          label="Dirección domiciliaria"
          required
          multiline
          icon="map-outline"
          value={datos.direccion}
          onChangeText={(v) => setDato("direccion", v)}
          error={errores.direccion}
          placeholder="Calle principal, número, calle secundaria y referencia"
          maxLength={180}
          showCounter
          helper="Queda como dirección de la Cuenta del socio en el CRM del Club."
        />
      </Card>

      <Card title="Medios de contacto" icon="call">
        <TextField
          label="Teléfono celular"
          required
          keyboardType="phone-pad"
          maxLength={10}
          icon="phone-portrait-outline"
          value={datos.celular}
          onChangeText={(v) => setDato("celular", soloDigitos(v, 10))}
          error={errores.celular}
          placeholder="0991234567"
          helper="Es el teléfono principal que queda registrado en el CRM del Club."
        />

        <TextField
          label="Teléfono de domicilio"
          keyboardType="phone-pad"
          maxLength={9}
          icon="call-outline"
          value={datos.telefonoDomicilio}
          onChangeText={(v) => setDato("telefonoDomicilio", soloDigitos(v, 9))}
          error={errores.telefonoDomicilio}
          placeholder="022345678"
          helper="Opcional."
        />

        <TextField
          label="Teléfono de trabajo"
          keyboardType="phone-pad"
          maxLength={9}
          icon="business-outline"
          value={datos.telefonoTrabajo}
          onChangeText={(v) => setDato("telefonoTrabajo", soloDigitos(v, 9))}
          error={errores.telefonoTrabajo}
          placeholder="022998877"
        />

        <TextField
          label="Correo electrónico"
          required
          keyboardType="email-address"
          autoCapitalize="none"
          icon="mail-outline"
          value={datos.correo}
          onChangeText={(v) => setDato("correo", v)}
          onBlur={() => setDato("correo", normalizarCorreo(datos.correo))}
          error={errores.correo}
          placeholder="nombre@correo.com"
          helper="Queda como correo principal del socio en el CRM del Club."
        />
      </Card>

      {/*
        La forma de pago se preguntaba aquí hasta el 15/09/2026. Se pedía en la
        tableta y otra vez en la bandeja, y ganaba la de la bandeja: en la
        primera prueba real la tableta guardó «débito bancario» y en SAFI quedó
        «efectivo». Ahora la elige una sola vez la Jefatura de Socios, al
        confirmar el registro, junto con la cuota y el grupo de facturación.
      */}
      <InfoNote tone="neutral" icon="card-outline">
        La forma de pago, el valor de la cuota y el grupo de facturación los confirma la Jefatura del
        Área de Socios en su bandeja web, antes de crear al socio en el CRM del Club.
      </InfoNote>
    </>
  );
}
