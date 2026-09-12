import React from "react";

import type { Errores } from "../../domain/formularioAfiliacion";
import type { DatosAfiliacion } from "../../domain/solicitud";
import { normalizarTextoInstitucional } from "../../domain/texto";
import {
  FUERZAS,
  GRADOS_OFRECIDOS,
  SITUACIONES_MILITARES,
  reglasDe,
  type Fuerza,
  type SituacionMilitar,
} from "../../domain/tiposMiembro";
import { soloDigitos } from "../../domain/validaciones";
import { Card, OptionGroup, SelectField, TextField } from "../../ui";

type Props = {
  datos: DatosAfiliacion;
  errores: Errores;
  setDato: <K extends keyof DatosAfiliacion>(campo: K, valor: DatosAfiliacion[K]) => void;
};

export function PasoLaboral({ datos, errores, setDato }: Props) {
  const reglas = reglasDe(datos.tipoMiembro);

  return (
    <>
      {reglas?.requiereDatosMilitares ? (
        <Card
          title="Información institucional"
          subtitle="Datos de su situación militar."
          icon="shield"
        >
          <SelectField
            label="Grado militar"
            title="Grado militar"
            required
            searchable
            icon="star-outline"
            value={datos.gradoMilitar || null}
            options={GRADOS_OFRECIDOS.map((g) => ({ value: g, label: g }))}
            onChange={(v) => setDato("gradoMilitar", v as string)}
            error={errores.gradoMilitar}
            placeholder="Seleccionar grado…"
            helper="Lista del CRM del Club. Escrito a mano, el CRM rechaza la ficha."
          />

          {/* La promoción es de la Escuela Superior Militar de Aviación: la
              tienen los oficiales FAE, no los corresponsales de otra fuerza. */}
          {reglas.requierePromocion ? (
            <TextField
              label="Promoción"
              required
              keyboardType="number-pad"
              maxLength={4}
              icon="school-outline"
              value={datos.promocion}
              onChangeText={(v) => setDato("promocion", soloDigitos(v, 4))}
              error={errores.promocion}
              placeholder="Ej. 82"
              helper="En números: el CRM la guarda como número, no en romanos."
            />
          ) : null}

          <OptionGroup<SituacionMilitar>
            label="Situación"
            required
            value={datos.situacion}
            options={SITUACIONES_MILITARES.map((s) => ({ value: s, label: s }))}
            onChange={(v) => setDato("situacion", v)}
            error={errores.situacion}
          />

          {reglas.requiereFuerza ? (
            <OptionGroup<Fuerza>
              label="Fuerza"
              required
              value={datos.fuerza}
              options={FUERZAS.map((f) => ({ value: f, label: f }))}
              onChange={(v) => setDato("fuerza", v)}
              error={errores.fuerza}
            />
          ) : null}
        </Card>
      ) : null}

      {/* El R-PGS1-1 tiene estos recuadros para todas las categorías. La
          profesión solo se exige a quien abre cuenta propia: a un hijo juvenil
          o a los padres del titular no se les puede obligar a declarar una. */}
      <Card title="Ocupación" subtitle="Recuadros del formulario R-PGS1-1." icon="briefcase">
        <TextField
          label="Profesión u ocupación"
          required={reglas?.requiereDatosLaborales}
          autoCapitalize="characters"
          icon="ribbon-outline"
          value={datos.profesion}
          onChangeText={(v) => setDato("profesion", normalizarTextoInstitucional(v))}
          error={errores.profesion}
          placeholder="Ej. INGENIERO EN SISTEMAS"
          helper={reglas?.requiereDatosLaborales ? undefined : "Opcional. Ej. ESTUDIANTE, JUBILADO."}
        />

        <TextField
          label="Lugar de trabajo"
          autoCapitalize="characters"
          icon="business-outline"
          value={datos.lugarTrabajo}
          onChangeText={(v) => setDato("lugarTrabajo", normalizarTextoInstitucional(v))}
          placeholder="Ej. FUERZA AEREA ECUATORIANA"
          helper="Con la provincia y el cantón, como pide el formulario."
        />

        <TextField
          label="Cargo"
          autoCapitalize="characters"
          icon="id-card-outline"
          value={datos.cargo}
          onChangeText={(v) => setDato("cargo", normalizarTextoInstitucional(v))}
          placeholder="Ej. JEFE DE AREA"
        />
      </Card>

      <Card
        title="Hobbie"
        subtitle="Nos ayuda a orientar la oferta deportiva y social del Club."
        icon="tennisball"
      >
        <TextField
          label="Actividad de su interés"
          icon="heart-outline"
          autoCapitalize="characters"
          value={datos.hobbie}
          onChangeText={(v) => setDato("hobbie", normalizarTextoInstitucional(v))}
          placeholder="Ej. TENIS, GIMNASIO, NATACION"
          helper="Opcional. Viaja al campo Hobbie de la ficha en SAFI."
        />
      </Card>
    </>
  );
}
