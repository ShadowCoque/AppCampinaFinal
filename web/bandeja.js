/*
 * Bandeja de tareas del Club La Campiña.
 *
 * JavaScript simple, sin dependencias: la página se sirve desde el mismo
 * servidor que la API y debe abrir en los equipos de Contabilidad y Gerencia
 * sin instalar nada.
 *
 * Cada área ve solo sus tareas. La autorización real la hace el servidor: aquí
 * únicamente se decide qué se dibuja.
 */

"use strict";

const estado = {
  sesion: null,
  bandeja: null,
  vista: "pendientes",
  tareaActiva: null,
  /** Ficha abierta en el diálogo de alta en SAFI. */
  safi: null,
};

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

function escapar(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function api(ruta, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      credentials: "same-origin",
      headers: opciones.body ? { "Content-Type": "application/json" } : {},
      ...opciones,
    });
  } catch {
    // El servidor está detenido o la red interna se cayó.
    throw new Error("No se pudo contactar al servidor. Verifique la conexión e inténtelo de nuevo.");
  }

  if (respuesta.status === 401) {
    estado.sesion = null;
    mostrarAcceso();
    throw new Error("Su sesión expiró. Vuelva a ingresar.");
  }

  const texto = await respuesta.text();

  // Un 502 del proxy inverso devuelve HTML, no JSON: si se intentara analizar
  // sin más, el operador vería «Unexpected token <» en lugar de qué pasó.
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    if (respuesta.ok) throw new Error("El servidor devolvió una respuesta inesperada.");
    throw new Error(`El servidor respondió con un error (${respuesta.status}).`);
  }

  if (!respuesta.ok) {
    throw new Error((datos && datos.error) || `Error ${respuesta.status}`);
  }
  return datos;
}

function avisar(mensaje) {
  const aviso = $("aviso");
  aviso.textContent = mensaje;
  aviso.hidden = false;
  clearTimeout(avisar._temporizador);
  avisar._temporizador = setTimeout(() => {
    aviso.hidden = true;
  }, 4000);
}

/** «hace 3 días» — sirve para ver de un vistazo qué lleva más tiempo parado. */
function antiguedad(iso) {
  const desde = new Date(iso).getTime();
  if (!Number.isFinite(desde)) return { texto: "", dias: 0 };

  const dias = Math.floor((Date.now() - desde) / 86400000);
  if (dias <= 0) {
    const horas = Math.floor((Date.now() - desde) / 3600000);
    return { texto: horas <= 0 ? "hace minutos" : `hace ${horas} h`, dias: 0 };
  }
  return { texto: dias === 1 ? "hace 1 día" : `hace ${dias} días`, dias };
}

