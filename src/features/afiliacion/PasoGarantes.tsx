import React from "react";

import type { Errores } from "../../domain/formularioAfiliacion";
import type { DatosAfiliacion, DatosGarante } from "../../domain/solicitud";
import {
  REGLA_GARANTE,
  celularDesdeSafi,
  convencionalDesdeSafi,
} from "../../domain/sociosSafi";
import { normalizarNombre, normalizarNombreFinal, normalizarNumeroSocio } from "../../domain/texto";
import { bloquesPara, getTipo } from "../../domain/tiposMiembro";
import { soloDigitos } from "../../domain/validaciones";
import { Card, InfoNote, LienzoFirma, TextField } from "../../ui";
import { AvisosSocioSafi, useBuscarSocio } from "./BuscarSocioSafi";

/**
 * Recuadro «SOCIO QUE LE GARANTIZA» / «SOCIOS QUE LE GARANTIZA».
 *
 * Los socios dependientes y los suscriptores de gimnasio requieren un garante;
 * los socios particulares, dos. En la carta de compromiso del socio particular
 * los garantes constan además como codeudores solidarios, por lo que su firma
 * se recoge una sola vez y se estampa en ambos documentos.
 *
 * El garante es un Socio Activo o Fundador (decisión del Coordinador,
 * 23/09/2026). Con su número o su cédula, sus datos se traen de SAFI.
 */

type Props = {
  datos: DatosAfiliacion;
  errores: Errores;
  /**
   * Cambia los datos de un garante sobre el estado vigente, no sobre el de
   * este dibujo: la búsqueda en SAFI responde un momento después.
   */
  actualizarGarante: (
    indice: number,
    cambio: (garante: DatosGarante) => Partial<DatosGarante> | null
  ) => void;
  /** La firma se guarda en disco fuera del paso, no en el estado del asistente. */
  onFirma: (indice: number, dataUri: string | null) => void;
  onDibujando: (dibujando: boolean) => void;
};

export function PasoGarantes({ datos, errores, actualizarGarante, onFirma, onDibujando }: Props) {
  const bloques = bloquesPara(datos.tipoMiembro, datos.estadoCivil);
  if (!bloques || bloques.garantes === 0) return null;

  const definicion = datos.tipoMiembro ? getTipo(datos.tipoMiembro) : null;
  const esCodeudor = definicion?.cartaCompromiso !== null;

  return (
    <>
      <InfoNote tone="info" icon="information-circle-outline">
        {bloques.garantes === 1
          ? "Este tipo de socio requiere un socio del Club que lo garantice."
          : "Este tipo de socio requiere dos socios del Club que lo garanticen."}
        {esCodeudor
          ? " Al firmar, quedan además como codeudores solidarios en la carta de compromiso."
          : ""}
        {" El garante debe ser Socio Activo o Fundador: escriba su número de socio o su cédula y sus datos se traen de SAFI."}
      </InfoNote>

      {datos.garantes.slice(0, bloques.garantes).map((garante, indice) => (
        <TarjetaGarante
          key={garante.id}
          garante={garante}
          indice={indice}
          titulo={bloques.garantes === 1 ? "Socio garante" : `Socio garante ${indice + 1}`}
          errores={errores}
          actualizarGarante={actualizarGarante}
          onFirma={onFirma}
          onDibujando={onDibujando}
        />
      ))}
    </>
  );
}

