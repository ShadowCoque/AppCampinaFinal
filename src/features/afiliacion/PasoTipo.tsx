import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { requisitosPara } from "../../domain/documentos";
import type { Errores } from "../../domain/formularioAfiliacion";
import type { DatosAfiliacion } from "../../domain/solicitud";
import {
  REGLA_OFICIAL,
  gradoDesdeSafi,
  reglaDependencia,
  reglaTitular,
  rotuloDependencia,
} from "../../domain/sociosSafi";
import { normalizarNombre, normalizarNombreFinal, normalizarNumeroSocio } from "../../domain/texto";
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
import { colors, radius, spacing } from "../../theme";
import {
  Card,
  DataRow,
  InfoNote,
  OptionGroup,
  SelectField,
  TextField,
  type SelectOption,
} from "../../ui";
import { AvisosSocioSafi, useBuscarSocio } from "./BuscarSocioSafi";

type Props = {
  datos: DatosAfiliacion;
  errores: Errores;
  setDato: <K extends keyof DatosAfiliacion>(campo: K, valor: DatosAfiliacion[K]) => void;
  /**
   * Cambia varios datos a la vez sobre el estado vigente, no sobre el de este
   * dibujo: la búsqueda en SAFI responde un momento después. `null`, nada.
   */
  actualizar: (cambio: (datos: DatosAfiliacion) => Partial<DatosAfiliacion> | null) => void;
};