function fechaHora(iso) {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "—";
  const dd = String(fecha.getDate()).padStart(2, "0");
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const hh = String(fecha.getHours()).padStart(2, "0");
  const mi = String(fecha.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${fecha.getFullYear()} · ${hh}:${mi}`;
}

/** Tono de la tarjeta según el tipo de tarea. */
const TONO_TAREA = {
  REVISAR: "",
  APROBAR: "gold",
  CORREGIR_OBSERVACION: "warning",
  CONFIRMAR_SAFI: "warning",
  ESCANEO_PENDIENTE: "warning",
  ESCANEO_NO_RECONOCIDO: "danger",
  CARGA_SAFI_PENDIENTE: "warning",
};

const ETIQUETA_TAREA = {
  REVISAR: "Revisar",
  APROBAR: "Aprobar",
  CORREGIR_OBSERVACION: "Con observaciones",
  CONFIRMAR_SAFI: "Falta crear en SAFI",
  ESCANEO_PENDIENTE: "Falta escanear",
  ESCANEO_NO_RECONOCIDO: "Archivo no reconocido",
  CARGA_SAFI_PENDIENTE: "Pendiente en SAFI",
};

/* ------------------------------------------------------------------ */
/* Acceso                                                              */
/* ------------------------------------------------------------------ */

function mostrarAcceso() {
  $("pantalla-acceso").hidden = false;
  $("pantalla-bandeja").hidden = true;
  // Los equipos de Contabilidad y Gerencia son compartidos: al volver a la
  // pantalla de acceso no debe quedar el usuario de quien acaba de salir.
  $("usuario").value = "";
  $("clave").value = "";
  $("usuario").focus();
}

function mostrarBandeja() {
  $("pantalla-acceso").hidden = true;
  $("pantalla-bandeja").hidden = false;
}

$("form-acceso").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const error = $("error-acceso");
  const boton = $("boton-acceso");

  error.hidden = true;
  boton.disabled = true;
  boton.textContent = "Ingresando…";

  try {
    estado.sesion = await api("/api/sesion", {
      method: "POST",
      body: JSON.stringify({ usuario: $("usuario").value, clave: $("clave").value }),
    });
    $("clave").value = "";
    mostrarBandeja();
    await cargarBandeja();
  } catch (fallo) {
    error.textContent = fallo.message;
    error.hidden = false;
  } finally {
    boton.disabled = false;
    boton.textContent = "Ingresar";
  }
});

$("boton-salir").addEventListener("click", async () => {
  await api("/api/sesion", { method: "DELETE" }).catch(() => {});
  estado.sesion = null;
  estado.bandeja = null;
  mostrarAcceso();
});

/* ------------------------------------------------------------------ */
/* Carga y dibujo                                                      */
/* ------------------------------------------------------------------ */

async function cargarBandeja() {
  try {
    estado.bandeja = await api("/api/bandeja");
  } catch (fallo) {
    avisar(fallo.message);
    return;
  }

  const { area, etiquetaArea, accion, pendientes, instructivoEscaneo } = estado.bandeja;

  $("etiqueta-area").textContent = `${etiquetaArea} · ${accion}`;
  $("usuario-activo").textContent = estado.sesion ? estado.sesion.nombre : "";
  document.title = `${etiquetaArea} · Bandeja de tareas`;

  const contador = $("contador-pendientes");
  contador.textContent = String(pendientes.length);
  contador.classList.toggle("cero", pendientes.length === 0);

  $("pestana-ayuda").hidden = !(area === "SOCIOS" && instructivoEscaneo.length > 0);

  dibujarPendientes();
  dibujarAtendidas();
  dibujarAyuda();
}

function dibujarPendientes() {
  const contenedor = $("vista-pendientes");
  const { pendientes, accion } = estado.bandeja;

  if (pendientes.length === 0) {
    contenedor.innerHTML = `<div class="vacio">
      <strong>No hay tareas pendientes</strong>
      Todo lo que le corresponde a su área está al día.
    </div>`;
    return;
  }

  contenedor.innerHTML = pendientes
    .map((tarea) => {
      const tono = TONO_TAREA[tarea.tipo] || "";
      const edad = antiguedad(tarea.desde);
      const resoluble = tarea.tipo === "REVISAR" || tarea.tipo === "APROBAR";

      const identificacion =
        tarea.cedula === "—"
          ? ""
          : `<div class="datos-socio">
               <span>Socio N.º <b>${escapar(tarea.numeroSocio)}</b></span>
               <span>C.I. <b>${escapar(tarea.cedula)}</b></span>
               <span><b>${escapar(tarea.nombreSocio)}</b></span>
               <span>${escapar(tarea.tipoMiembro)}</span>
             </div>`;

      const acciones = [];
      if (resoluble) {
        acciones.push(
          `<button type="button" class="boton primario" data-accion="resolver" data-id="${escapar(tarea.id)}">
             ${tarea.tipo === "REVISAR" ? "Marcar como revisada" : "Aprobar el ingreso"}
           </button>`
        );
      }
      if (tarea.tipo === "ESCANEO_NO_RECONOCIDO") {
        acciones.push(
          `<button type="button" class="boton sutil" data-accion="resolver-incidencia" data-archivo="${escapar(
            tarea.codigo
          )}">Ya lo corregí</button>`
        );
      }
      if (tarea.tipo === "ESCANEO_PENDIENTE") {
        acciones.push(
          `<button type="button" class="boton sutil" data-accion="revisar-carpeta">Revisar carpeta ahora</button>`
        );
      }
      if (tarea.tipo === "CARGA_SAFI_PENDIENTE") {
        acciones.push(
          `<button type="button" class="boton sutil" data-accion="reintentar-safi">Reintentar carga</button>`
        );
      }
      if (tarea.tipo === "CONFIRMAR_SAFI") {
        acciones.push(
          `<button type="button" class="boton primario" data-accion="abrir-safi" data-id="${escapar(
            tarea.solicitudId
          )}">Confirmar y crear en SAFI</button>`
        );
      }

      return `<article class="tarjeta ${tono}">
        <div class="tarjeta-cabecera">
          <div>
            <h3>${escapar(tarea.titulo)}</h3>
            <span class="etiqueta ${tono}">${escapar(ETIQUETA_TAREA[tarea.tipo] || tarea.tipo)}</span>
            ${tarea.codigo && tarea.solicitudId ? `<span class="etiqueta">${escapar(tarea.codigo)}</span>` : ""}
          </div>
          <span class="antiguedad ${edad.dias >= 3 ? "vieja" : ""}">${escapar(edad.texto)}</span>
        </div>
        ${identificacion}
        <p class="detalle">${escapar(tarea.detalle)}</p>
        ${acciones.length ? `<div class="tarjeta-acciones">${acciones.join("")}</div>` : ""}
      </article>`;
    })
    .join("");

  void accion;
}

