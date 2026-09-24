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
  /** Expediente abierto. */
  expediente: null,
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
      // Solo el JSON lleva cabecera propia: a un FormData la pone el navegador,
      // con el separador del multipart. Fijarla a mano rompe la subida.
      headers: typeof opciones.body === "string" ? { "Content-Type": "application/json" } : {},
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
    const fallo = new Error((datos && datos.error) || `Error ${respuesta.status}`);
    // Quien llama puede necesitar el detalle: el panel de SAFI, por ejemplo,
    // se vuelve a abrir si el trámite cambió mientras estaba abierto.
    fallo.estado = respuesta.status;
    fallo.datos = datos;
    throw fallo;
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
  }, 5000);
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

/**
 * Fecha y hora en hora del Ecuador (UTC−5 fija, sin horario de verano), sea
 * cual sea la zona del equipo que abre la bandeja: la misma que imprime el
 * reverso del formulario.
 */
function fechaHora(iso) {
  const instante = new Date(iso).getTime();
  if (Number.isNaN(instante)) return "—";
  const fecha = new Date(instante - 5 * 60 * 60 * 1000);
  const dd = String(fecha.getUTCDate()).padStart(2, "0");
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(fecha.getUTCHours()).padStart(2, "0");
  const mi = String(fecha.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${fecha.getUTCFullYear()} · ${hh}:${mi}`;
}

const NOMBRE_AREA = {
  SOCIOS: "el Área de Socios",
  CONTABILIDAD: "Contabilidad",
  GERENCIA: "la Gerencia",
};

function tamano(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Tono de la tarjeta según el tipo de tarea. */
const TONO_TAREA = {
  REVISAR: "",
  APROBAR: "gold",
  CORREGIR_OBSERVACION: "warning",
  CONFIRMAR_SAFI: "warning",
  ADJUNTOS_PENDIENTES: "danger",
  ESCANEO_PENDIENTE: "warning",
  ESCANEO_NO_RECONOCIDO: "danger",
  ESCANEO_EN_ESPERA: "warning",
  FORMULARIO_FINAL_PENDIENTE: "danger",
  CARGA_SAFI_PENDIENTE: "warning",
};

const ETIQUETA_TAREA = {
  REVISAR: "Revisar",
  APROBAR: "Aprobar",
  CORREGIR_OBSERVACION: "Con observaciones",
  CONFIRMAR_SAFI: "Falta crear en SAFI",
  ADJUNTOS_PENDIENTES: "Faltan archivos de la tableta",
  ESCANEO_PENDIENTE: "Falta escanear",
  ESCANEO_NO_RECONOCIDO: "Archivo no reconocido",
  ESCANEO_EN_ESPERA: "Archivo en espera",
  FORMULARIO_FINAL_PENDIENTE: "Falta el formulario final",
  CARGA_SAFI_PENDIENTE: "Pendiente en SAFI",
};

/** Nombre de cada área, para las observaciones del trámite. */
const ETIQUETA_AREA = {
  SOCIOS: "Área de Socios",
  CONTABILIDAD: "Contabilidad",
  GERENCIA: "Gerencia",
};

const ETIQUETA_ESTADO = {
  BORRADOR: "Borrador",
  REGISTRADA: "Registrada",
  REVISADA: "Revisada",
  APROBADA: "Aprobada",
  OBSERVADA: "Con observaciones",
  RECHAZADA: "Anulada",
};

const TONO_ESTADO = {
  BORRADOR: "",
  REGISTRADA: "",
  REVISADA: "gold",
  APROBADA: "success",
  OBSERVADA: "warning",
  RECHAZADA: "danger",
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

  const { area, etiquetaArea, accion, pendientes, enCamino, instructivoEscaneo } = estado.bandeja;

  $("etiqueta-area").textContent = etiquetaArea;
  $("accion-area").textContent = accion;
  $("usuario-activo").textContent = estado.sesion ? estado.sesion.nombre : "";
  document.title = `${etiquetaArea} · Bandeja de tareas`;

  const contador = $("contador-pendientes");
  contador.textContent = String(pendientes.length);
  contador.classList.toggle("cero", pendientes.length === 0);

  const camino = enCamino || [];
  $("pestana-camino").hidden = camino.length === 0;
  $("contador-camino").textContent = String(camino.length);

  $("pestana-ayuda").hidden = !(area === "SOCIOS" && instructivoEscaneo.length > 0);

  dibujarPendientes();
  dibujarEnCamino();
  dibujarAtendidas();
  dibujarAyuda();
  dibujarPie();
}

function identificacion(tarea) {
  if (tarea.cedula === "—") return "";
  return `<div class="datos-socio">
    <span>Socio N.º <b>${escapar(tarea.numeroSocio)}</b></span>
    <span>C.I. <b>${escapar(tarea.cedula)}</b></span>
    <span><b>${escapar(tarea.nombreSocio)}</b></span>
    <span>${escapar(tarea.tipoMiembro)}</span>
  </div>`;
}

function dibujarPendientes() {
  const contenedor = $("vista-pendientes");
  const { pendientes } = estado.bandeja;

  if (pendientes.length === 0) {
    contenedor.innerHTML = `<div class="vacio">
      <strong>No hay tareas pendientes</strong>
      Todo lo que le corresponde a su área está al día.
    </div>`;
    return;
  }

  contenedor.innerHTML = pendientes
    .map((tarea) => {
      const tono = TONO_TAREA[tarea.tipo] ?? "";
      const edad = antiguedad(tarea.desde);
      const acciones = [];

      if (tarea.solicitudId) {
        acciones.push(
          `<button type="button" class="boton sutil" data-accion="ver-expediente" data-id="${escapar(
            tarea.solicitudId
          )}">Ver expediente</button>`
        );
      }
      acciones.push(...botonesDeSalidas(tarea));

      const archivos =
        tarea.archivosEsperados && tarea.archivosEsperados.length > 0
          ? `<ul class="archivos-esperados">${tarea.archivosEsperados
              .map((nombre) => `<li>${escapar(nombre)}</li>`)
              .join("")}</ul>`
          : "";

      return `<article class="tarjeta ${tono}">
        <div class="tarjeta-cabecera">
          <div>
            <h3>${escapar(tarea.titulo)}</h3>
            <span class="etiqueta ${tono}">${escapar(ETIQUETA_TAREA[tarea.tipo] ?? tarea.tipo)}</span>
            ${tarea.codigo && tarea.solicitudId ? `<span class="etiqueta">${escapar(tarea.codigo)}</span>` : ""}
          </div>
          <span class="antiguedad ${edad.dias >= 3 ? "vieja" : ""}">${escapar(edad.texto)}</span>
        </div>
        ${identificacion(tarea)}
        ${tarea.instruccion ? `<p class="instruccion">${escapar(tarea.instruccion)}</p>` : ""}
        <p class="detalle">${escapar(tarea.detalle)}</p>
        ${archivos}
        ${acciones.length ? `<div class="tarjeta-acciones">${acciones.join("")}</div>` : ""}
      </article>`;
    })
    .join("");
}

/**
 * Lo que viene hacia esta área pero todavía está en manos de otra.
 *
 * Sin esta lista, una bandeja vacía no distingue «no hay nada» de «algo se
 * quedó atascado antes de llegarme», que es exactamente lo que pasó en las
 * primeras pruebas: la afiliación existía en la tableta y Contabilidad no
 * tenía forma de saberlo.
 */
