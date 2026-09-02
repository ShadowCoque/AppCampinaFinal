import React from "react";

import { FORMAS_PAGO, FORMA_PAGO_META, type FormaPago } from "../../domain/facturacion";
import type { Errores } from "../../domain/formularioAfiliacion";
import type { DatosAfiliacion } from "../../domain/solicitud";
import { PROVINCIAS } from "../../domain/tiposMiembro";
import { formatearNombre, normalizarCorreo, soloDigitos } from "../../domain/validaciones";
import { Card, InfoNote, SelectField, TextField } from "../../ui";

type Props = {
  datos: DatosAfiliacion;
  errores: Errores;
  setDato: <K extends keyof DatosAfiliacion>(campo: K, valor: DatosAfiliacion[K]) => void;
};

export function PasoContacto({ datos, errores, setDato }: Props) {
  return (
    <>
      <Card title="Domicilio" icon="home">
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
        La facturación no forma parte del alcance: la resuelve el Área de
        Contabilidad en el CRM de SAFI a partir del registro ya creado (informe
        CLC-TI-010 versión 6, numerales 1 y 10). Lo único que se captura aquí es
        cómo paga el socio, porque es un dato de su ficha —el campo FORMA_PAGO
        de su Cuenta en el CRM— y no un cálculo de cobro.
      */}
      <Card
        title="Forma de pago"
        subtitle="Modalidad acordada con el socio para su cuota de mantenimiento."
        icon="card"
      >
        <SelectField
          label="Forma de pago"
          title="Forma de pago"
          required
          icon="card-outline"
          value={datos.formaPago}
          options={FORMAS_PAGO.map((f) => ({
            value: f,
            label: FORMA_PAGO_META[f].etiqueta,
            description: FORMA_PAGO_META[f].detalle,
          }))}
          onChange={(v) => setDato("formaPago", v as FormaPago)}
          error={errores.formaPago}
        />
        <InfoNote tone="info" icon="information-circle-outline">
          El grupo de facturación y el valor de la cuota los confirma la Jefatura del Área de Socios
          en su bandeja web antes de crear al socio en el CRM.
        </InfoNote>
      </Card>
    </>
  );
}