function dibujarAtendidas() {
  const contenedor = $("vista-atendidas");
  const { atendidas } = estado.bandeja;

  if (atendidas.length === 0) {
    contenedor.innerHTML = `<div class="vacio">
      <strong>Todavía no hay tareas atendidas</strong>
      Aquí aparecerán las afiliaciones en las que ya actuó su área.
    </div>`;
    return;
  }

  const filas = atendidas
    .map((solicitud) => {
      const constancia =
        estado.bandeja.area === "GERENCIA" ? solicitud.aprobacion : solicitud.revision;
      return `<tr>
        <td>${escapar(solicitud.codigo)}</td>
        <td>${escapar(solicitud.numeroSocio || "—")}</td>
        <td>${escapar(solicitud.cedula)}</td>
        <td>${escapar(solicitud.nombre)}</td>
        <td>${constancia ? escapar(fechaHora(constancia.en)) : "—"}</td>
        <td>${constancia ? escapar(constancia.responsable) : "—"}</td>
        <td>${constancia && constancia.numeroFactura ? escapar(constancia.numeroFactura) : "—"}</td>
      </tr>`;
    })
    .join("");

  contenedor.innerHTML = `<div class="tabla-envoltorio">
    <table class="listado">
      <thead><tr>
        <th>Trámite</th><th>Socio N.º</th><th>Cédula</th><th>Nombre</th>
        <th>Atendida</th><th>Responsable</th><th>Factura</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
  </div>`;
}

function dibujarAyuda() {
  const contenedor = $("vista-ayuda");
  const pasos = (estado.bandeja.instructivoEscaneo || [])
    .map((paso) => `<li>${escapar(paso).replace(/«([^»]+)»/g, "<code>$1</code>")}</li>`)
    .join("");

  contenedor.innerHTML = `<div class="instructivo">
    <h2>Cómo nombrar los documentos escaneados</h2>
    <p>El sistema archiva solo lo que puede identificar sin ambigüedad. Lo que no reconoce se
       traslada a <code>_REVISAR</code> y aparece en esta bandeja: nunca se borra ni se archiva
       en el expediente equivocado.</p>
    <ol>${pasos}</ol>

    <div class="comprobador">
      <h2>Comprobar un nombre antes de escanear</h2>
      <div class="comprobador-fila">
        <div style="flex:1">
          <label for="nombre-prueba">Nombre del archivo</label>
          <input id="nombre-prueba" type="text" placeholder="280 COQUE VEGA JOEL SEBASTIAN CEDULA.pdf" />
        </div>
        <button type="button" class="boton primario" data-accion="comprobar">Comprobar</button>
      </div>
      <div id="resultado-comprobacion"></div>
    </div>

    <div class="comprobador">
      <h2>Conexión con el CRM de SAFI</h2>
      <p>Comprueba paso a paso la conexión y dice en cuál falla, si falla.</p>
      <button type="button" class="boton primario" data-accion="diagnostico-safi">
        Comprobar la conexión
      </button>
      <div id="resultado-diagnostico"></div>
    </div>
  </div>`;
}

