import React from "react";

import type { Errores } from "../../domain/formularioAfiliacion";
import type { DatosAfiliacion, DatosGarante } from "../../domain/solicitud";
import {
  REGLA_GARANTE,
  celularDesdeSafi,
  convencionalDesdeSafi,
} from "../../domain/sociosSafi";
import { normalizarNombre, normalizarNombreFinal } from "../../domain/texto";
import { bloquesPara, getTipo } from "../../domain/tiposMiembro";
import { soloDigitos } from "../../domain/validaciones";
import { Card, InfoNote, LienzoFirma, TextField } from "../../ui";
import { CamposBusquedaSocio } from "./BuscarSocioSafi";

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
  const cambiar = (cambios: Partial<DatosGarante>) => actualizarGarante(indice, () => cambios);

  return (
    <Card title={titulo} icon="ribbon">
      <CamposBusquedaSocio
        regla={REGLA_GARANTE}
        papel="el garante"
        detalle="Sus datos se trajeron de SAFI. Corríjalos si el socio los tiene distintos."
        etiquetaNumero="N.º de socio"
        ayudaNumero="Debe ser de un Socio Activo o de un Fundador. Se comprueba en SAFI."
        requerido
        numero={garante.numeroSocio}
        cedula={garante.cedula}
        verificacion={garante.verificacion}
        errorNumero={errores[`garante-${indice}-socio`]}
        errorCedula={errores[`garante-${indice}-cedula`]}
        onNumero={(numeroSocio) => cambiar({ numeroSocio })}
        onCedula={(cedula) => cambiar({ cedula })}
        onDescartar={() =>
          cambiar({ verificacion: null, apellidosNombres: "", telefonoDomicilio: "", celular: "" })
        }
        onEncontrado={({ verificacion, socio }) =>
          actualizarGarante(indice, (actual) =>
            socio
              ? {
                  verificacion,
                  numeroSocio: verificacion.numeroSocio,
                  apellidosNombres:
                    normalizarNombreFinal(`${socio.apellidos} ${socio.nombres}`) ||
                    actual.apellidosNombres,
                  cedula: socio.cedula || actual.cedula,
                  telefonoDomicilio:
                    convencionalDesdeSafi(socio.telefonoDomicilio) || actual.telefonoDomicilio,
                  celular: celularDesdeSafi(socio.celular) || actual.celular,
                }
              : { verificacion }
          )
        }
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
