import React from "react";

import type { Errores } from "../../domain/formularioAfiliacion";
import type { DatosAfiliacion } from "../../domain/solicitud";
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

      {reglas?.requiereDatosLaborales ? (
        <Card title="Información laboral" icon="briefcase">
          <TextField
            label="Profesión u ocupación"
            required
            autoCapitalize="sentences"
            icon="ribbon-outline"
            value={datos.profesion}
            onChangeText={(v) => setDato("profesion", v)}
            error={errores.profesion}
            placeholder="Ej. Ingeniero en Sistemas"
          />

          <TextField
            label="Lugar de trabajo"
            autoCapitalize="sentences"
            icon="business-outline"
            value={datos.lugarTrabajo}
            onChangeText={(v) => setDato("lugarTrabajo", v)}
            placeholder="Ej. Fuerza Aérea Ecuatoriana"
          />

          <TextField
            label="Cargo"
            autoCapitalize="sentences"
            icon="id-card-outline"
            value={datos.cargo}
            onChangeText={(v) => setDato("cargo", v)}
            placeholder="Ej. Jefe de área"
          />
        </Card>
      ) : null}

      <Card
        title="Intereses recreativos"
        subtitle="Nos ayuda a orientar la oferta deportiva y social del Club."
        icon="tennisball"
      >
        <TextField
          label="Actividad de su interés"
          icon="heart-outline"
          value={datos.hobbie}
          onChangeText={(v) => setDato("hobbie", v)}
          placeholder="Ej. Tenis, gimnasio, natación, golf"
        />
      </Card>
    </>
  );
}