/**
 * Diagnóstico de la conexión con SAFI.
 *
 * Un saludo que no responde admite media docena de causas —puerto, ruta,
 * usuario, servicio web deshabilitado— y desde fuera todas se parecen: la
 * petición simplemente no devuelve nada. Cada paso descarta una.
 */
async function diagnosticarSafi() {
  const contenedor = $("resultado-diagnostico");
  const resultado = await api("/api/safi/diagnostico");

  const filas = resultado.pasos
    .map(
      (paso) => `<div class="resultado-comprobacion ${paso.ok ? "ok" : "no"}">
        <strong>${escapar(paso.paso)}</strong> ${escapar(paso.detalle)}
      </div>`
    )
    .join("");

  contenedor.innerHTML = `<p class="pista">Modo de integración: <code>${escapar(
    resultado.modo
  )}</code></p>${filas}`;
}

/* ------------------------------------------------------------------ */
/* Pestañas                                                            */
/* ------------------------------------------------------------------ */

document.querySelectorAll(".pestana").forEach((pestana) => {
  pestana.addEventListener("click", () => {
    estado.vista = pestana.dataset.vista;
    document.querySelectorAll(".pestana").forEach((otra) => {
      const activa = otra === pestana;
      otra.classList.toggle("activa", activa);
      otra.setAttribute("aria-selected", String(activa));
    });
    for (const nombre of ["pendientes", "atendidas", "ayuda"]) {
      $(`vista-${nombre}`).hidden = nombre !== estado.vista;
    }
  });
});

$("boton-actualizar").addEventListener("click", () => void cargarBandeja());

document.addEventListener("keydown", (evento) => {
  if (evento.key.toLowerCase() === "r" && !/^(INPUT|TEXTAREA)$/.test(evento.target.tagName)) {
    void cargarBandeja();
  }
});

/* ------------------------------------------------------------------ */
/* Acciones sobre las tarjetas                                         */
/* ------------------------------------------------------------------ */

document.addEventListener("click", async (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;

  const accion = boton.dataset.accion;

  if (accion === "resolver") {
    const tarea = estado.bandeja.pendientes.find((t) => t.id === boton.dataset.id);
    if (tarea) abrirDialogo(tarea);
    return;
  }

  if (accion === "abrir-safi") {
    boton.disabled = true;
    try {
      await abrirDialogoSafi(boton.dataset.id);
    } catch (fallo) {
      avisar(fallo.message);
    } finally {
      boton.disabled = false;
    }
    return;
  }

  boton.disabled = true;
  try {
    if (accion === "resolver-incidencia") {
      await api(`/api/escaneos/incidencias/${encodeURIComponent(boton.dataset.archivo)}/resolver`, {
        method: "POST",
      });
      avisar("Incidencia cerrada.");
      await cargarBandeja();
    } else if (accion === "revisar-carpeta") {
      const resumen = await api("/api/escaneos/revisar", { method: "POST" });
      avisar(
        `Carpeta revisada: ${resumen.archivados} archivados, ${resumen.incidencias} con problemas.`
      );
      await cargarBandeja();
    } else if (accion === "reintentar-safi") {
      const resumen = await api("/api/safi/reintentar", { method: "POST" });
      avisar(`Publicados en SAFI: ${resumen.publicados}. Pendientes: ${resumen.pendientes}.`);
      await cargarBandeja();
    } else if (accion === "comprobar") {
      await comprobarNombre();
    } else if (accion === "diagnostico-safi") {
      await diagnosticarSafi();
    }
  } catch (fallo) {
    avisar(fallo.message);
  } finally {
    boton.disabled = false;
  }
});