function dibujarEnCamino() {
  const contenedor = $("vista-camino");
  const lista = estado.bandeja.enCamino || [];
  const area = estado.bandeja.area;

  if (lista.length === 0) {
    contenedor.innerHTML = `<div class="vacio">
      <strong>No hay afiliaciones en camino</strong>
      Aquí aparecen las que otras áreas están tramitando antes de llegarle a la suya.
    </div>`;
    return;
  }

  const explicacion =
    area === "CONTABILIDAD"
      ? "Estas afiliaciones están registradas, pero el Área de Socios todavía no ha creado al socio en el CRM de SAFI. Le llegarán para revisar en cuanto lo haga."
      : "Estas afiliaciones aún no han pasado por Contabilidad. Le llegarán para aprobar en cuanto la revisen.";

  const filas = lista
    .map(
      (solicitud) => `<tr>
        <td>${escapar(solicitud.codigo)}</td>
        <td>${escapar(solicitud.numeroSocio || "—")}</td>
        <td>${escapar(solicitud.cedula)}</td>
        <td>${escapar(solicitud.nombre)}</td>
        <td>${escapar(solicitud.tipoMiembro)}</td>
        <td>${escapar(ETIQUETA_ESTADO[solicitud.estado] ?? solicitud.estado)}</td>
        <td>${escapar(fechaHora(solicitud.creadaEn))}</td>
        <td><button type="button" class="boton sutil" data-accion="ver-expediente" data-id="${escapar(
          solicitud.id
        )}">Ver</button></td>
      </tr>`
    )
    .join("");

  contenedor.innerHTML = `<p class="detalle">${escapar(explicacion)}</p>
    <div class="tabla-envoltorio">
      <table class="listado">
        <thead><tr>
          <th>Trámite</th><th>Socio N.º</th><th>Cédula</th><th>Nombre</th>
          <th>Tipo</th><th>Estado</th><th>Registrada</th><th></th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
}

function dibujarAtendidas() {
  const contenedor = $("vista-atendidas");
  const { atendidas, area } = estado.bandeja;

  if (atendidas.length === 0) {
    contenedor.innerHTML = `<div class="vacio">
      <strong>Todavía no hay tareas atendidas</strong>
      Aquí aparecerán las afiliaciones en las que ya actuó su área.
    </div>`;
    return;
  }

  const filas = atendidas
    .map((solicitud) => {
      const constancia = area === "GERENCIA" ? solicitud.aprobacion : solicitud.revision;
      return `<tr>
        <td>${escapar(solicitud.codigo)}</td>
        <td>${escapar(solicitud.numeroSocio || "—")}</td>
        <td>${escapar(solicitud.cedula)}</td>
        <td>${escapar(solicitud.nombre)}</td>
        <td><span class="etiqueta ${TONO_ESTADO[solicitud.estado] ?? ""}">${escapar(
          ETIQUETA_ESTADO[solicitud.estado] ?? solicitud.estado
        )}</span></td>
        <td>${constancia ? escapar(fechaHora(constancia.en)) : "—"}</td>
        <td>${constancia ? escapar(constancia.responsable) : "—"}</td>
        ${area === "CONTABILIDAD" ? `<td>${constancia && constancia.numeroFactura ? escapar(constancia.numeroFactura) : "—"}</td>` : ""}
        <td><button type="button" class="boton sutil" data-accion="ver-expediente" data-id="${escapar(
          solicitud.id
        )}">Ver</button></td>
      </tr>`;
    })
    .join("");

  contenedor.innerHTML = `<div class="tabla-envoltorio">
    <table class="listado">
      <thead><tr>
        <th>Trámite</th><th>Socio N.º</th><th>Cédula</th><th>Nombre</th><th>Estado</th>
        <th>Atendida</th><th>Responsable</th>${area === "CONTABILIDAD" ? "<th>Factura</th>" : ""}<th></th>
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
    <p>El sistema archiva solo lo que puede identificar sin ambigüedad, y no borra nada de la
       carpeta compartida: lo archivado pasa a <code>_ARCHIVADOS</code>, lo que no reconoce a
       <code>_REVISAR</code>, y lo que espera su trámite se queda donde está. Todo lo que no se
       archiva aparece en esta bandeja.</p>
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
      <p>Comprueba paso a paso la conexión, la lectura de los módulos y si la escritura está
         habilitada. No crea nada en el CRM.</p>
      <button type="button" class="boton primario" data-accion="diagnostico-safi">
        Comprobar la conexión
      </button>
      <div id="resultado-diagnostico"></div>
    </div>
  </div>`;
}

function dibujarPie() {
  const sistema = estado.bandeja.sistema || {};
  const partes = [
    `<span class="marca-pie">Club Social y Deportivo de Oficiales de la FAE · Coordinación de TICs</span>`,
  ];

  if (estado.bandeja.area === "SOCIOS") {
    partes.push(
      `<span>CRM de SAFI: <b>${escapar(sistema.safiModo ?? "—")}</b>${
        sistema.safiModo !== "MANUAL" ? (sistema.safiEscritura ? " · escritura habilitada" : " · solo lectura") : ""
      }</span>`,
      `<span>Vigilancia de escaneos: <b>${sistema.vigilanciaActiva ? "activa" : "inactiva"}</b></span>`,
      `<span>Formulario en PDF: <b>${sistema.pdfDisponible ? "disponible" : "no disponible"}</b></span>`
    );
  }

  $("pie-sistema").innerHTML = partes.join("");
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
  contenedor.innerHTML = `<p class="pista">Comprobando…</p>`;
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
  )}</code> · escritura: <code>${resultado.escritura ? "habilitada" : "deshabilitada"}</code></p>${filas}`;
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
    for (const nombre of ["pendientes", "camino", "atendidas", "ayuda"]) {
      $(`vista-${nombre}`).hidden = nombre !== estado.vista;
    }
  });
});

$("boton-actualizar").addEventListener("click", () => void cargarBandeja());

document.addEventListener("keydown", (evento) => {
  if (evento.key.toLowerCase() === "r" && !/^(INPUT|TEXTAREA)$/.test(evento.target.tagName)) {
    if (!hayDialogoAbierto()) void cargarBandeja();
  }
});

function hayDialogoAbierto() {
  return document.querySelector("dialog[open]") !== null;
}

/* ------------------------------------------------------------------ */
/* Salidas de las tareas                                               */
/* ------------------------------------------------------------------ */

/** Peso que declara el dominio → clase del botón. */
const CLASE_PESO = { principal: "primario", secundaria: "sutil", destructiva: "peligro" };

/**
 * Salidas que se ejercen sobre una pieza concreta (una firma, un
 * documento por escanear). Se dibuja un botón por pieza pendiente.
 */
const SALIDAS_POR_PIEZA = new Set([
  "subir-adjunto",
  "omitir-adjunto",
  "subir-escaneo",
  "omitir-escaneo",
]);

/**
 * Dibuja un botón por cada salida que declara la tarea.
 *
 * Las salidas las decide el dominio (`TAREA_META`), no este archivo: una tarea
 * nueva llega con sus botones puestos y ninguna puede aparecer sin forma de
 * resolverse. Si alguna llegara sin acción programada aquí, el botón se dibuja
 * deshabilitado y lo dice —antes desaparecía en silencio y el trámite se
 * quedaba atascado sin que nadie supiera por qué.
 */
