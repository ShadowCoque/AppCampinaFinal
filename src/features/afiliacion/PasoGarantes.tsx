import React from "react";

import type { Errores } from "../../domain/formularioAfiliacion";
import type { DatosAfiliacion, DatosGarante } from "../../domain/solicitud";
import { normalizarNombre, normalizarNumeroSocio } from "../../domain/texto";
import { bloquesPara, getTipo } from "../../domain/tiposMiembro";
import { soloDigitos } from "../../domain/validaciones";
import { Card, InfoNote, LienzoFirma, TextField } from "../../ui";

/**
 * Recuadro «SOCIO QUE LE GARANTIZA» / «SOCIOS QUE LE GARANTIZA».
 *
 * Los socios dependientes y los suscriptores de gimnasio requieren un garante;
 * los socios particulares, dos. En la carta de compromiso del socio particular
 * los garantes constan además como codeudores solidarios, por lo que su firma
 * se recoge una sola vez y se estampa en ambos documentos.
 */

type Props = {
  datos: DatosAfiliacion;
  errores: Errores;
  setDato: <K extends keyof DatosAfiliacion>(campo: K, valor: DatosAfiliacion[K]) => void;
  /** La firma se guarda en disco fuera del paso, no en el estado del asistente. */
  onFirma: (indice: number, dataUri: string | null) => void;
  onDibujando: (dibujando: boolean) => void;
};

export function PasoGarantes({ datos, errores, setDato, onFirma, onDibujando }: Props) {
  const bloques = bloquesPara(datos.tipoMiembro, datos.estadoCivil);
  if (!bloques || bloques.garantes === 0) return null;

  const definicion = datos.tipoMiembro ? getTipo(datos.tipoMiembro) : null;
  const esCodeudor = definicion?.cartaCompromiso !== null;

  const setGarante = (indice: number, cambios: Partial<DatosGarante>) =>
    setDato(
      "garantes",
      datos.garantes.map((garante, i) => (i === indice ? { ...garante, ...cambios } : garante))
    );

  return (
    <>
      <InfoNote tone="info" icon="information-circle-outline">
        {bloques.garantes === 1
          ? "Este tipo de socio requiere un socio del Club que lo garantice."
          : "Este tipo de socio requiere dos socios del Club que lo garanticen."}
        {esCodeudor
          ? " Al firmar, quedan además como codeudores solidarios en la carta de compromiso."
          : ""}
      </InfoNote>

      {datos.garantes.slice(0, bloques.garantes).map((garante, indice) => (
        <Card
          key={garante.id}
          title={bloques.garantes === 1 ? "Socio garante" : `Socio garante ${indice + 1}`}
          icon="ribbon"
        >
          <TextField
            label="Apellidos y nombres"
            required
            autoCapitalize="characters"
            icon="person-outline"
            helper="En mayúsculas y sin tildes, como consta en el CRM de SAFI."
            value={garante.apellidosNombres}
            onChangeText={(v) => setGarante(indice, { apellidosNombres: normalizarNombre(v) })}
            error={errores[`garante-${indice}-nombre`]}
            placeholder="APELLIDOS NOMBRES"
          />
          <TextField
            label="Cédula"
            keyboardType="number-pad"
            maxLength={10}
            icon="card-outline"
            value={garante.cedula}
            onChangeText={(v) => setGarante(indice, { cedula: soloDigitos(v, 10) })}
            error={errores[`garante-${indice}-cedula`]}
          />
          <TextField
            label="N.º de socio"
            required
            keyboardType="number-pad"
            maxLength={8}
            icon="barcode-outline"
            value={garante.numeroSocio}
            onChangeText={(v) => setGarante(indice, { numeroSocio: normalizarNumeroSocio(v) })}
            error={errores[`garante-${indice}-socio`]}
          />
          <TextField
            label="Teléfono domicilio"
            keyboardType="number-pad"
            maxLength={9}
            icon="call-outline"
            value={garante.telefonoDomicilio}
            onChangeText={(v) => setGarante(indice, { telefonoDomicilio: soloDigitos(v, 9) })}
            error={errores[`garante-${indice}-domicilio`]}
          />
          <TextField
            label="Celular"
            required
            keyboardType="number-pad"
            maxLength={10}
            icon="phone-portrait-outline"
            value={garante.celular}
            onChangeText={(v) => setGarante(indice, { celular: soloDigitos(v, 10) })}
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
      ))}
    </>
  );
}
