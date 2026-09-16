import { calcularEdad } from "./fechas";
import { cuotaAnualSugerida, cuotaMensualSugerida, formatearValor } from "./cuotas";
import { CONSENTIMIENTOS, type ClaveConsentimiento } from "./privacidad";
import {
  VINCULO_POR_TIPO,
  bloquesPara,
  esEstadoCivilCasado,
  getTipo,
  reglasDe,
  type ModeloCarta,
} from "./tiposMiembro";
import {
  cartaVacia,
  conyugeEstaVacio,
  type ArchivoAdjunto,
  type DatosAfiliacion,
  type DatosCartaCompromiso,
  type RegistroIdentidad,
  datosVacios,
  identidadVacia,
} from "./solicitud";
import { incluyeBiometria } from "./snic";
import {
  validarCedula,
  validarCelular,
  validarConvencional,
  validarCorreo,
  validarNombre,
  validarNombreCompleto,
  validarObligatorio,
} from "./validaciones";

/* ------------------------------------------------------------------ */
/* Estado del formulario                                               */
/* ------------------------------------------------------------------ */

export type ConsentimientosForm = Record<ClaveConsentimiento, boolean>;

export function consentimientosVacios(): ConsentimientosForm {
  return CONSENTIMIENTOS.reduce((acc, c) => {
    acc[c.clave] = false;
    return acc;
  }, {} as ConsentimientosForm);
}

export type EstadoFormulario = {
  datos: DatosAfiliacion;
  documentos: ArchivoAdjunto[];
  firmaUri: string | null;
  consentimientos: ConsentimientosForm;
  identidad: RegistroIdentidad;
};

export function estadoInicial(): EstadoFormulario {
  return {
    datos: datosVacios(),
    documentos: [],
    firmaUri: null,
    consentimientos: consentimientosVacios(),
    identidad: identidadVacia(),
  };
}

/**
 * Sincroniza los bloques del formulario con el tipo de socio y el estado civil
 * elegidos. Si el solicitante deja de estar casado, el recuadro del cónyuge
 * deja de aplicar; si el tipo pasa a exigir dos garantes, se prepara el segundo.
 * Devuelve siempre un objeto nuevo: nunca muta el estado recibido.
 */
export function ajustarBloques(datos: DatosAfiliacion): DatosAfiliacion {
  const bloques = bloquesPara(datos.tipoMiembro, datos.estadoCivil);
  if (!bloques) return datos;

  const definicion = datos.tipoMiembro ? getTipo(datos.tipoMiembro) : null;

  const garantes = [...datos.garantes];
  while (garantes.length < bloques.garantes) {
    garantes.push({
      id: `garante-${garantes.length + 1}`,
      apellidosNombres: "",
      cedula: "",
      telefonoDomicilio: "",
      celular: "",
      numeroSocio: "",
      firmaUri: null,
    });
  }
  garantes.length = bloques.garantes;

  return {
    ...datos,
    garantes,
    hijos: bloques.hijos ? datos.hijos : [],
    // El vínculo con el titular lo fija el tipo elegido: una cónyuge no puede
    // quedar declarada como «Hijo/a» por un toque equivocado.
    vinculoConTitular: datos.tipoMiembro ? VINCULO_POR_TIPO[datos.tipoMiembro] ?? null : null,
    carta:
      definicion?.cartaCompromiso == null
        ? null
        : datos.carta?.modelo === definicion.cartaCompromiso
          ? datos.carta
          : cartaNueva(definicion.cartaCompromiso, datos),
  };
}

/**
 * Carta de compromiso recién abierta, con los valores del tarifario del Club ya
 * escritos.
 *
 * La carta reconoce «el valor de mi cuota de mantenimiento anual» y el
 * mensualizado al que el socio puede acogerse: ambos están fijados por tipo de
 * socio en `CUOTAS TIPO SOCIOS.pdf`, así que se proponen en lugar de pedirlos en
 * blanco. Siguen siendo editables, porque hay acuerdos particulares que la
 * Jefatura conoce y el tarifario no recoge.
 */
function cartaNueva(modelo: ModeloCarta, datos: DatosAfiliacion): DatosCartaCompromiso {
  const anual = cuotaAnualSugerida(datos.tipoMiembro, datos.estadoCivil);
  const mensual = cuotaMensualSugerida(datos.tipoMiembro, datos.estadoCivil);

  return {
    ...cartaVacia(modelo),
    cuotaAnual: anual === null ? "" : formatearValor(anual),
    cuotaMensualizada: mensual === null ? "" : formatearValor(mensual),
  };
}