function botonesDeSalidas(tarea) {
  const botones = [];

  for (const salida of tarea.salidas || []) {
    const clase = CLASE_PESO[salida.peso] || "sutil";
    const conocida = ACCIONES_CONOCIDAS.has(salida.clave);
    const porPieza = SALIDAS_POR_PIEZA.has(salida.clave);
    const piezas = porPieza ? tarea.pendientes || [] : [null];

    for (const pieza of piezas) {
      const etiqueta =
        pieza && piezas.length > 1 ? `${salida.etiqueta}: ${pieza.etiqueta}` : salida.etiqueta;
      const titulo = conocida
        ? ""
        : "Esta bandeja no tiene programada esta acción. Avise a Soporte TIC.";

      botones.push(`<button type="button" class="boton ${clase}"${conocida ? "" : " disabled"}
        data-accion="${escapar(salida.clave)}"
        data-id="${escapar(tarea.solicitudId || "")}"
        data-archivo="${escapar(tarea.solicitudId ? "" : tarea.codigo)}"
        data-clave="${escapar(pieza ? pieza.clave : "")}"
        data-etiqueta="${escapar(pieza ? pieza.etiqueta : salida.etiqueta)}"
        title="${escapar(titulo)}">${escapar(etiqueta)}</button>`);
    }
  }

  return botones;
}

/**
 * Pide un archivo al operador sin dejar un `input` permanente en la página.
 *
 * Si cancela el diálogo del sistema no llega ningún evento, así que se resuelve
 * también al recuperar el foco: sin eso la promesa quedaría colgada y el botón
 * deshabilitado para siempre.
 */
function pedirArchivo(aceptados) {
  return new Promise((resolver) => {
    const entrada = document.createElement("input");
    entrada.type = "file";
    entrada.accept = aceptados;
    entrada.style.display = "none";
    document.body.appendChild(entrada);

    let resuelto = false;
    const terminar = (archivo) => {
      if (resuelto) return;
      resuelto = true;
      entrada.remove();
      resolver(archivo);
    };

    entrada.addEventListener("change", () => terminar(entrada.files && entrada.files[0]), {
      once: true,
    });
    window.addEventListener(
      "focus",
      () => setTimeout(() => terminar(entrada.files && entrada.files[0]), 500),
      { once: true }
    );
    entrada.click();
  });
}

/** Sube un archivo por multipart, con los campos que acompañan al formulario. */
async function subirArchivo(ruta, archivo, campos = {}) {
  const formulario = new FormData();
  for (const [clave, valor] of Object.entries(campos)) formulario.append(clave, valor);
  formulario.append("archivo", archivo, archivo.name);
  return api(ruta, { method: "POST", body: formulario });
}

/**
 * Asigna a mano un escaneo a un trámite, cuando su nombre no permitió deducirlo.
 *
 * Solo se ofrecen los trámites que ya tienen número de socio: sin número no hay
 * carpeta de expediente donde archivar.
 */
async function abrirAsignacion(nombreArchivo) {
  const solicitudes = await api("/api/solicitudes");
  const candidatas = solicitudes.filter((s) => s.numeroSocio && s.estado !== "RECHAZADA");

  if (candidatas.length === 0) {
    avisar(
      "Ningún trámite tiene número de socio todavía: créelo primero en SAFI y vuelva a intentarlo."
    );
    return;
  }

  const documentos = estado.bandeja.catalogoDocumentos || [];
  const porTramite = estado.bandeja.documentosPorTramite || {};

  /** Los tipos que caben en ese trámite; si no se sabe, todos. */
  const documentosDe = (solicitudId) => {
    const permitidos = porTramite[solicitudId];
    if (!permitidos || permitidos.length === 0) return documentos;
    return documentos.filter((d) => permitidos.includes(d.tipo));
  };
  const opcionesDeTipo = (solicitudId) =>
    documentosDe(solicitudId)
      .map((d) => `<option value="${escapar(d.tipo)}">${escapar(d.nombre)}</option>`)
      .join("");

  const dialogo = document.createElement("dialog");
  dialogo.className = "dialogo";
  dialogo.innerHTML = `<form method="dialog">
    <h2>Asignar un escaneo a un trámite</h2>
    <p class="dialogo-detalle">${escapar(nombreArchivo)}</p>
    <label for="asignar-tramite">Trámite</label>
    <select id="asignar-tramite">
      ${candidatas
        .map(
          (s) =>
            `<option value="${escapar(s.id)}">${escapar(
              `${s.numeroSocio} · ${s.nombre} (${s.codigo})`
            )}</option>`
        )
        .join("")}
    </select>
    <label for="asignar-tipo">Qué documento es</label>
    <select id="asignar-tipo">
      ${opcionesDeTipo(candidatas[0] ? candidatas[0].id : "")}
    </select>
    <p class="error" id="asignar-error" hidden></p>
    <div class="dialogo-acciones">
      <button type="button" class="boton sutil" id="asignar-cancelar">Cancelar</button>
      <button type="button" class="boton primario" id="asignar-aceptar">Archivar</button>
    </div>
  </form>`;

  document.body.appendChild(dialogo);
  const cerrar = () => {
    dialogo.close();
    dialogo.remove();
  };
  // Cada tipo de socio admite unos documentos y no otros: al cambiar de trámite
  // se rehace la lista, para no archivar en un Socio Activo la cédula del
  // oficial del que depende, que no existe.
  dialogo.querySelector("#asignar-tramite").addEventListener("change", (evento) => {
    dialogo.querySelector("#asignar-tipo").innerHTML = opcionesDeTipo(evento.target.value);
  });
  dialogo.querySelector("#asignar-cancelar").addEventListener("click", cerrar);
  dialogo.querySelector("#asignar-aceptar").addEventListener("click", async (evento) => {
    const boton = evento.currentTarget;
    boton.disabled = true;
    try {
      const resultado = await api(
        `/api/escaneos/incidencias/${encodeURIComponent(nombreArchivo)}/asignar`,
        {
          method: "POST",
          body: JSON.stringify({
            solicitudId: dialogo.querySelector("#asignar-tramite").value,
            tipoDocumento: dialogo.querySelector("#asignar-tipo").value,
          }),
        }
      );
      cerrar();
      avisar(`Archivado como ${resultado.nombreArchivo}.`);
      await cargarBandeja();
    } catch (fallo) {
      const error = dialogo.querySelector("#asignar-error");
      error.textContent = fallo.message;
      error.hidden = false;
      boton.disabled = false;
    }
  });
  dialogo.showModal();
}

/* ------------------------------------------------------------------ */
/* Acciones sobre las tarjetas                                         */
/* ------------------------------------------------------------------ */

/**
 * Salidas que esta bandeja sabe ejercer. El dominio declara las salidas de cada
 * tarea y aquí se programan: si alguna falta, el botón se dibuja deshabilitado
 * con un aviso en lugar de no aparecer.
 */
const ACCIONES_CONOCIDAS = new Set([
  "revisar",
  "aprobar",
  "observar",
  "abrir-safi",
  "reenviar",
  "anular",
  "subir-adjunto",
  "omitir-adjunto",
  "subir-escaneo",
  "omitir-escaneo",
  "revisar-carpeta",
  "asignar-escaneo",
  "apartar-escaneo",
  "resolver-incidencia",
  "formulario-final",
  "reintentar-safi",
  "documentos-a-mano",
]);