async function comprobarNombre() {
  const nombre = $("nombre-prueba").value.trim();
  const contenedor = $("resultado-comprobacion");
  if (!nombre) {
    contenedor.innerHTML = "";
    return;
  }

  const resultado = await api(`/api/escaneos/comprobar?nombre=${encodeURIComponent(nombre)}`);

  if (resultado.ok) {
    const dependiente =
      resultado.clave.ordinalDependiente !== null
        ? `dependiente N.º ${resultado.clave.ordinalDependiente} del socio ${resultado.clave.numeroSocio}`
        : `socio titular N.º ${resultado.clave.numeroSocio}`;
    contenedor.innerHTML = `<div class="resultado-comprobacion ok">
      <strong>Nombre correcto.</strong> Se archivará como documento de tipo
      <code>${escapar(resultado.tipo)}</code> del ${escapar(dependiente)}, a nombre de
      <b>${escapar(resultado.clave.apellidosNombres)}</b>.
      ${
        resultado.seNormalizo
          ? `<br/>Se guardará como <code>${escapar(resultado.nombreCanonico)}</code>.`
          : ""
      }
    </div>`;
  } else {
    contenedor.innerHTML = `<div class="resultado-comprobacion no">
      <strong>No se puede archivar.</strong> ${escapar(resultado.detalle)}
    </div>`;
  }
}

/* ------------------------------------------------------------------ */
/* Diálogo de resolución                                               */
/* ------------------------------------------------------------------ */

const dialogo = $("dialogo-tarea");

function abrirDialogo(tarea) {
  estado.tareaActiva = tarea;

  const esRevision = tarea.tipo === "REVISAR";
  $("dialogo-titulo").textContent = esRevision
    ? "Marcar la afiliación como revisada"
    : "Aprobar el ingreso del socio";
  $("dialogo-detalle").textContent = `${tarea.codigo} · ${tarea.nombreSocio} · C.I. ${tarea.cedula}`;

  $("campo-factura").hidden = !esRevision;
  $("numero-factura").value = "";
  $("observacion").value = "";
  $("error-dialogo").hidden = true;
  $("boton-confirmar").textContent = esRevision ? "Marcar revisada" : "Aprobar";

  dialogo.showModal();
  (esRevision ? $("numero-factura") : $("observacion")).focus();
}

$("boton-cancelar").addEventListener("click", () => dialogo.close());

$("boton-confirmar").addEventListener("click", async () => {
  const tarea = estado.tareaActiva;
  if (!tarea) return;

  const ruta = tarea.tipo === "REVISAR" ? "revisar" : "aprobar";
  await enviarAccion(ruta, {
    numeroFactura: $("numero-factura").value.trim(),
    observacion: $("observacion").value.trim(),
  });
});

$("boton-observar").addEventListener("click", async () => {
  const observacion = $("observacion").value.trim();
  if (observacion.length < 10) {
    const error = $("error-dialogo");
    error.textContent =
      "Escriba la observación: es lo que el Área de Socios verá para corregir el trámite.";
    error.hidden = false;
    $("observacion").focus();
    return;
  }
  await enviarAccion("observar", { observacion });
});

async function enviarAccion(ruta, cuerpo) {
  const tarea = estado.tareaActiva;
  const botones = [$("boton-confirmar"), $("boton-observar"), $("boton-cancelar")];
  botones.forEach((b) => (b.disabled = true));

  try {
    await api(`/api/solicitudes/${encodeURIComponent(tarea.solicitudId)}/${ruta}`, {
      method: "POST",
      body: JSON.stringify(cuerpo),
    });
    dialogo.close();
    avisar(
      ruta === "observar"
        ? "Trámite devuelto al Área de Socios."
        : `${tarea.codigo} actualizado.`
    );
    await cargarBandeja();
  } catch (fallo) {
    const error = $("error-dialogo");
    error.textContent = fallo.message;
    error.hidden = false;
  } finally {
    botones.forEach((b) => (b.disabled = false));
  }
}

/* ------------------------------------------------------------------ */
/* Confirmación del alta en el CRM de SAFI                             */
/* ------------------------------------------------------------------ */

const dialogoSafi = $("dialogo-safi");

/** Selectores del diálogo, emparejados con las claves de la confirmación. */
const CAMPOS_SAFI = {
  grupoFacturacion: "safi-grupo",
  formaPago: "safi-forma-pago",
  tipoContribuyente: "safi-contribuyente",
  suscripcion: "safi-suscripcion",
  valorMembresia: "safi-membresia",
  cuotaAnual: "safi-cuota-anual",
  cuotaMensual: "safi-cuota-mensual",
};