function TarjetaGarante({
  garante,
  indice,
  titulo,
  errores,
  actualizarGarante,
  onFirma,
  onDibujando,
}: {
  garante: DatosGarante;
  indice: number;
  titulo: string;
  errores: Errores;
  actualizarGarante: Props["actualizarGarante"];
  onFirma: Props["onFirma"];
  onDibujando: Props["onDibujando"];
}) {
  const busqueda = useBuscarSocio(REGLA_GARANTE);

  const cambiar = (cambios: Partial<DatosGarante>) => actualizarGarante(indice, () => cambios);

  const buscar = async () => {
    const buscado = { numeroSocio: garante.numeroSocio, cedula: garante.cedula };
    const resultado = await busqueda.buscar(buscado);
    if (!resultado) return;
    const { verificacion, socio } = resultado;

    actualizarGarante(indice, (actual) => {
      // Si mientras tanto se escribió otro número o cédula, la respuesta ya no
      // es de este garante.
      const mismoNumero =
        normalizarNumeroSocio(actual.numeroSocio) === normalizarNumeroSocio(buscado.numeroSocio);
      const mismaCedula = actual.cedula === buscado.cedula;
      if (!(buscado.numeroSocio ? mismoNumero : mismaCedula)) return null;

      if (!socio) return { verificacion };
      // Lo que SAFI tiene reemplaza a lo escrito; lo que SAFI no tiene, no borra
      // lo escrito.
      return {
        verificacion,
        numeroSocio: verificacion.numeroSocio,
        apellidosNombres:
          normalizarNombreFinal(`${socio.apellidos} ${socio.nombres}`) || actual.apellidosNombres,
        cedula: socio.cedula || actual.cedula,
        telefonoDomicilio: convencionalDesdeSafi(socio.telefonoDomicilio) || actual.telefonoDomicilio,
        celular: celularDesdeSafi(socio.celular) || actual.celular,
      };
    });
  };

  return (
    <Card title={titulo} icon="ribbon">
      <TextField
        label="N.º de socio"
        required
        keyboardType="number-pad"
        maxLength={8}
        icon="barcode-outline"
        value={garante.numeroSocio}
        onChangeText={(v) => {
          cambiar({ numeroSocio: normalizarNumeroSocio(v) });
          busqueda.olvidar();
        }}
        onBlur={() => {
          if (garante.numeroSocio && garante.verificacion?.numeroSocio !== garante.numeroSocio) {
            void buscar();
          }
        }}
        error={errores[`garante-${indice}-socio`]}
        helper="Debe ser de un Socio Activo o de un Fundador. Se comprueba en SAFI."
      />
      <TextField
        label="Cédula"
        keyboardType="number-pad"
        maxLength={10}
        icon="card-outline"
        value={garante.cedula}
        onChangeText={(v) => {
          cambiar({ cedula: soloDigitos(v, 10) });
          busqueda.olvidar();
        }}
        onBlur={() => {
          // Sin número, la cédula completa basta para buscarlo.
          if (!garante.numeroSocio && garante.cedula.length === 10) void buscar();
        }}
        error={errores[`garante-${indice}-cedula`]}
        helper="Si no sabe su número de socio, con la cédula también se encuentra."
      />

      <AvisosSocioSafi
        verificacion={garante.verificacion}
        numero={garante.numeroSocio}
        regla={REGLA_GARANTE}
        papel="el garante"
        detalle="Sus datos se trajeron de SAFI; corríjalos si el socio los tiene distintos."
        cedulaDeclarada={garante.cedula}
        sinConsulta={busqueda.sinConsulta}
        sinCoincidencia={busqueda.sinCoincidencia}
        consultando={busqueda.consultando}
        onBuscar={() => void buscar()}
        puedeBuscar={Boolean(garante.numeroSocio) || garante.cedula.length === 10}
      />

      <TextField
        label="Apellidos y nombres"
        required
        autoCapitalize="characters"
        icon="person-outline"
        helper="En mayúsculas y sin tildes, como consta en el CRM de SAFI."
        value={garante.apellidosNombres}
        onChangeText={(v) => cambiar({ apellidosNombres: normalizarNombre(v) })}
        error={errores[`garante-${indice}-nombre`]}
        placeholder="APELLIDOS NOMBRES"
      />
      <TextField
        label="Teléfono domicilio"
        keyboardType="number-pad"
        maxLength={9}
        icon="call-outline"
        value={garante.telefonoDomicilio}
        onChangeText={(v) => cambiar({ telefonoDomicilio: soloDigitos(v, 9) })}
        error={errores[`garante-${indice}-domicilio`]}
      />
      <TextField
        label="Celular"
        required
        keyboardType="number-pad"
        maxLength={10}
        icon="phone-portrait-outline"
        value={garante.celular}
        onChangeText={(v) => cambiar({ celular: soloDigitos(v, 10) })}
        error={errores[`garante-${indice}-celular`]}
      />

      <LienzoFirma
        valor={garante.firmaUri}
        onChange={(dataUri) => onFirma(indice, dataUri)}
        onDibujando={onDibujando}
        error={errores[`garante-${indice}-firma`]}
        instruccion="El socio garante debe firmar aquí. Se guarda al levantar el dedo."
        alto={150}
      />
    </Card>
  );
}