document.addEventListener("click", async (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton || boton.tagName === "A") return;

  const accion = boton.dataset.accion;

  // Revisión y aprobación comparten diálogo: ahí están la factura, la
  // observación y el botón de devolver.
  if (accion === "resolver" || accion === "revisar" || accion === "aprobar" || accion === "observar") {
    const id = boton.dataset.id;
    const tarea =
      estado.bandeja.pendientes.find((t) => t.id === id) ||
      estado.bandeja.pendientes.find(
        (t) => t.solicitudId === id && (t.tipo === "REVISAR" || t.tipo === "APROBAR")
      );
    if (tarea) abrirDialogo(tarea, accion === "observar");
    return;
  }

  boton.disabled = true;
  try {
    if (accion === "ver-expediente") {
      await abrirExpediente(boton.dataset.id);
    } else if (accion === "abrir-safi") {
      await abrirDialogoSafi(boton.dataset.id);
    } else if (accion === "reenviar") {
      await pedirTexto({
        titulo: "Atender la observación y reenviar",
        detalle: "El trámite volverá a la bandeja de quien lo devolvió.",
        etiqueta: "Qué se corrigió",
        ruta: `/api/solicitudes/${encodeURIComponent(boton.dataset.id)}/reenviar`,
        campo: "observacion",
        exito: "Trámite reenviado.",
      });
    } else if (accion === "anular") {
      await pedirTexto({
        titulo: "Anular el trámite",
        detalle:
          "El trámite deja de estar en curso y su número de socio queda libre. Si la ficha ya existe en SAFI, desactívela allá: el sistema no borra nada del CRM.",
        etiqueta: "Motivo de la anulación",
        ruta: `/api/solicitudes/${encodeURIComponent(boton.dataset.id)}/anular`,
        campo: "observacion",
        exito: "Trámite anulado.",
      });
    } else if (accion === "tarjeta") {
      await pedirTexto({
        titulo: "Número de tarjeta",
        detalle: "Número impreso en la credencial de acceso del socio.",
        etiqueta: "Número de tarjeta",
        ruta: `/api/solicitudes/${encodeURIComponent(boton.dataset.id)}/tarjeta`,
        campo: "numeroTarjeta",
        minimo: 0,
        exito: "Número de tarjeta registrado.",
      });
    } else if (accion === "formulario-final") {
      const resultado = await api(
        `/api/solicitudes/${encodeURIComponent(boton.dataset.id)}/formulario-final`,
        { method: "POST" }
      );
      avisar(resultado.mensaje);
      await cargarBandeja();
    } else if (accion === "documentos-a-mano") {
      const resultado = await api(
        `/api/solicitudes/${encodeURIComponent(boton.dataset.id)}/safi/documentos-a-mano`,
        { method: "POST" }
      );
      avisar(`Marcados como cargados a mano: ${resultado.documentos} documento(s).`);
      await cargarBandeja();
    } else if (accion === "subir-adjunto") {
      const archivo = await pedirArchivo("image/png,image/jpeg,.png,.jpg,.jpeg");
      if (archivo) {
        await subirArchivo(
          `/api/solicitudes/${encodeURIComponent(boton.dataset.id)}/adjuntos`,
          archivo,
          { rol: boton.dataset.clave }
        );
        avisar(`${boton.dataset.etiqueta}: recibida en el servidor.`);
        await cargarBandeja();
      }
    } else if (accion === "omitir-adjunto") {
      await pedirTexto({
        titulo: `Continuar sin ${boton.dataset.etiqueta.toLowerCase()}`,
        detalle:
          "Diga dónde consta (normalmente, en el formulario firmado en papel que se escaneará). Queda en el expediente y en la bitácora con su nombre.",
        etiqueta: "Motivo",
        ruta: `/api/solicitudes/${encodeURIComponent(
          boton.dataset.id
        )}/adjuntos/${encodeURIComponent(boton.dataset.clave)}/omitir`,
        campo: "motivo",
        exito: "Registrado: el trámite continúa sin ese archivo.",
      });
    } else if (accion === "subir-escaneo") {
      const archivo = await pedirArchivo(
        ".pdf,.jpg,.jpeg,.png,.tif,.tiff,application/pdf,image/*"
      );
      if (archivo) {
        const resultado = await subirArchivo(
          `/api/solicitudes/${encodeURIComponent(
            boton.dataset.id
          )}/escaneos/${encodeURIComponent(boton.dataset.clave)}`,
          archivo
        );
        avisar(`Archivado en el expediente como ${resultado.nombreArchivo}.`);
        await cargarBandeja();
      }
    } else if (accion === "omitir-escaneo") {
      await pedirTexto({
        titulo: `${boton.dataset.etiqueta}: no aplica`,
        detalle:
          "Explique por qué este trámite no necesita ese documento. Queda en el expediente y en la bitácora con su nombre.",
        etiqueta: "Motivo",
        ruta: `/api/solicitudes/${encodeURIComponent(
          boton.dataset.id
        )}/escaneos/${encodeURIComponent(boton.dataset.clave)}/omitir`,
        campo: "motivo",
        exito: "Registrado: ese documento deja de reclamarse.",
      });
    } else if (accion === "asignar-escaneo") {
      await abrirAsignacion(boton.dataset.archivo);
    } else if (accion === "apartar-escaneo") {
      await api(
        `/api/escaneos/incidencias/${encodeURIComponent(boton.dataset.archivo)}/apartar`,
        { method: "POST" }
      );
      avisar("Apartado a _REVISAR: el archivo se conserva y la tarea queda cerrada.");
      await cargarBandeja();
    } else if (accion === "resolver-incidencia") {
      await api(`/api/escaneos/incidencias/${encodeURIComponent(boton.dataset.archivo)}/resolver`, {
        method: "POST",
      });
      avisar("Incidencia cerrada.");
      await cargarBandeja();
    } else if (accion === "revisar-carpeta") {
      const resumen = await api("/api/escaneos/revisar", { method: "POST" });
      avisar(
        `Carpeta revisada: ${resumen.archivados} archivados, ${resumen.enEspera} en espera, ${resumen.incidencias} con problemas.`
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

  if (!resultado.ok) {
    contenedor.innerHTML = `<div class="resultado-comprobacion no">
      <strong>No se puede archivar.</strong> ${escapar(resultado.detalle)}
    </div>`;
    return;
  }

  const dependiente =
    resultado.clave.ordinalDependiente !== null
      ? `dependiente N.º ${resultado.clave.ordinalDependiente} del socio ${resultado.clave.numeroSocio}`
      : `socio titular N.º ${resultado.clave.numeroSocio}`;

  const persona = resultado.persona;
  const sobrePersona = !persona
    ? `<br/><b>Atención:</b> todavía no hay ningún trámite con ese número. El archivo quedaría en espera hasta que se asigne.`
    : persona.coincide
      ? `<br/>Corresponde al trámite <code>${escapar(persona.codigo)}</code> de <b>${escapar(persona.nombre)}</b>.`
      : `<br/><b>Atención:</b> ese número es del trámite <code>${escapar(persona.codigo)}</code>, de <b>${escapar(
          persona.nombre
        )}</b>. Con ese nombre el archivo iría a <code>_REVISAR</code>.`;

  contenedor.innerHTML = `<div class="resultado-comprobacion ${persona && persona.coincide ? "ok" : "no"}">
    <strong>Nombre bien formado.</strong> Se archivaría como documento de tipo
    <code>${escapar(resultado.tipo)}</code> del ${escapar(dependiente)}, a nombre de
    <b>${escapar(resultado.clave.apellidosNombres)}</b>.
    ${resultado.seNormalizo ? `<br/>Se guardará como <code>${escapar(resultado.nombreCanonico)}</code>.` : ""}
    ${sobrePersona}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Expediente                                                          */
/* ------------------------------------------------------------------ */

const dialogoExpediente = $("dialogo-expediente");
$("exp-cerrar").addEventListener("click", () => dialogoExpediente.close());

function filas(pares) {
  return `<div class="filas">${pares
    .filter(([, valor]) => valor !== undefined && valor !== null && valor !== "")
    .map(([etiqueta, valor]) => `<div class="fila-dato"><span>${escapar(etiqueta)}</span><b>${escapar(valor)}</b></div>`)
    .join("")}</div>`;
}

/**
 * Todas las observaciones del trámite, en orden y con su fecha.
 *
 * Se acumulan: la Gerencia ve la que Contabilidad escribió al devolver el
 * trámite y también la que escribió al pasarlo a aprobación, cada una con su
 * día y su autor. Antes solo se veía la última devolución.
 */
function observacionesHtml(observaciones) {
  const lista = observaciones || [];
  if (lista.length === 0) return "";

  const filas = lista
    .map(
      (nota) => `<li>
        <span class="pista">${escapar(fechaHora(nota.en))} · ${escapar(
          ETIQUETA_AREA[nota.area] || nota.area
        )} · ${escapar(nota.responsable)}</span>
        <div>${escapar(nota.observacion)}</div>
      </li>`
    )
    .join("");

  return `<div class="bloque">
    <h3>Observaciones del trámite</h3>
    <ul class="lista-observaciones">${filas}</ul>
  </div>`;
}

function constanciaHtml(titulo, cargo, constancia, extra) {
  return `<div class="constancia ${constancia ? "cumplida" : "pendiente"}">
    <strong>${escapar(titulo)}</strong>
    ${constancia ? `${escapar(constancia.responsable)} · ${escapar(fechaHora(constancia.en))}` : "Pendiente"}
    <div class="pista">${escapar(cargo)}</div>
    ${constancia && constancia.observacion ? `<div>${escapar(constancia.observacion)}</div>` : ""}
    ${extra ? `<div>${escapar(extra)}</div>` : ""}
  </div>`;
}

async function abrirExpediente(id) {
  const ficha = await api(`/api/solicitudes/${encodeURIComponent(id)}`);
  estado.expediente = ficha;

  const s = ficha.solicitud;
  const d = s.datos;
  const numero = s.tramite.numeroSocio
    ? `${s.tramite.numeroSocio}${s.tramite.ordinalDependiente ? `-${s.tramite.ordinalDependiente}` : ""}`
    : "sin asignar";

  $("exp-titulo").textContent = `${s.codigo} · ${d.apellidos} ${d.nombres}`;
  $("exp-detalle").innerHTML =
    `<span class="etiqueta ${TONO_ESTADO[s.estado] ?? ""}">${escapar(
      ETIQUETA_ESTADO[s.estado] ?? s.estado
    )}</span> C.I. ${escapar(d.cedula)} · ${escapar(ficha.solicitud.datos.tipoMiembro ?? "")} · Socio N.º ${escapar(numero)}`;

  $("exp-resumen").innerHTML = `
    <div class="bloque">
      <h3>Solicitante</h3>
      ${filas([
        ["Apellidos y nombres", `${d.apellidos} ${d.nombres}`],
        ["Cédula", d.cedula],
        ["Sexo", d.sexo],
        ["Estado civil", d.estadoCivil],
        ["Fecha de nacimiento", d.fechaNacimiento],
        ["Tipo de sangre", d.tipoSangre],
        ["Provincia y ciudad", [d.provincia, d.ciudad].filter(Boolean).join(" · ")],
        ["Dirección", d.direccion],
        ["Celular", d.celular],
        ["Correo", d.correo],
        ["Profesión", d.profesion],
        ["Grado militar", d.gradoMilitar],
        ["Promoción", d.promocion],
        ["Socio titular", [d.titularApellidos, d.titularNombres].filter(Boolean).join(" ")],
        ["N.º de socio del titular", d.titularNumeroSocio],
        ["Vínculo", d.vinculoConTitular],
      ])}
    </div>
    <div class="bloque">
      <h3>Expediente y SAFI</h3>
      ${filas([
        ["Documentos del trámite", (ficha.documentosDelTramite || []).map((doc) => doc.codigo).join(" · ")],
        ["Carpeta del repositorio", s.expediente.carpeta],
        ["Ficha en SAFI", s.expediente.socioSafiId ? `Socio ${s.expediente.socioSafiId}` : "Todavía no creada"],
        ["Cuenta en SAFI", s.expediente.cuentaSafiId],
        [
          "Documentos en SAFI",
          s.expediente.safi === "CARGADO"
            ? "Publicados"
            : s.estado === "APROBADA"
              ? s.expediente.safiMensaje || "Pendientes"
              : "Se publican al aprobarse",
        ],
        ["Número de tarjeta", s.tramite.numeroTarjeta],
      ])}
    </div>`;

  const adjuntos = (ficha.adjuntos || [])
    .map(
      (adjunto) => `<li>
        ${
          adjunto.tipoContenido.startsWith("image/")
            ? `<img class="miniatura-adjunto" src="/api/solicitudes/${encodeURIComponent(
                s.id
              )}/adjuntos/${encodeURIComponent(adjunto.rol)}" alt="${escapar(adjunto.etiqueta)}" />`
            : ""
        }
        <span>${escapar(adjunto.etiqueta)}</span>
        <span class="pista">${escapar(tamano(adjunto.bytes))}</span>
      </li>`
    )
    .join("");

  const faltantes = (ficha.adjuntosFaltantes || [])
    .map((f) => `<li><span>${escapar(f.etiqueta)}</span><span class="pista">no recibido de la tableta</span></li>`)
    .join("");

  const archivos = (ficha.archivos || [])
    .map(
      (archivo) => `<li>
        <span>${escapar(archivo.nombre)}</span>
        <a href="/api/expediente/documentos/${encodeURIComponent(archivo.id)}" target="_blank" rel="noopener">
          ${escapar(archivo.nombreArchivo)}
        </a>
        <span class="pista">${
          archivo.nombreOrigen ? `llegó como «${escapar(archivo.nombreOrigen)}» · ` : ""
        }${escapar(tamano(archivo.bytes))} · ${escapar(archivo.safiEstado)}</span>
      </li>`
    )
    .join("");

  $("exp-documentos").innerHTML = `
    <div class="bloque">
      <h3>Firmas de la tableta</h3>
      <ul class="lista-documentos">${adjuntos || ""}${faltantes || ""}${
        !adjuntos && !faltantes ? "<li><span class='pista'>Sin archivos registrados.</span></li>" : ""
      }</ul>
    </div>
    <div class="bloque">
      <h3>Documentos archivados en el expediente</h3>
      <ul class="lista-documentos">${
        archivos || "<li><span class='pista'>Todavía no hay documentos archivados.</span></li>"
      }</ul>
    </div>`;

  $("exp-constancias").innerHTML = `
    <div class="bloque">
      <h3>Información interna del Club</h3>
      ${constanciaHtml("Registrado", "Jefatura de Control de Socios", s.tramite.registro)}
      ${constanciaHtml(
        "Revisado",
        "Contadora",
        s.tramite.revision,
        s.tramite.revision && s.tramite.revision.numeroFactura
          ? `FC: ${s.tramite.revision.numeroFactura}`
          : ""
      )}
      ${constanciaHtml("Aprobado", "Administrador del Club", s.tramite.aprobacion)}
      ${
        s.tramite.devolucion
          ? `<div class="aviso-safi">Devuelta a ${escapar(
              NOMBRE_AREA[s.tramite.devolucion.destino || "SOCIOS"]
            )} por ${escapar(s.tramite.devolucion.responsable)} el ${escapar(
              fechaHora(s.tramite.devolucion.en)
            )}: ${escapar(s.tramite.devolucion.observacion)}</div>`
          : ""
      }
      ${
        s.tramite.anulacion
          ? `<div class="aviso-safi bloquea">Anulada por ${escapar(
              s.tramite.anulacion.responsable
            )} el ${escapar(fechaHora(s.tramite.anulacion.en))}: ${escapar(s.tramite.anulacion.observacion)}</div>`
          : ""
      }
      ${observacionesHtml(s.tramite.observaciones)}
    </div>`;

  // El formulario, tal como está ahora mismo: es lo que hay que mirar antes de
  // revisar o aprobar.
  $("exp-marco").src = `/api/solicitudes/${encodeURIComponent(s.id)}/formulario`;
  const pdf = $("exp-pdf");
  pdf.href = `/api/solicitudes/${encodeURIComponent(s.id)}/formulario.pdf`;
  pdf.hidden = !(ficha.sistema && ficha.sistema.pdfDisponible);
  $("exp-formulario-nota").textContent =
    ficha.sistema && ficha.sistema.pdfDisponible
      ? ""
      : "Este servidor no imprime PDF: use Ctrl+P sobre el formulario para guardarlo.";

  // Acciones del área, sobre el mismo documento que se está viendo.
  const acciones = [];
  const area = estado.bandeja.area;
  if (area === "CONTABILIDAD" && s.estado === "REGISTRADA" && s.expediente.socioSafiId) {
    acciones.push(
      `<button type="button" class="boton primario" data-accion="resolver-desde-expediente" data-tipo="REVISAR" data-id="${escapar(
        s.id
      )}">Marcar como revisada</button>`
    );
  }
  if (area === "GERENCIA" && s.estado === "REVISADA") {
    acciones.push(
      `<button type="button" class="boton primario" data-accion="resolver-desde-expediente" data-tipo="APROBAR" data-id="${escapar(
        s.id
      )}">Aprobar el ingreso</button>`
    );
  }
  if (area === "SOCIOS") {
    if (!s.expediente.socioSafiId && s.estado !== "RECHAZADA") {
      acciones.push(
        `<button type="button" class="boton primario" data-accion="abrir-safi" data-id="${escapar(
          s.id
        )}">Confirmar y crear en SAFI</button>`
      );
    }
    acciones.push(
      `<button type="button" class="boton sutil" data-accion="tarjeta" data-id="${escapar(
        s.id
      )}">Número de tarjeta</button>`
    );
  }
  $("exp-acciones").innerHTML = acciones.join("");

  if (!dialogoExpediente.open) dialogoExpediente.showModal();
}

