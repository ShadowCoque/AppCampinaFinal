import React, { useMemo } from "react";

import { calcularEdad } from "../../domain/fechas";
import type { Errores } from "../../domain/formularioAfiliacion";
import type { DatosAfiliacion, RegistroIdentidad } from "../../domain/solicitud";
import { normalizarNombre, normalizarTextoInstitucional } from "../../domain/texto";
import {
  ESTADOS_CIVILES,
  SEXOS,
  TIPOS_SANGRE,
  bloquesPara,
  reglasDe,
  type Sexo,
} from "../../domain/tiposMiembro";
import { Card, DateField, InfoNote, OptionGroup, SelectField, TextField } from "../../ui";

type Props = {
  datos: DatosAfiliacion;
  identidad: RegistroIdentidad;
  errores: Errores;
  setDato: <K extends keyof DatosAfiliacion>(campo: K, valor: DatosAfiliacion[K]) => void;
};

const HACE_120_ANIOS = new Date(new Date().getFullYear() - 120, 0, 1);
const AYUDA_REGISTRO_CIVIL = "Dato obtenido del Registro Civil. Corríjalo solo si difiere de la cédula.";

/**
 * Los nombres se capturan en MAYÚSCULAS y sin tildes porque así los almacena el
 * CRM de SAFI, y de ellos depende el nombre de la carpeta del expediente
 * digital. Normalizar al escribir evita tener que corregirlo después.
 */
const AYUDA_FORMATO = "En mayúsculas y sin tildes, como consta en el CRM de SAFI.";

export function PasoPersonales({ datos, identidad, errores, setDato }: Props) {
  const hoy = useMemo(() => new Date(), []);
  const edad = datos.fechaNacimiento ? calcularEdad(datos.fechaNacimiento) : null;
  const reglas = reglasDe(datos.tipoMiembro);
  const bloques = bloquesPara(datos.tipoMiembro, datos.estadoCivil);

  const desdeRegistro = (campo: string) => identidad.camposVerificados.includes(campo);
  const ayuda = (campo: string, alternativa?: string) =>
    desdeRegistro(campo) ? AYUDA_REGISTRO_CIVIL : alternativa;

  return (
    <>
      {identidad.origen !== "MANUAL" ? (
        <InfoNote tone="success" icon="shield-checkmark">
          Los campos marcados provienen del Registro Civil. Verifique que coincidan con la cédula
          física antes de continuar.
        </InfoNote>
      ) : null}

      <Card
        title="Identificación del solicitante"
        subtitle={`Cédula ${datos.cedula || "—"}`}
        icon="person-circle"
      >
        <TextField
          label="Apellidos"
          required
          autoCapitalize="characters"
          icon="text-outline"
          value={datos.apellidos}
          onChangeText={(v) => setDato("apellidos", normalizarNombre(v))}
          onBlur={() => setDato("apellidos", datos.apellidos.trim())}
          error={errores.apellidos}
          helper={ayuda("apellidos", AYUDA_FORMATO)}
          placeholder="PEREZ ANDRADE"
        />

        <TextField
          label="Nombres"
          required
          autoCapitalize="characters"
          icon="text-outline"
          value={datos.nombres}
          onChangeText={(v) => setDato("nombres", normalizarNombre(v))}
          onBlur={() => setDato("nombres", datos.nombres.trim())}
          error={errores.nombres}
          helper={ayuda("nombres", AYUDA_FORMATO)}
          placeholder="JUAN CARLOS"
        />

        {bloques?.sexo ? (
          <OptionGroup<Sexo>
            label="Sexo"
            required
            options={SEXOS.map((s) => ({ value: s, label: s }))}
            value={datos.sexo}
            onChange={(v) => setDato("sexo", v)}
            error={errores.sexo}
          />
        ) : null}

        <TextField
          label="Lugar de nacimiento"
          required
          autoCapitalize="characters"
          icon="location-outline"
          value={datos.lugarNacimiento}
          onChangeText={(v) => setDato("lugarNacimiento", normalizarTextoInstitucional(v))}
          error={errores.lugarNacimiento}
          helper={ayuda("lugarNacimiento", "Ciudad y provincia.")}
          placeholder="QUITO, PICHINCHA"
        />

        <DateField
          label="Fecha de nacimiento"
          required
          value={datos.fechaNacimiento}
          onChange={(iso) => setDato("fechaNacimiento", iso)}
          error={errores.fechaNacimiento}
          minimumDate={HACE_120_ANIOS}
          maximumDate={hoy}
          helper={ayuda(
            "fechaNacimiento",
            edad !== null && edad >= 0 ? `Edad calculada: ${edad} años.` : undefined
          )}
        />

        {reglas?.edadMaxima !== undefined ? (
          <InfoNote tone="warning" icon="alert-circle-outline">
            {`Este tipo de socio admite solicitantes de hasta ${reglas.edadMaxima} años de edad${
              reglas.exigeSoltero ? " y en estado civil soltero" : ""
            }.`}
          </InfoNote>
        ) : null}
      </Card>

      <Card title="Información complementaria" icon="clipboard">
        <SelectField
          label="Estado civil"
          required
          title="Estado civil"
          icon="heart-outline"
          value={datos.estadoCivil || null}
          options={ESTADOS_CIVILES.map((e) => ({ value: e, label: e }))}
          onChange={(v) => setDato("estadoCivil", v)}
          error={errores.estadoCivil}
          helper={ayuda(
            "estadoCivil",
            datos.tipoMiembro === "DB"
              ? "El Dependiente B tiene un formulario distinto para casados y para solteros: este dato lo determina."
              : undefined
          )}
        />

        {bloques?.tipoSangre ? (
          <SelectField
            label="Tipo de sangre"
            required
            title="Tipo de sangre"
            icon="water-outline"
            value={datos.tipoSangre || null}
            options={TIPOS_SANGRE.map((t) => ({ value: t, label: t }))}
            onChange={(v) => setDato("tipoSangre", v)}
            error={errores.tipoSangre}
            helper="Consta en el formulario impreso de este tipo de socio."
          />
        ) : null}
      </Card>
    </>
  );
}