/** Errores del paso: clave de campo → mensaje. */
export type Errores = Partial<Record<string, string>>;

/* ------------------------------------------------------------------ */
/* Pasos del asistente                                                 */
/* ------------------------------------------------------------------ */

export const CLAVES_PASO = [
  "identificacion",
  "tipo",
  "personales",
  "contacto",
  "laboral",
  "familia",
  "garantes",
  "compromiso",
  "consentimiento",
  "revision",
] as const;

export type ClavePaso = (typeof CLAVES_PASO)[number];

type DefinicionPaso = { key: ClavePaso; title: string; shortTitle: string };

const TODOS_LOS_PASOS: DefinicionPaso[] = [
  { key: "identificacion", title: "Identificación del solicitante", shortTitle: "Cédula" },
  { key: "tipo", title: "Tipo de socio y vínculo", shortTitle: "Tipo" },
  { key: "personales", title: "Datos personales del aspirante", shortTitle: "Personales" },
  { key: "contacto", title: "Contacto y domicilio", shortTitle: "Contacto" },
  { key: "laboral", title: "Ocupación e información institucional", shortTitle: "Ocupación" },
  { key: "familia", title: "Cónyuge e hijos", shortTitle: "Familia" },
  { key: "garantes", title: "Socios que le garantizan", shortTitle: "Garantes" },
  { key: "compromiso", title: "Carta de compromiso", shortTitle: "Compromiso" },
  { key: "consentimiento", title: "Protección de datos y firma", shortTitle: "Consentimiento" },
  { key: "revision", title: "Revisión y registro", shortTitle: "Revisión" },
];

/**
 * Los pasos visibles se derivan de los documentos del tipo de socio
 * seleccionado: el R-PGS1-1, común a todos, y los recuadros que añade su hoja
 * de solicitud. La aplicación pide exactamente eso, ni un campo más.
 */