/* ------------------------------------------------------------------ */
/* Diálogo de resolución                                               */
/* ------------------------------------------------------------------ */

const dialogo = $("dialogo-tarea");

function abrirDialogo(tarea, enfocarObservacion = false) {
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

  // La Gerencia elige a quién devolver; Contabilidad devuelve siempre al Área
  // de Socios, así que a ella no se le pregunta.
  const eligeDestino = estado.bandeja && estado.bandeja.area === "GERENCIA";
  $("campo-destino").hidden = !eligeDestino;
  const porDefecto = document.querySelector('input[name="destino"][value="SOCIOS"]');
  if (porDefecto) porDefecto.checked = true;

  dialogo.showModal();
  (enfocarObservacion || !esRevision ? $("observacion") : $("numero-factura")).focus();

  // Si la Gerencia la devolvió a Contabilidad, la factura de la revisión que
  // se deshizo se ofrece de nuevo: no hay por qué volver a buscarla.
  if (esRevision) {
    api(`/api/solicitudes/${encodeURIComponent(tarea.solicitudId)}`)
      .then((ficha) => {
        const devolucion = ficha && ficha.solicitud && ficha.solicitud.tramite.devolucion;
        const anterior = devolucion && devolucion.numeroFacturaAnterior;
        if (anterior && !$("numero-factura").value) $("numero-factura").value = anterior;
      })
      .catch(() => {});
  }
}