/**
 * Llena un desplegable con las opciones que SAFI admite.
 *
 * Si el valor propuesto por el tarifario del Club no está entre ellas, se añade
 * igualmente y se marca: es el caso del Corresponsal A, cuyos importes todavía
 * no existen en el CRM. Ocultarlo obligaría a elegir una cuota que no es la del
 * socio; mostrarlo deja ver exactamente qué hay que añadir en SAFI.
 */
function llenarSelect(id, opciones, valor, { vacio = "— sin valor —" } = {}) {
  const select = $(id);
  const lista = [...opciones];
  const fueraDeLista = valor && !lista.some((o) => String(o) === String(valor));
  if (fueraDeLista) lista.push(valor);

  select.innerHTML =
    `<option value="">${escapar(vacio)}</option>` +
    lista
      .map((opcion) => {
        const sel = String(opcion) === String(valor) ? " selected" : "";
        const marca = fueraDeLista && String(opcion) === String(valor) ? " (no existe en SAFI)" : "";
        return `<option value="${escapar(opcion)}"${sel}>${escapar(opcion)}${marca}</option>`;
      })
      .join("");
}

async function abrirDialogoSafi(solicitudId) {
  const ficha = await api(`/api/solicitudes/${encodeURIComponent(solicitudId)}/safi`);
  estado.safi = { solicitudId, ficha };

  $("safi-detalle").textContent =
    `${ficha.codigo} · ${ficha.nombreSocio} · C.I. ${ficha.cedula} · ${ficha.tipoMiembro}`;

  // Un dependiente no abre Cuenta propia: se cuelga de la de su titular, igual
  // que su documentación va a la carpeta del titular en el repositorio.
  const contexto = $("safi-contexto");
  if (ficha.esTitular) {
    contexto.textContent =
      "Es socio titular: se creará su Cuenta y su ficha de Socio, con Secuencia 00.";
    contexto.className = "nota-safi";
  } else if (ficha.cuentaTitular) {
    contexto.textContent =
      `Depende de ${ficha.nombreTitular} (socio N.º ${ficha.numeroSocio}). Se creará solo su ficha ` +
      `de Socio, colgada de la Cuenta ${ficha.cuentaTitular} del titular.`;
    contexto.className = "nota-safi";
  } else {
    contexto.textContent =
      `No se conoce la Cuenta de SAFI del titular ${ficha.nombreTitular} (socio N.º ` +
      `${ficha.numeroSocio}). Cree primero al titular para que sus dependientes se cuelguen de la ` +
      "misma Cuenta.";
    contexto.className = "nota-safi peligro";
  }

  // Sin integración habilitada el alta la hace una persona en el CRM y
  // transcribe aquí los identificadores que SAFI le asignó.
  const manual = ficha.modo === "MANUAL";
  $("safi-campo-manual").hidden = !manual;
  $("safi-cuenta-id").value = ficha.cuentaTitular || "";
  $("safi-socio-id").value = "";
  $("safi-confirmar").textContent = manual
    ? "Guardar y registrar el alta"
    : "Confirmar y crear en SAFI";

  $("safi-numero-socio").value = ficha.numeroSocio || "";
  // En un dependiente el número es el del titular y no se toca aquí.
  $("safi-numero-socio").readOnly = !ficha.esTitular;
  $("safi-campo-ordinal").hidden = ficha.esTitular;
  $("safi-ordinal").value = ficha.ordinalDependiente ?? "";
  $("safi-pista-ordinal").textContent = ficha.esTitular
    ? ""
    : `Quedará como «${ficha.numeroSocio}-${ficha.ordinalDependiente}» en el expediente.`;

  // Un dependiente se cuelga de la Cuenta de su titular, que ya tiene resueltos
  // los campos de facturación; y si no paga cuota propia, tampoco hay nada que
  // confirmar sobre cuotas.
  $("safi-grupo-cuenta").hidden = !ficha.esTitular;
  $("safi-grupo-cuotas").hidden = !ficha.pagaCuota;

  $("safi-valor-cuota").value = ficha.propuesta.valorCuota || "";

  llenarSelect(CAMPOS_SAFI.grupoFacturacion, ficha.listas.grupoFacturacion, ficha.propuesta.grupoFacturacion);
  llenarSelect(CAMPOS_SAFI.formaPago, ficha.listas.formaPago, ficha.propuesta.formaPago);
  llenarSelect(CAMPOS_SAFI.tipoContribuyente, ficha.listas.tipoContribuyente, ficha.propuesta.tipoContribuyente);
  llenarSelect(CAMPOS_SAFI.suscripcion, ficha.listas.suscripcion, ficha.propuesta.suscripcion);
  llenarSelect(CAMPOS_SAFI.valorMembresia, ficha.listas.valorMembresia, ficha.propuesta.valorMembresia);
  llenarSelect(CAMPOS_SAFI.cuotaAnual, ficha.listas.cuotaAnual, ficha.propuesta.cuotaAnual, {
    vacio: "— no se acoge a la anual —",
  });
  llenarSelect(CAMPOS_SAFI.cuotaMensual, ficha.listas.cuotaMensual, ficha.propuesta.cuotaMensual, {
    vacio: "— no se acoge a la mensual —",
  });

  dibujarAvisosSafi(ficha.avisos);
  $("error-safi").hidden = true;
  dialogoSafi.showModal();
}

