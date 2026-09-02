import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { requisitosPara } from "../../domain/documentos";
import type { Errores } from "../../domain/formularioAfiliacion";
import type { DatosAfiliacion } from "../../domain/solicitud";
import { normalizarNombre, normalizarNumeroSocio } from "../../domain/texto";
import {
  GRADOS_OFRECIDOS,
  SITUACIONES_MILITARES,
  TIPOS_DISPONIBLES,
  VINCULOS_DEPENDIENTE,
  VINCULO_POR_TIPO,
  formularioPara,
  getTipo,
  reglasDe,
  type SituacionMilitar,
  type TipoMiembro,
  type VinculoDependiente,
} from "../../domain/tiposMiembro";
import { soloDigitos } from "../../domain/validaciones";
import { colors, radius, spacing } from "../../theme";
import { Card, InfoNote, OptionGroup, SelectField, TextField, type SelectOption } from "../../ui";

type Props = {
  datos: DatosAfiliacion;
  errores: Errores;
  setDato: <K extends keyof DatosAfiliacion>(campo: K, valor: DatosAfiliacion[K]) => void;
};

export function PasoTipo({ datos, errores, setDato }: Props) {
  const opciones = useMemo<SelectOption<TipoMiembro>[]>(
    () =>
      TIPOS_DISPONIBLES.map((tipo) => ({
        value: tipo.codigo,
        label: tipo.nombre,
        description: tipo.descripcion,
        group: tipo.categoria,
      })),
    []
  );

  const reglas = reglasDe(datos.tipoMiembro);
  const definicion = datos.tipoMiembro ? getTipo(datos.tipoMiembro) : null;
  const requisitos = requisitosPara(datos.tipoMiembro);
  const formulario = formularioPara(datos.tipoMiembro, datos.estadoCivil);

  return (
    <>
      <Card
        title="Tipo de socio"
        subtitle="El formulario se adapta al que seleccione y se genera con ese mismo formato."
        icon="people"
      >
        <SelectField
          label="Tipo de socio a afiliar"
          title="Seleccione el tipo de socio"
          required
          searchable
          icon="pricetag-outline"
          value={datos.tipoMiembro}
          options={opciones}
          onChange={(valor) => setDato("tipoMiembro", valor)}
          error={errores.tipoMiembro}
          placeholder="Seleccionar tipo de socio…"
        />

        {formulario ? (
          <InfoNote tone="info" icon="document-text-outline">
            {`Se generará el formulario ${formulario.codigo} — ${formulario.titulo}${
              definicion?.cartaCompromiso
                ? ", con su carta de compromiso"
                : ""
            }.`}
          </InfoNote>
        ) : null}
      </Card>

      {reglas ? (
        <Card title="Requisitos de este tipo de socio" icon="list-circle">
          <View style={styles.requisitos}>
            {requisitos.map((requisito) => (
              <View key={requisito.tipo} style={styles.requisito}>
                <View
                  style={[
                    styles.punto,
                    { backgroundColor: requisito.obligatorio ? colors.gold : colors.border },
                  ]}
                />
                <Text style={styles.requisitoTexto}>
                  {requisito.nombre}
                  {requisito.obligatorio ? "" : "  (opcional)"}
                </Text>
              </View>
            ))}
          </View>
          <InfoNote tone="info" icon="time-outline">
            El formulario y la carta de compromiso los genera la aplicación. Los demás documentos se
            adjuntan en el paso “Documentos” o los deposita la Jefatura de Socios en la carpeta
            compartida de escaneos.
          </InfoNote>
        </Card>
      ) : null}

      {reglas?.requiereSocioTitular ? (
        <Card
          title="Socio titular"
          subtitle="La afiliación se vincula a la cuenta de este socio."
          icon="person"
        >
          <OptionGroup<VinculoDependiente>
            label="Vínculo con el socio titular"
            required
            options={VINCULOS_DEPENDIENTE.map((v) => ({ value: v, label: v }))}
            value={datos.vinculoConTitular ?? VINCULO_POR_TIPO[datos.tipoMiembro ?? "CONYUGE"] ?? null}
            onChange={(valor) => setDato("vinculoConTitular", valor)}
            error={errores.vinculoConTitular}
          />

          <TextField
            label="Apellidos del socio titular"
            required
            autoCapitalize="characters"
            icon="person-outline"
            helper="En mayúsculas y sin tildes, como consta en el CRM de SAFI."
            value={datos.titularApellidos}
            onChangeText={(v) => setDato("titularApellidos", normalizarNombre(v))}
            error={errores.titularApellidos}
            placeholder="APELLIDOS"
          />
          <TextField
            label="Nombres del socio titular"
            required
            autoCapitalize="characters"
            icon="person-outline"
            value={datos.titularNombres}
            onChangeText={(v) => setDato("titularNombres", normalizarNombre(v))}
            error={errores.titularNombres}
            placeholder="NOMBRES"
          />
          <TextField
            label="Cédula del socio titular"
            required
            keyboardType="number-pad"
            maxLength={10}
            icon="card-outline"
            value={datos.titularCedula}
            onChangeText={(v) => setDato("titularCedula", soloDigitos(v, 10))}
            error={errores.titularCedula}
            placeholder="10 dígitos"
          />
          <TextField
            label="N.º de socio del titular"
            required
            helper="Es el número bajo el que se archivará el expediente."
            keyboardType="number-pad"
            maxLength={8}
            icon="barcode-outline"
            value={datos.titularNumeroSocio}
            onChangeText={(v) => setDato("titularNumeroSocio", normalizarNumeroSocio(v))}
            error={errores.titularNumeroSocio}
          />

          <SelectField
            label="Grado militar del titular"
            title="Grado militar del titular"
            searchable
            icon="ribbon-outline"
            value={datos.titularGradoMilitar || null}
            options={GRADOS_OFRECIDOS.map((g) => ({ value: g, label: g }))}
            onChange={(v) => setDato("titularGradoMilitar", (v as string) ?? "")}
            placeholder="Solo si el titular es oficial FAE"
            helper="Encabeza el campo Parentesco de la ficha del dependiente en el CRM."
          />
          <OptionGroup<SituacionMilitar>
            label="Situación del titular"
            options={SITUACIONES_MILITARES.map((s) => ({ value: s, label: s }))}
            value={datos.titularSituacion}
            onChange={(valor) => setDato("titularSituacion", valor)}
          />
        </Card>
      ) : null}

      {reglas?.requiereNumeroSocioActivo ? (
        <Card
          title="Oficial FAE del que depende"
          subtitle="Casilla «Número de Socio Activo» del reverso del formulario."
          icon="shield-checkmark"
        >
          <TextField
            label="N.º de socio del oficial FAE"
            required
            keyboardType="number-pad"
            maxLength={8}
            icon="barcode-outline"
            value={datos.numeroSocioActivo}
            onChangeText={(v) => setDato("numeroSocioActivo", normalizarNumeroSocio(v))}
            error={errores.numeroSocioActivo}
          />
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  requisitos: { gap: spacing.sm },
  requisito: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  punto: { width: 7, height: 7, borderRadius: radius.pill },
  requisitoTexto: { flex: 1, fontSize: 13.5, color: colors.text, lineHeight: 19 },
});