/** La misma resolución, abierta desde el expediente que se está viendo. */
document.addEventListener("click", (evento) => {
  const boton = evento.target.closest('[data-accion="resolver-desde-expediente"]');
  if (!boton) return;
  const ficha = estado.expediente;
  if (!ficha) return;
  const s = ficha.solicitud;
  abrirDialogo({
    id: `${s.id}:${boton.dataset.tipo}`,
    tipo: boton.dataset.tipo,
    solicitudId: s.id,
    codigo: s.codigo,
    nombreSocio: `${s.datos.apellidos} ${s.datos.nombres}`,
    cedula: s.datos.cedula,
  });
});

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
  const elegido = document.querySelector('input[name="destino"]:checked');
  const destino =
    estado.bandeja && estado.bandeja.area === "GERENCIA" && elegido ? elegido.value : "SOCIOS";
  await enviarAccion("observar", { observacion, destino });
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
    if (dialogoExpediente.open) dialogoExpediente.close();
    avisar(
      ruta === "observar"
        ? `Trámite devuelto a ${NOMBRE_AREA[cuerpo.destino || "SOCIOS"]}.`
        : ruta === "aprobar"
          ? `${tarea.codigo} aprobado. El formulario final se está archivando en el expediente.`
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
/* Diálogo de texto libre (reenviar, anular, tarjeta)                  */
/* ------------------------------------------------------------------ */

const dialogoTexto = $("dialogo-texto");
let peticionTexto = null;

$("texto-cancelar").addEventListener("click", () => dialogoTexto.close());

function pedirTexto(opciones) {
  peticionTexto = opciones;
  $("texto-titulo").textContent = opciones.titulo;
  $("texto-detalle").textContent = opciones.detalle ?? "";
  $("texto-etiqueta").textContent = opciones.etiqueta;
  $("texto-valor").value = "";
  $("error-texto").hidden = true;
  dialogoTexto.showModal();
  $("texto-valor").focus();
  return Promise.resolve();
}

$("texto-aceptar").addEventListener("click", async () => {
  if (!peticionTexto) return;
  const valor = $("texto-valor").value.trim();
  const minimo = peticionTexto.minimo ?? 10;
  if (valor.length < minimo) {
    const error = $("error-texto");
    error.textContent = `Escriba al menos ${minimo} caracteres.`;
    error.hidden = false;
    return;
  }

  const boton = $("texto-aceptar");
  boton.disabled = true;
  try {
    await api(peticionTexto.ruta, {
      method: "POST",
      body: JSON.stringify({ [peticionTexto.campo]: valor }),
    });
    dialogoTexto.close();
    if (dialogoExpediente.open) dialogoExpediente.close();
    avisar(peticionTexto.exito);
    await cargarBandeja();
  } catch (fallo) {
    const error = $("error-texto");
    error.textContent = fallo.message;
    error.hidden = false;
  } finally {
    boton.disabled = false;
  }
});

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
function llenarSelect(id, opciones, valor, { vacio = "(sin valor)" } = {}) {
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
      `${ficha.numeroSocio}). Compruebe el número del titular: sus dependientes deben colgarse de ` +
      "esa misma Cuenta.";
    contexto.className = "nota-safi peligro";
  }

  // Con la escritura apagada, el alta la hace una persona en el CRM y
  // transcribe aquí los identificadores; el sistema los comprueba.
  const manual = ficha.altaManual;
  $("safi-campo-manual").hidden = !manual;
  $("safi-pista-manual").textContent = manual
    ? ficha.modo === "MANUAL"
      ? "La integración está en modo manual. Cree la Cuenta y el Socio en SAFI con los valores de arriba y copie aquí los identificadores que les asignó: son el número que aparece en record= en la barra de direcciones al abrir cada ficha."
      : "La escritura en SAFI está deshabilitada (SAFI_ESCRITURA=false). Cree la Cuenta y el Socio en el CRM con los valores de arriba y copie aquí sus identificadores. El sistema comprueba en SAFI que correspondan a esta persona."
    : "";
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
    : `Quedará como «${ficha.numeroSocio}-${ficha.ordinalDependiente}» en el expediente y como Secuencia ${String(
        ficha.ordinalDependiente ?? ""
      ).padStart(2, "0")} en SAFI.`;

  // Un dependiente se cuelga de la Cuenta de su titular, que ya tiene resueltos
  // los campos de facturación; y si no paga cuota propia, tampoco hay nada que
  // confirmar sobre cuotas.
  $("safi-grupo-cuenta").hidden = !ficha.esTitular;
  $("safi-grupo-cuotas").hidden = !ficha.pagaCuota;

  llenarSelect(CAMPOS_SAFI.grupoFacturacion, ficha.listas.grupoFacturacion, ficha.propuesta.grupoFacturacion);
  llenarSelect(CAMPOS_SAFI.formaPago, ficha.listas.formaPago, ficha.propuesta.formaPago);
  llenarSelect(CAMPOS_SAFI.tipoContribuyente, ficha.listas.tipoContribuyente, ficha.propuesta.tipoContribuyente);
  // Solo las periodicidades que el tarifario admite para esta categoría: un
  // Particular B no se puede mensualizar, un suscriptor de tenis no paga mensual.
  const periodicidades = Object.keys(ficha.tarifas || {}).map((clave) => NOMBRE_PERIODICIDAD[clave]);
  llenarSelect(
    CAMPOS_SAFI.suscripcion,
    periodicidades.length > 0
      ? ficha.listas.suscripcion.filter((opcion) => periodicidades.includes(opcion))
      : ficha.listas.suscripcion,
    ficha.propuesta.suscripcion
  );
  llenarSelect(CAMPOS_SAFI.valorMembresia, ficha.listas.valorMembresia, ficha.propuesta.valorMembresia);
  llenarSelect(CAMPOS_SAFI.cuotaAnual, ficha.listas.cuotaAnual, ficha.propuesta.cuotaAnual, {
    vacio: "(no se acoge a la anual)",
  });
  llenarSelect(CAMPOS_SAFI.cuotaMensual, ficha.listas.cuotaMensual, ficha.propuesta.cuotaMensual, {
    vacio: "(no se acoge a la mensual)",
  });

  sincronizarCuotas();
  $("safi-observacion").value = "";
  pintarOficialFae(ficha.oficialFae);
  dibujarAvisosSafi(ficha.avisos);
  dibujarFichasSafi(ficha);
  $("error-safi").hidden = true;
  if (!dialogoSafi.open) dialogoSafi.showModal();
}