export function PasoTipo({ datos, errores, setDato, actualizar }: Props) {
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

  // El socio del que depende un D-A o D-B (su oficial FAE) o un D-C (su padre
  // o madre D-B), y el titular de un cónyuge, unos padres o un juvenil: se
  // buscan en SAFI, a través del servidor, en cuanto se termina de escribir el
  // número o la cédula. Si no se puede consultar, se sigue: la bandeja lo
  // comprobará antes de crear la ficha.
  //
  // El D-C tiene además al oficial FAE del que desciende —su abuelo—: es el que
  // va a su Parentesco y a la línea «de …» del formulario, no el D-B del que
  // depende (Coordinador, 23/09/2026). No es obligatorio aquí: si no lo saben,
  // la Jefatura lo completa en la bandeja, y sin él no se crea la ficha.
  const reglaDep = reglaDependencia(datos.tipoMiembro);
  const reglaTit = reglaTitular(datos.tipoMiembro);
  const esDC = datos.tipoMiembro === "DC";
  const busquedaDependencia = useBuscarSocio(reglaDep);
  const busquedaTitular = useBuscarSocio(reglaTit);
  const busquedaOficial = useBuscarSocio(esDC ? REGLA_OFICIAL : null);
  const numeroOficialFae = datos.numeroOficialFae ?? "";

  const verificarDependencia = async () => {
    const buscado = normalizarNumeroSocio(datos.numeroSocioActivo);
    const resultado = await busquedaDependencia.buscar({ numeroSocio: buscado, cedula: "" });
    if (!resultado) return;
    // Si mientras tanto se escribió otro número, la respuesta ya no vale.
    actualizar((actuales) =>
      normalizarNumeroSocio(actuales.numeroSocioActivo) === buscado
        ? { oficialDependencia: resultado.verificacion }
        : null
    );
  };

  const verificarOficialFae = async () => {
    const buscado = normalizarNumeroSocio(numeroOficialFae);
    const resultado = await busquedaOficial.buscar({ numeroSocio: buscado, cedula: "" });
    if (!resultado) return;
    // Si mientras tanto se escribió otro número, la respuesta ya no vale.
    actualizar((actuales) =>
      normalizarNumeroSocio(actuales.numeroOficialFae ?? "") === buscado
        ? { oficialFaeVerificado: resultado.verificacion }
        : null
    );
  };

  const verificarTitular = async () => {
    const buscado = { numeroSocio: datos.titularNumeroSocio, cedula: datos.titularCedula };
    const resultado = await busquedaTitular.buscar(buscado);
    if (!resultado) return;
    const { verificacion, socio } = resultado;
    actualizar((actuales) => {
      const vigente = buscado.numeroSocio
        ? normalizarNumeroSocio(actuales.titularNumeroSocio) ===
          normalizarNumeroSocio(buscado.numeroSocio)
        : actuales.titularCedula === buscado.cedula;
      if (!vigente) return null;
      if (!socio) return { titularVerificado: verificacion };
      // Lo que SAFI tiene reemplaza a lo escrito; lo que SAFI no tiene, no
      // borra lo escrito.
      return {
        titularVerificado: verificacion,
        titularNumeroSocio: verificacion.numeroSocio,
        titularApellidos: normalizarNombreFinal(socio.apellidos) || actuales.titularApellidos,
        titularNombres: normalizarNombreFinal(socio.nombres) || actuales.titularNombres,
        titularCedula: socio.cedula || actuales.titularCedula,
        titularGradoMilitar: gradoDesdeSafi(socio.gradoMilitar, actuales.titularGradoMilitar),
      };
    });
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
            label="N.º de socio del titular"
            required
            helper={
              datos.tipoMiembro === "PADRES"
                ? "Es el número bajo el que se archivará el expediente. Debe ser de un Socio Activo o de un Fundador: se comprueba en SAFI y se traen sus datos."
                : "Es el número bajo el que se archivará el expediente. Se comprueba en SAFI y se traen sus datos."
            }
            keyboardType="number-pad"
            maxLength={8}
            icon="barcode-outline"
            value={datos.titularNumeroSocio}
            onChangeText={(v) => {
              setDato("titularNumeroSocio", normalizarNumeroSocio(v));
              busquedaTitular.olvidar();
            }}
            onBlur={() => {
              if (
                datos.titularNumeroSocio &&
                datos.titularVerificado?.numeroSocio !== datos.titularNumeroSocio
              ) {
                void verificarTitular();
              }
            }}
            error={errores.titularNumeroSocio}
          />
          <TextField
            label="Cédula del socio titular"
            required
            keyboardType="number-pad"
            maxLength={10}
            icon="card-outline"
            value={datos.titularCedula}
            onChangeText={(v) => {
              setDato("titularCedula", soloDigitos(v, 10));
              busquedaTitular.olvidar();
            }}
            onBlur={() => {
              // Sin número, la cédula completa basta para buscarlo.
              if (!datos.titularNumeroSocio && datos.titularCedula.length === 10) {
                void verificarTitular();
              }
            }}
            error={errores.titularCedula}
            placeholder="10 dígitos"
          />

          {reglaTit ? (
            <AvisosSocioSafi
              verificacion={datos.titularVerificado}
              numero={datos.titularNumeroSocio}
              regla={reglaTit}
              papel="el titular"
              detalle="Sus datos se trajeron de SAFI; su grado y su nombre irán en el Parentesco de la ficha y en el formulario."
              cedulaDeclarada={datos.titularCedula}
              sinConsulta={busquedaTitular.sinConsulta}
              sinCoincidencia={busquedaTitular.sinCoincidencia}
              consultando={busquedaTitular.consultando}
              onBuscar={() => void verificarTitular()}
              puedeBuscar={Boolean(datos.titularNumeroSocio) || datos.titularCedula.length === 10}
            />
          ) : null}

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

      {reglaDep ? (
        <Card
          title={rotuloDependencia(datos.tipoMiembro)}
          subtitle={
            reglaDep === "DEPENDIENTE_B"
              ? "El padre o la madre del solicitante, socio Dependiente B: así lo pide el PGS1-11."
              : "Casilla «Número de Socio Activo» del reverso del formulario."
          }
          icon="shield-checkmark"
        >
          <TextField
            label={
              reglaDep === "DEPENDIENTE_B"
                ? "N.º de socio del padre o la madre (D-B)"
                : "N.º de socio del oficial FAE"
            }
            required
            keyboardType="number-pad"
            maxLength={8}
            icon="barcode-outline"
            value={datos.numeroSocioActivo}
            onChangeText={(v) => {
              setDato("numeroSocioActivo", normalizarNumeroSocio(v));
              busquedaDependencia.olvidar();
            }}
            onBlur={() => {
              if (
                datos.numeroSocioActivo &&
                datos.oficialDependencia?.numeroSocio !== datos.numeroSocioActivo
              ) {
                void verificarDependencia();
              }
            }}
            error={errores.numeroSocioActivo}
            helper={
              reglaDep === "DEPENDIENTE_B"
                ? "Debe ser de un Socio Dependiente B. Se comprueba en SAFI."
                : "Debe ser de un Socio Activo o de un Fundador. Se comprueba en SAFI."
            }
          />

          <AvisosSocioSafi
            verificacion={datos.oficialDependencia}
            numero={datos.numeroSocioActivo}
            regla={reglaDep}
            papel={reglaDep === "DEPENDIENTE_B" ? "el socio del que depende un D-C" : "el oficial del que depende"}
            detalle={
              esDC
                ? "Se comprueba que sea un Socio Dependiente B."
                : "Su grado y su nombre irán en el Parentesco de la ficha y en el formulario."
            }
            sinConsulta={busquedaDependencia.sinConsulta}
            sinCoincidencia={busquedaDependencia.sinCoincidencia}
            consultando={busquedaDependencia.consultando}
            onBuscar={() => void verificarDependencia()}
            puedeBuscar={Boolean(datos.numeroSocioActivo)}
          />
        </Card>
      ) : null}

      {esDC ? (
        <Card
          title="Oficial FAE del que desciende"
          subtitle="Su abuelo: el padre o la madre de su socio D-B. Va al Parentesco y al «de …» del formulario."
          icon="ribbon"
        >
          <TextField
            label="N.º de socio del oficial FAE (abuelo)"
            keyboardType="number-pad"
            maxLength={8}
            icon="barcode-outline"
            value={numeroOficialFae}
            onChangeText={(v) => {
              setDato("numeroOficialFae", normalizarNumeroSocio(v));
              busquedaOficial.olvidar();
            }}
            onBlur={() => {
              if (numeroOficialFae && datos.oficialFaeVerificado?.numeroSocio !== numeroOficialFae) {
                void verificarOficialFae();
              }
            }}
            error={errores.numeroOficialFae}
            helper="El padre o la madre de su socio D-B. Debe ser Activo o Fundador. Su grado y su nombre irán en el Parentesco. Si no lo saben, déjelo vacío: la Jefatura de Socios lo completa en la bandeja."
          />

          <AvisosSocioSafi
            verificacion={datos.oficialFaeVerificado}
            numero={numeroOficialFae}
            regla={REGLA_OFICIAL}
            papel="el oficial FAE del que desciende"
            detalle="Su grado y su nombre irán en el Parentesco de la ficha y en el formulario."
            sinConsulta={busquedaOficial.sinConsulta}
            sinCoincidencia={busquedaOficial.sinCoincidencia}
            consultando={busquedaOficial.consultando}
            onBuscar={() => void verificarOficialFae()}
            puedeBuscar={Boolean(numeroOficialFae)}
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
