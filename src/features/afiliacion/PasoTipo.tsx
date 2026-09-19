import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { requisitosPara } from "../../domain/documentos";
import type { Errores } from "../../domain/formularioAfiliacion";
import type { DatosAfiliacion } from "../../domain/solicitud";
import { normalizarNombre, normalizarNumeroSocio } from "../../domain/texto";
import {
  GRADOS_OFRECIDOS,
  SITUACIONES_MILITARES,
  TIPOS_DISPONIBLES,
  VINCULO_POR_TIPO,
  documentosDelTramite,
  reglasDe,
  type SituacionMilitar,
  type TipoMiembro,
} from "../../domain/tiposMiembro";
import { soloDigitos } from "../../domain/validaciones";
import { consultarOficial } from "../../services/servidor";
import { colors, radius, spacing } from "../../theme";
import {
  Button,
  Card,
  DataRow,
  InfoNote,
  OptionGroup,
  SelectField,
  TextField,
  type SelectOption,
} from "../../ui";

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

  // Oficial FAE del que depende un D-A o D-B: se consulta en SAFI, a través del
  // servidor, en cuanto se termina de escribir el número. Si no se puede
  // consultar, se sigue: la bandeja lo comprobará antes de crear la ficha.
  const [consultando, setConsultando] = useState(false);
  const [sinConsulta, setSinConsulta] = useState<string | null>(null);
  const oficial =
    datos.oficialDependencia?.numeroSocio === datos.numeroSocioActivo
      ? datos.oficialDependencia
      : null;

  const verificarOficial = async () => {
    const numero = datos.numeroSocioActivo;
    if (!numero || consultando) return;
    setConsultando(true);
    setSinConsulta(null);
    try {
      const consulta = await consultarOficial(numero);
      if (consulta.consultado) {
        setDato("oficialDependencia", consulta.oficial);
      } else {
        setDato("oficialDependencia", null);
        setSinConsulta(consulta.motivo);
      }
    } finally {
      setConsultando(false);
    }
  };
  const requisitos = requisitosPara(datos.tipoMiembro);
  const documentos = documentosDelTramite(datos.tipoMiembro, datos.estadoCivil);

  return (
    <>
      <Card
        title="Tipo de socio"
        subtitle="Todos llenan el formulario R-PGS1-1; cada categoría añade su hoja de solicitud."
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

        {documentos.length > 0 ? (
          <InfoNote tone="info" icon="document-text-outline">
            {`Se generarán: ${documentos
              .map((d) => (d.codigo === "Carta" ? d.titulo : `${d.codigo} (${d.titulo})`))
              .join(" · ")}.${
              datos.tipoMiembro === "DB"
                ? " La hoja del Dependiente B depende del estado civil, que se indica en el paso siguiente."
                : ""
            }`}
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
            El formulario y la carta de compromiso los genera el sistema con las firmas que se tracen
            en la tableta. Las cédulas y partidas las escanea la Jefatura de Socios a la carpeta
            compartida.
          </InfoNote>
        </Card>
      ) : null}

      {reglas?.requiereSocioTitular ? (
        <Card
          title="Socio titular"
          subtitle="La afiliación se vincula a la cuenta de este socio."
          icon="person"
        >
          {/* El vínculo lo fija el tipo elegido: pedirlo aparte permitiría
              declarar a una cónyuge como «Hijo/a». */}
          <DataRow
            label="Vínculo con el socio titular"
            value={datos.tipoMiembro ? VINCULO_POR_TIPO[datos.tipoMiembro] ?? null : null}
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
            onChangeText={(v) => {
              const numero = normalizarNumeroSocio(v);
              setDato("numeroSocioActivo", numero);
              // Otro número: lo que se consultó ya no vale.
              if (datos.oficialDependencia && datos.oficialDependencia.numeroSocio !== numero) {
                setDato("oficialDependencia", null);
              }
              setSinConsulta(null);
            }}
            onBlur={() => {
              if (datos.numeroSocioActivo && !oficial) void verificarOficial();
            }}
            error={errores.numeroSocioActivo}
            helper="Debe ser de un Socio Activo o de un Fundador. Se comprueba en SAFI."
          />

          {oficial?.resultado === "VERIFICADO" ? (
            <InfoNote tone="success" icon="shield-checkmark">
              {`${[oficial.gradoMilitar, oficial.nombres, oficial.apellidos].join(" ").trim()} · Socio ${oficial.tipoSocioSafi} en SAFI. Su grado y su nombre irán en el Parentesco de la ficha.`}
            </InfoNote>
          ) : null}
          {oficial && oficial.resultado !== "VERIFICADO" ? (
            <InfoNote tone="danger" icon="close-circle">
              {oficial.resultado === "NO_ENCONTRADO"
                ? `SAFI no tiene el número de socio ${oficial.numeroSocio}. Revíselo con el socio.`
                : `El N.º ${oficial.numeroSocio} es de ${[oficial.nombres, oficial.apellidos].join(" ").trim()}, socio ${oficial.tipoSocioSafi || "de otra categoría"}: no es Socio Activo ni Fundador. Un D-A o D-B depende de uno de ellos.`}
            </InfoNote>
          ) : null}
          {sinConsulta ? (
            <InfoNote tone="warning" icon="cloud-offline">
              {`No se pudo consultar SAFI (${sinConsulta.replace(/\.$/, "")}). Puede continuar: la bandeja comprobará el número antes de crear la ficha.`}
            </InfoNote>
          ) : null}
          {datos.numeroSocioActivo && !oficial ? (
            <Button
              label={consultando ? "Consultando SAFI…" : "Comprobar en SAFI"}
              icon="search-outline"
              variant="secondary"
              onPress={() => void verificarOficial()}
              loading={consultando}
              fullWidth
            />
          ) : null}
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