/**
 * El oficial FAE del que desciende un D-C —su abuelo—, cuyo grado y nombre van
 * al Parentesco de la ficha en SAFI (Coordinador, 23/09/2026). Solo aparece en
 * un D-C. La Jefatura puede completarlo o corregirlo; se consulta en el CRM al
 * escribirlo, y el servidor lo vuelve a comprobar al crear la ficha.
 */
function pintarOficialFae(oficial) {
  const grupo = $("safi-oficial-fae-grupo");
  grupo.hidden = !oficial;
  if (!oficial) return;
  $("safi-oficial-fae").value = oficial.numero || "";
  const origen = oficial.origen ? ` (${oficial.origen})` : "";
  if (!oficial.numero) {
    resultadoOficialFae("Escriba el número: sin él no se puede crear la ficha.", "no");
  } else if (oficial.verificacion) {
    describirOficialFae(oficial.verificacion, origen);
  } else {
    resultadoOficialFae(`N.º ${oficial.numero}${origen}: no se pudo comprobar en SAFI ahora.`, "");
  }
}

const OFICIALES_FAE = ["ACTIVO", "FUNDADOR"];

function describirOficialFae(socio, origen = "") {
  if (!socio || socio.resultado === "NO_ENCONTRADO") {
    resultadoOficialFae("SAFI no tiene un socio con ese número.", "no");
    return;
  }
  const nombre = [socio.gradoMilitar, socio.nombres, socio.apellidos]
    .filter((parte) => parte && parte.toUpperCase() !== "NO APLICA")
    .join(" ");
  const tipo = (socio.tipoSocioSafi || "").toUpperCase();
  if (OFICIALES_FAE.includes(tipo)) {
    resultadoOficialFae(`✔ ${nombre} · socio ${tipo}${origen}. Irá al Parentesco.`, "ok");
  } else {
    resultadoOficialFae(`✘ ${nombre} es socio ${tipo || "de otra categoría"}: el oficial debe ser Activo o Fundador.`, "no");
  }
}

function resultadoOficialFae(texto, clase) {
  const linea = $("safi-oficial-fae-resultado");
  linea.textContent = texto;
  linea.className = `pista ${clase === "ok" ? "texto-exito" : clase === "no" ? "texto-peligro" : ""}`.trim();
}

let consultaOficialFae = 0;
$("safi-oficial-fae").addEventListener("change", async (evento) => {
  const numero = evento.target.value.trim();
  const turno = ++consultaOficialFae;
  if (!numero) {
    resultadoOficialFae("Escriba el número: sin él no se puede crear la ficha.", "no");
    return;
  }
  if (!/^\d{1,8}$/.test(numero)) {
    resultadoOficialFae("El número de socio solo lleva dígitos.", "no");
    return;
  }
  resultadoOficialFae("Consultando en SAFI…", "");
  try {
    const respuesta = await api(`/api/safi/socios?numero=${encodeURIComponent(numero)}`);
    if (turno !== consultaOficialFae) return;
    if (!respuesta.consultado) {
      resultadoOficialFae("No se pudo consultar SAFI ahora. Se comprobará al crear la ficha.", "");
      return;
    }
    describirOficialFae(respuesta.socio);
  } catch (error) {
    if (turno === consultaOficialFae) resultadoOficialFae(error.message, "no");
  }
});

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