export function pasosPara(datos: DatosAfiliacion): DefinicionPaso[] {
  const bloques = bloquesPara(datos.tipoMiembro, datos.estadoCivil);
  const definicion = datos.tipoMiembro ? getTipo(datos.tipoMiembro) : null;

  return TODOS_LOS_PASOS.filter((paso) => {
    // Antes de elegir el tipo no se puede saber qué bloques aplican: se
    // muestran todos para que el indicador de progreso no salte.
    if (!bloques) return true;

    switch (paso.key) {
      case "familia":
        return bloques.conyuge || bloques.hijos;
      case "garantes":
        return bloques.garantes > 0;
      case "compromiso":
        return definicion?.cartaCompromiso != null;
      default:
        return true;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Validación por paso                                                 */
/* ------------------------------------------------------------------ */

function validarIdentificacion(estado: EstadoFormulario): Errores {
  const errores: Errores = {};

  const cedula = validarCedula(estado.datos.cedula);
  if (cedula) {
    errores.cedula = cedula;
    return errores;
  }

  // Con acceso biométrico, el operador debe confirmar el cotejo contra la
  // fotografía oficial antes de continuar.
  if (
    incluyeBiometria() &&
    estado.identidad.origen === "SNIC_BIOMETRICO" &&
    !estado.identidad.identidadConfirmada
  ) {
    errores.identidadConfirmada =
      "Confirme que la persona presente corresponde a la fotografía del Registro Civil.";
  }

  return errores;
}

function validarTipo(estado: EstadoFormulario): Errores {
  const { datos } = estado;
  const errores: Errores = {};
  const reglas = reglasDe(datos.tipoMiembro);

  if (!datos.tipoMiembro) {
    errores.tipoMiembro = "Seleccione el tipo de socio que desea afiliar.";
    return errores;
  }

  if (reglas?.requiereSocioTitular) {
    const apellidos = validarNombre(datos.titularApellidos, "apellido del socio titular");
    if (apellidos) errores.titularApellidos = apellidos;

    const nombres = validarNombre(datos.titularNombres, "nombre del socio titular");
    if (nombres) errores.titularNombres = nombres;

    const cedula = validarCedula(datos.titularCedula);
    if (cedula) errores.titularCedula = cedula;

    if (!datos.titularNumeroSocio.trim()) {
      errores.titularNumeroSocio = "Ingrese el número de socio del titular.";
    }
  }

  // El reverso del formulario exige el número del oficial FAE del que depende.
  if (reglas?.requiereNumeroSocioActivo && !datos.numeroSocioActivo.trim()) {
    errores.numeroSocioActivo =
      "Ingrese el número de socio del oficial FAE del que depende (casilla «Número de Socio Activo» del formulario).";
  }

  return errores;
}

function validarPersonales(estado: EstadoFormulario): Errores {
  const { datos } = estado;
  const errores: Errores = {};
  const reglas = reglasDe(datos.tipoMiembro);

  const apellidos = validarNombre(datos.apellidos, "apellido");
  if (apellidos) errores.apellidos = apellidos;

  const nombres = validarNombre(datos.nombres, "nombre");
  if (nombres) errores.nombres = nombres;

  if (
    reglas?.requiereSocioTitular &&
    datos.titularCedula.trim() &&
    datos.cedula.trim() === datos.titularCedula.trim()
  ) {
    errores.apellidos = "La cédula del solicitante no puede ser la misma del socio titular.";
  }

  // El sexo se pide a todos: consta en el formulario de todas las categorías,
  // viaja al campo Género de SAFI y distingue el Segmento «Padre» de «Madre».
  if (!datos.sexo) {
    errores.sexo = "Indique el sexo del solicitante.";
  }

  const lugarNacimiento = validarObligatorio(
    datos.lugarNacimiento,
    "Ingrese el lugar de nacimiento."
  );
  if (lugarNacimiento) errores.lugarNacimiento = lugarNacimiento;

  if (!datos.fechaNacimiento) {
    errores.fechaNacimiento = "Seleccione la fecha de nacimiento.";
  } else {
    const edad = calcularEdad(datos.fechaNacimiento);
    if (edad === null || edad < 0) errores.fechaNacimiento = "La fecha de nacimiento no es válida.";
    else if (edad > 110) errores.fechaNacimiento = "Verifique la fecha de nacimiento ingresada.";
    else if (reglas?.edadMaxima !== undefined && edad > reglas.edadMaxima) {
      errores.fechaNacimiento = `Este tipo de socio admite hasta ${reglas.edadMaxima} años de edad (edad calculada: ${edad}).`;
    } else if (reglas?.edadMinima !== undefined && edad < reglas.edadMinima) {
      errores.fechaNacimiento = `Este tipo de socio exige al menos ${reglas.edadMinima} años de edad (edad calculada: ${edad}).`;
    }
  }

  const estadoCivil = validarObligatorio(datos.estadoCivil, "Seleccione el estado civil.");
  if (estadoCivil) errores.estadoCivil = estadoCivil;
  else if (reglas?.exigeSoltero && esEstadoCivilCasado(datos.estadoCivil)) {
    errores.estadoCivil = "Este tipo de socio se otorga únicamente a personas solteras.";
  }

  // El R-PGS1-1 pide el tipo de sangre a todas las categorías.
  if (!datos.tipoSangre.trim()) {
    errores.tipoSangre = "Seleccione el tipo de sangre.";
  }

  return errores;
}

function validarContacto(estado: EstadoFormulario): Errores {
  const { datos } = estado;
  const errores: Errores = {};

  // El país viaja al «País (Factura)» del Socio y de la Cuenta en SAFI, que
  // hasta el 15/09/2026 quedaban vacíos porque nadie lo preguntaba.
  const pais = validarObligatorio(datos.pais, "Indique el país del domicilio.");
  if (pais) errores.pais = pais;

  const ciudad = validarObligatorio(datos.ciudad, "Ingrese la ciudad de residencia.");
  if (ciudad) errores.ciudad = ciudad;

  // La provincia viaja al campo «Provincia (Factura)» de la Cuenta de SAFI.
  const provincia = validarObligatorio(datos.provincia, "Seleccione la provincia de residencia.");
  if (provincia) errores.provincia = provincia;

  const direccion = validarObligatorio(datos.direccion, "Ingrese la dirección domiciliaria.");
  if (direccion) errores.direccion = direccion;
  else if (datos.direccion.trim().length < 8) {
    errores.direccion = "Detalle la dirección (calle principal, número y calle secundaria).";
  }

  const celular = validarCelular(datos.celular);
  if (celular) errores.celular = celular;

  const domicilio = validarConvencional(datos.telefonoDomicilio, false);
  if (domicilio) errores.telefonoDomicilio = domicilio;

  const trabajo = validarConvencional(datos.telefonoTrabajo, false);
  if (trabajo) errores.telefonoTrabajo = trabajo;

  const correo = validarCorreo(datos.correo);
  if (correo) errores.correo = correo;

  // La forma de pago ya no se pregunta en la tableta: la elige la Jefatura de
  // Socios en su bandeja, al confirmar el registro junto con la cuota y el
  // grupo de facturación (decisión del Coordinador, 15/09/2026). Se pedía dos
  // veces y ganaba la de la bandeja, así que la de la tableta solo confundía.

  return errores;
}

function validarLaboral(estado: EstadoFormulario): Errores {
  const { datos } = estado;
  const errores: Errores = {};
  const reglas = reglasDe(datos.tipoMiembro);
  if (!reglas) return errores;

  if (reglas.requiereDatosMilitares) {
    const grado = validarObligatorio(datos.gradoMilitar, "Ingrese el grado militar.");
    if (grado) errores.gradoMilitar = grado;

    if (!datos.situacion) errores.situacion = "Indique la situación: activo o pasivo.";
    // La fuerza se pregunta a todo militar. Hasta el 15/09/2026 solo se pedía a
    // los corresponsales B y C, así que la ficha de un Socio Activo —oficial de
    // la FAE— llegaba a SAFI con «NO APLICA» en el campo Fuerza.
    if (!datos.fuerza) {
      errores.fuerza = "Indique la fuerza a la que pertenece.";
    }
  }

  // La promoción es la de la Escuela Superior Militar de Aviación: la tienen los
  // oficiales FAE (fundador y activo) y nadie más. Ver `requierePromocion`.
  if (reglas.requierePromocion) {
    const promocion = validarObligatorio(
      datos.promocion,
      "Ingrese la promoción a la que pertenece el oficial."
    );
    if (promocion) errores.promocion = promocion;
  }

  if (reglas.requiereDatosLaborales) {
    const profesion = validarObligatorio(datos.profesion, "Ingrese la profesión u ocupación.");
    if (profesion) errores.profesion = profesion;
  }

  return errores;
}

function validarFamilia(estado: EstadoFormulario): Errores {
  const { datos } = estado;
  const errores: Errores = {};
  const bloques = bloquesPara(datos.tipoMiembro, datos.estadoCivil);
  if (!bloques) return errores;

  // El recuadro del cónyuge solo aparece en formularios de casados, así que si
  // se llenó parcialmente hay que completarlo; dejarlo vacío no es un error
  // cuando el estado civil no lo exige.
  if (bloques.conyuge && !conyugeEstaVacio(datos.conyuge)) {
    const apellidos = validarNombre(datos.conyuge.apellidos, "apellido del cónyuge");
    if (apellidos) errores.conyugeApellidos = apellidos;

    const nombres = validarNombre(datos.conyuge.nombres, "nombre del cónyuge");
    if (nombres) errores.conyugeNombres = nombres;

    const cedula = validarCedula(datos.conyuge.cedula);
    if (cedula) errores.conyugeCedula = cedula;

    const correo = validarCorreo(datos.conyuge.correo, false);
    if (correo) errores.conyugeCorreo = correo;

    const celular = validarCelular(datos.conyuge.celular, false);
    if (celular) errores.conyugeCelular = celular;
  }

  if (bloques.conyuge && esEstadoCivilCasado(datos.estadoCivil) && conyugeEstaVacio(datos.conyuge)) {
    errores.conyugeApellidos =
      "El formulario de este tipo de socio incluye el recuadro DATOS DEL CÓNYUGE. Complételo.";
  }

  datos.hijos.forEach((hijo, indice) => {
    if (!hijo.apellidosNombres.trim() && !hijo.fechaNacimiento) return;
    if (!hijo.apellidosNombres.trim()) {
      errores[`hijo-${indice}-nombre`] = "Ingrese los apellidos y nombres del hijo.";
    }
    if (!hijo.fechaNacimiento) {
      errores[`hijo-${indice}-fecha`] = "Ingrese la fecha de nacimiento.";
    }
    if (hijo.correo.trim()) {
      const correo = validarCorreo(hijo.correo, false);
      if (correo) errores[`hijo-${indice}-correo`] = correo;
    }
  });

  return errores;
}

function validarGarantes(estado: EstadoFormulario): Errores {
  const { datos } = estado;
  const errores: Errores = {};
  const bloques = bloquesPara(datos.tipoMiembro, datos.estadoCivil);
  if (!bloques || bloques.garantes === 0) return errores;

  datos.garantes.slice(0, bloques.garantes).forEach((garante, indice) => {
    const nombre = validarNombreCompleto(garante.apellidosNombres);
    if (nombre) errores[`garante-${indice}-nombre`] = nombre;

    if (!garante.numeroSocio.trim()) {
      errores[`garante-${indice}-socio`] = "Ingrese el número de socio del garante.";
    }

    const celular = validarCelular(garante.celular);
    if (celular) errores[`garante-${indice}-celular`] = celular;

    const domicilio = validarConvencional(garante.telefonoDomicilio, false);
    if (domicilio) errores[`garante-${indice}-domicilio`] = domicilio;

    if (!garante.firmaUri) {
      errores[`garante-${indice}-firma`] = "Registre la firma del socio garante.";
    }
  });

  const numeros = datos.garantes
    .slice(0, bloques.garantes)
    .map((g) => g.numeroSocio.trim())
    .filter(Boolean);
  if (new Set(numeros).size !== numeros.length) {
    errores["garante-1-socio"] = "Los dos garantes deben ser socios distintos.";
  }

  return errores;
}

function validarCompromiso(estado: EstadoFormulario): Errores {
  const { datos } = estado;
  const errores: Errores = {};
  const carta = datos.carta;
  if (!carta) return errores;

  const nacionalidad = validarObligatorio(carta.nacionalidad, "Ingrese la nacionalidad.");
  if (nacionalidad) errores.nacionalidad = nacionalidad;

  const cuota = Number(carta.cuotaAnual.replace(",", "."));
  if (!carta.cuotaAnual.trim()) {
    errores.cuotaAnual = "Ingrese el valor de la cuota de mantenimiento anual.";
  } else if (!Number.isFinite(cuota) || cuota <= 0) {
    errores.cuotaAnual = "Ingrese un valor numérico válido.";
  }

  // La carta autoriza el débito automático: o cuenta bancaria, o tarjeta.
  const tieneCuenta = Boolean(carta.entidadFinanciera.trim() && carta.numeroCuenta.trim());
  const tieneTarjeta = Boolean(carta.tarjetaCredito.trim());
  if (!tieneCuenta && !tieneTarjeta) {
    errores.entidadFinanciera =
      "La carta autoriza el débito automático: registre una cuenta bancaria o una tarjeta de crédito.";
  }
  if (tieneCuenta && !carta.tipoCuenta) {
    errores.tipoCuenta = "Indique si la cuenta es de ahorros o corriente.";
  }
  if (tieneTarjeta && !carta.caducidadTarjeta.trim()) {
    errores.caducidadTarjeta = "Ingrese la fecha de caducidad de la tarjeta.";
  }

  return errores;
}

function validarConsentimiento(estado: EstadoFormulario): Errores {
  const errores: Errores = {};

  for (const consentimiento of CONSENTIMIENTOS) {
    if (consentimiento.obligatorio && !estado.consentimientos[consentimiento.clave]) {
      errores[consentimiento.clave] = "Debe aceptar esta autorización para continuar.";
    }
  }

  if (!estado.firmaUri) {
    errores.firma = "Registre la firma del solicitante.";
  }

  return errores;
}

const VALIDADORES: Record<ClavePaso, (estado: EstadoFormulario) => Errores> = {
  identificacion: validarIdentificacion,
  tipo: validarTipo,
  personales: validarPersonales,
  contacto: validarContacto,
  laboral: validarLaboral,
  familia: validarFamilia,
  garantes: validarGarantes,
  compromiso: validarCompromiso,
  consentimiento: validarConsentimiento,
  revision: () => ({}),
};

export function validarPaso(paso: ClavePaso, estado: EstadoFormulario): Errores {
  return VALIDADORES[paso](estado);
}

/** Valida todos los pasos aplicables y devuelve el primero con errores. */
export function validarTodo(estado: EstadoFormulario): {
  ok: boolean;
  primerPasoConError: ClavePaso | null;
  errores: Errores;
} {
  for (const paso of pasosPara(estado.datos)) {
    const errores = validarPaso(paso.key, estado);
    if (Object.keys(errores).length > 0) {
      return { ok: false, primerPasoConError: paso.key, errores };
    }
  }
  return { ok: true, primerPasoConError: null, errores: {} };
}