function dibujarAvisosSafi(avisos) {
  const contenedor = $("safi-avisos");
  if (!avisos || avisos.length === 0) {
    contenedor.innerHTML = "";
    return;
  }

  contenedor.innerHTML = avisos
    .map(
      (aviso) => `<div class="aviso-safi ${aviso.bloquea ? "bloquea" : ""}">
        <strong>${escapar(aviso.etiqueta)}</strong>
        ${escapar(aviso.mensaje)}
      </div>`
    )
    .join("");
}

// Las dos cuotas son excluyentes: al fijar una se vacía la otra, para que la
// ficha no acabe declarando dos cobros distintos.
$(CAMPOS_SAFI.cuotaAnual).addEventListener("change", (evento) => {
  if (evento.target.value) $(CAMPOS_SAFI.cuotaMensual).value = "";
});
$(CAMPOS_SAFI.cuotaMensual).addEventListener("change", (evento) => {
  if (evento.target.value) $(CAMPOS_SAFI.cuotaAnual).value = "";
});

$("safi-cancelar").addEventListener("click", () => dialogoSafi.close());

$("safi-confirmar").addEventListener("click", async () => {
  if (!estado.safi) return;

  const boton = $("safi-confirmar");
  const error = $("error-safi");
  boton.disabled = true;
  error.hidden = true;

  const confirmacion = { valorCuota: $("safi-valor-cuota").value.trim() };
  for (const [clave, id] of Object.entries(CAMPOS_SAFI)) confirmacion[clave] = $(id).value;

  try {
    const resultado = await api(
      `/api/solicitudes/${encodeURIComponent(estado.safi.solicitudId)}/safi`,
      {
        method: "POST",
        body: JSON.stringify({
          numeroSocio: $("safi-numero-socio").value.trim(),
          ordinalDependiente: estado.safi.ficha.esTitular ? null : $("safi-ordinal").value,
          confirmacion,
          cuentaSafiId: $("safi-cuenta-id").value.trim(),
          socioSafiId: $("safi-socio-id").value.trim(),
        }),
      }
    );

    dialogoSafi.close();
    avisar(resultado.mensaje);
    await cargarBandeja();
  } catch (fallo) {
    error.textContent = fallo.message;
    error.hidden = false;
  } finally {
    boton.disabled = false;
  }
});

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

(async function iniciar() {
  try {
    estado.sesion = await api("/api/sesion");
    mostrarBandeja();
    await cargarBandeja();
  } catch {
    mostrarAcceso();
  }

  // Refresco periódico: la bandeja debe reflejar lo que otras áreas resuelven.
  // No se recarga con un diálogo abierto: redibujar por debajo perdería lo que
  // se esté escribiendo en él.
  setInterval(() => {
    if (estado.sesion && !dialogo.open && !dialogoSafi.open) void cargarBandeja();
  }, 60000);
})();