/** Lo que el CRM ya tiene con ese número de socio: la comprobación previa. */
function dibujarFichasSafi(ficha) {
  const contenedor = $("safi-fichas");
  if (!ficha.consultadoEnSafi) {
    contenedor.innerHTML = `<p class="pista">No se pudo consultar el CRM para comprobar duplicados: revise a mano que el número y la cédula no estén ya registrados.</p>`;
    return;
  }
  if (!ficha.fichasEnSafi || ficha.fichasEnSafi.length === 0) {
    contenedor.innerHTML = `<p class="pista">Comprobado en SAFI: el número ${escapar(
      ficha.numeroSocio || "—"
    )} no tiene ninguna ficha todavía.</p>`;
    return;
  }
  contenedor.innerHTML = `<p class="pista">En SAFI, la cuenta ${escapar(
    ficha.numeroSocio
  )} ya tiene: ${ficha.fichasEnSafi
    .map((f) => `<code>${escapar(f.secuencia)}</code> ${escapar(f.nombre)}`)
    .join(" · ")}</p>`;
}

/**
 * Las dos cuotas son excluyentes: el socio se acoge a la anual o a la mensual.
 *
 * Antes solo se vaciaba la otra al elegir una, y el aviso lo explicaba con una
 * frase; ahora la que no aplica queda **bloqueada** hasta que se suelte la
 * elegida. Se ve lo que pasa en vez de leerlo.
 *
 * El «Valor Cuota» de la Cuenta es la cuota elegida (decisión del Coordinador,
 * 23/09/2026): se escribe solo, y el servidor lo vuelve a calcular al crear.
 */
function sincronizarCuotas() {
  const anual = $(CAMPOS_SAFI.cuotaAnual);
  const mensual = $(CAMPOS_SAFI.cuotaMensual);

  anual.disabled = Boolean(mensual.value);
  mensual.disabled = Boolean(anual.value);

  // Con Trimestral o Semestral, el valor es el de esa periodicidad: SAFI no
  // tiene un campo de cuota para ellas.
  const periodica = tarifaDeSuscripcion($(CAMPOS_SAFI.suscripcion).value, ["Trimestral", "Semestral"]);
  $("safi-valor-cuota").value =
    periodica !== null
      ? periodica.toFixed(2)
      : valorCuotaElegida(mensual.value) || valorCuotaElegida(anual.value);

  for (const [select, otro] of [
    [anual, mensual],
    [mensual, anual],
  ]) {
    select.title = select.disabled
      ? `El socio se acogió a la otra modalidad. Vacíe «${
          otro === anual ? "Cuota Anual" : "Cuota Mensual"
        }» para poder elegir aquí.`
      : "";
  }
}

/** `40` → `40.00`; vacío o cero, nada: no se acoge a esa modalidad. */
function valorCuotaElegida(valor) {
  const numero = Number(String(valor).replace(",", ".").trim());
  return String(valor).trim() && Number.isFinite(numero) && numero > 0 ? numero.toFixed(2) : "";
}

/**
 * Al elegir la cuota, las Subscripciones acompañan: «Mensual» con la mensual y
 * «Anual» con la anual. Solo se cambian si están en una de esas dos o vacías;
 * otra periodicidad la eligió la Jefatura a propósito.
 */
function acompasarSuscripcion(periodicidad) {
  const suscripcion = $(CAMPOS_SAFI.suscripcion);
  if (!["", "Anual", "Mensual"].includes(suscripcion.value)) return;
  if ([...suscripcion.options].some((opcion) => opcion.value === periodicidad)) {
    suscripcion.value = periodicidad;
  }
}

/** «Mensual» ↔ `MENSUAL`: las periodicidades del tarifario y las de SAFI. */
const NOMBRE_PERIODICIDAD = {
  ANUAL: "Anual",
  MENSUAL: "Mensual",
  TRIMESTRAL: "Trimestral",
  SEMESTRAL: "Semestral",
};

/** Valor del tarifario para la subscripción elegida, si es una de `admitidas`. */
function tarifaDeSuscripcion(suscripcion, admitidas) {
  if (!admitidas.includes(suscripcion)) return null;
  const clave = Object.keys(NOMBRE_PERIODICIDAD).find((c) => NOMBRE_PERIODICIDAD[c] === suscripcion);
  const valor = estado.safi?.ficha?.tarifas?.[clave];
  return typeof valor === "number" ? valor : null;
}

/**
 * Al elegir la subscripción, la cuota se llena sola con la del tarifario de la
 * categoría (Coordinador, 24/09/2026): «Anual» pone la cuota anual y vacía la
 * mensual; «Mensual», al revés; «Trimestral» y «Semestral» vacían las dos y
 * llevan su valor al Valor Cuota. La Jefatura puede cambiarla después.
 */
$(CAMPOS_SAFI.suscripcion).addEventListener("change", () => {
  const suscripcion = $(CAMPOS_SAFI.suscripcion).value;
  const anual = $(CAMPOS_SAFI.cuotaAnual);
  const mensual = $(CAMPOS_SAFI.cuotaMensual);
  const poner = (select, valor) => {
    const texto = valor === null ? "" : String(valor);
    if (texto && ![...select.options].some((opcion) => opcion.value === texto)) {
      // Un importe que el CRM todavía no tiene (el del Corresponsal A): se
      // enseña marcado, como al abrir el panel.
      select.insertAdjacentHTML(
        "beforeend",
        `<option value="${escapar(texto)}">${escapar(texto)} (no existe en SAFI)</option>`
      );
    }
    select.value = texto;
  };
  if (suscripcion === "Anual") {
    poner(anual, tarifaDeSuscripcion("Anual", ["Anual"]));
    poner(mensual, null);
  } else if (suscripcion === "Mensual") {
    poner(mensual, tarifaDeSuscripcion("Mensual", ["Mensual"]));
    poner(anual, null);
  } else if (suscripcion === "Trimestral" || suscripcion === "Semestral") {
    poner(anual, null);
    poner(mensual, null);
  }
  sincronizarCuotas();
});

$(CAMPOS_SAFI.cuotaAnual).addEventListener("change", () => {
  if ($(CAMPOS_SAFI.cuotaAnual).value) {
    $(CAMPOS_SAFI.cuotaMensual).value = "";
    acompasarSuscripcion("Anual");
  }
  sincronizarCuotas();
});
$(CAMPOS_SAFI.cuotaMensual).addEventListener("change", () => {
  if ($(CAMPOS_SAFI.cuotaMensual).value) {
    $(CAMPOS_SAFI.cuotaAnual).value = "";
    acompasarSuscripcion("Mensual");
  }
  sincronizarCuotas();
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
          observacion: $("safi-observacion").value.trim(),
          numeroOficialFae: $("safi-oficial-fae-grupo").hidden ? "" : $("safi-oficial-fae").value.trim(),
          // Con qué versión del trámite se abrió el panel: si se corrigió desde
          // la tableta mientras tanto, el servidor no crea nada.
          version: estado.safi.ficha.version,
          cuentaSafiId: $("safi-cuenta-id").value.trim(),
          socioSafiId: $("safi-socio-id").value.trim(),
        }),
      }
    );

    dialogoSafi.close();
    if (dialogoExpediente.open) dialogoExpediente.close();
    avisar(resultado.mensaje);
    await cargarBandeja();
  } catch (fallo) {
    if (fallo.datos && fallo.datos.cambiado) {
      // El trámite cambió con el panel abierto: se vuelve a abrir con los datos
      // vigentes, y el aviso lo dice.
      try {
        await abrirDialogoSafi(estado.safi.solicitudId);
      } catch {
        // Si no se pudo reabrir, basta el mensaje.
      }
    }
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
    if (estado.sesion && !hayDialogoAbierto()) void cargarBandeja();
  }, 60000);
})();
