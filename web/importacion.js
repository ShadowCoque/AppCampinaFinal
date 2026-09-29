/*
 * Importación de socios oficiales desde Excel (pestaña «Importar socios»).
 *
 * Solo la ve el Área de Socios. Se apoya en las utilidades de bandeja.js
 * ($, api, escapar, avisar, fechaHora), que se carga antes.
 *
 * El trabajo lo hace el servidor: revisar el archivo contra SAFI sin crear
 * nada y, cuando la Jefatura confirma, crear las filas una por una en segundo
 * plano. Aquí solo se muestra el lote y se consulta su avance.
 */

"use strict";

const importacion = {
  iniciada: false,
  /** Lote abierto. */
  lote: null,
  sistema: null,
  temporizador: null,
};

const ETIQUETA_ESTADO_LOTE = {
  REVISADO: "Revisado",
  EN_CURSO: "Creándose en SAFI",
  DETENIDO: "Detenido",
  TERMINADO: "Terminado",
  DESCARTADO: "Descartado",
};
const TONO_ESTADO_LOTE = {
  REVISADO: "",
  EN_CURSO: "gold",
  DETENIDO: "warning",
  TERMINADO: "success",
  DESCARTADO: "",
};
const ETIQUETA_ESTADO_FILA = {
  ERROR: "Con errores",
  LISTA: "Lista",
  EN_CURSO: "Creándose",
  CREADA: "Creada",
  FALLIDA: "Fallida",
};
const TONO_ESTADO_FILA = {
  ERROR: "danger",
  LISTA: "",
  EN_CURSO: "gold",
  CREADA: "success",
  FALLIDA: "warning",
};

/** Se llama al abrir la pestaña. */
async function mostrarImportacion() {
  if (!importacion.iniciada) {
    dibujarImportacion();
    importacion.iniciada = true;
  }
  await Promise.all([cargarLotes(), cargarNumeracion()]);
}

/** Las dos importaciones. El Coordinador decidirá con cuál se queda. */
const MODOS = {
  FORMULARIO: {
    titulo: "Importar socios oficiales desde Excel · con formulario",
    nombre: "con formulario",
    descripcion: `Por cada socio se registra un <b>trámite</b> (AF-…) con su formulario <b>R-PGS1-1</b>, el único que
      lleva el Socio Activo, y se crean su Cuenta y su ficha en SAFI. El trámite sigue por Contabilidad y la
      Gerencia como uno de la tableta, y el PDF se archiva al aprobarlo. La firma del socio queda pendiente de
      la firma electrónica. La plantilla pide además lugar de nacimiento, profesión y datos de trabajo.`,
  },
  SAFI: {
    titulo: "Importar socios oficiales desde Excel · solo SAFI",
    nombre: "solo SAFI",
    descripcion: `Solo crea la Cuenta y la ficha de cada socio en SAFI. <b>No genera formularios</b> ni trámites,
      así que no pasa por Contabilidad ni la Gerencia.`,
  },
};

function bloqueDeModo(modo) {
  const m = MODOS[modo];
  return `<div class="comprobador bloque-importacion">
    <h2>${escapar(m.titulo)}</h2>
    <p>${m.descripcion}</p>
    <p><a class="boton sutil" href="/api/importaciones/plantilla?modo=${modo}" download>Descargar la plantilla ${escapar(
      m.nombre
    )} (.xlsx)</a></p>
    <div class="comprobador-fila">
      <div style="flex:2;min-width:240px">
        <label for="imp-archivo-${modo}">Archivo de Excel (.xlsx)</label>
        <input id="imp-archivo-${modo}" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
      </div>
      <div style="flex:1;min-width:180px">
        <label for="imp-desde-${modo}">Asignar números desde <span class="opcional">(filas sin número)</span></label>
        <input id="imp-desde-${modo}" type="text" inputmode="numeric" maxlength="6" placeholder="Ej.: 2929" autocomplete="off" />
      </div>
      <button type="button" class="boton primario" data-subir="${modo}">Revisar el archivo</button>
    </div>
    <p class="error" id="imp-error-${modo}" role="alert" hidden></p>
  </div>`;
}

function dibujarImportacion() {
  $("vista-importar").innerHTML = `<div class="instructivo importacion">
    <h2>Importar socios oficiales desde Excel</h2>
    <p>Para los cadetes que ingresan cada octubre, o cualquier grupo de <b>Socios Activos</b> (oficiales FAE),
       sin pasar por la tableta. Las demás categorías se siguen afiliando desde la tableta. Hay dos formas;
       cada una tiene su propia plantilla.</p>
    <ol>
      <li>Descargue la plantilla de la importación que va a usar y escriba un socio por fila.</li>
      <li>Súbala en ese mismo bloque. El sistema revisa cada fila y consulta SAFI, <b>sin crear nada</b>.</li>
      <li>Corrija lo que salga en rojo y vuelva a subirla, o cree solo las filas que están listas.</li>
      <li>Pulse «Crear en SAFI». Los socios se crean uno por uno; puede seguir el avance aquí.</li>
    </ol>
    <p class="pista" id="imp-numeracion">Consultando los últimos números creados en SAFI…</p>
    ${bloqueDeModo("FORMULARIO")}
    ${bloqueDeModo("SAFI")}
  </div>
  <div id="imp-lote"></div>
  <div id="imp-historial"></div>`;

  $("vista-importar").addEventListener("click", (evento) => {
    const subir = evento.target.closest("[data-subir]");
    if (subir) void subirArchivo(subir.dataset.subir);
  });
  $("imp-lote").addEventListener("click", (evento) => {
    const boton = evento.target.closest("[data-imp]");
    if (boton) void accionLote(boton.dataset.imp);
  });
  $("imp-historial").addEventListener("click", (evento) => {
    const boton = evento.target.closest("[data-lote]");
    if (boton) void abrirLote(boton.dataset.lote);
  });
  $("imp-confirmar-cancelar").addEventListener("click", () => $("dialogo-importacion").close());
  $("imp-confirmar-aceptar").addEventListener("click", () => void crearEnSafi());
}

async function cargarNumeracion() {
  const nota = $("imp-numeracion");
  try {
    const { recientes } = await api("/api/importaciones/numeracion");
    if (!recientes || recientes.length === 0) {
      nota.textContent = "No se pudieron consultar los últimos números de SAFI.";
      return;
    }
    const mayor = recientes.reduce((max, r) => Math.max(max, Number(r.numero)), 0);
    // Un número puede repetirse si SAFI tiene dos titulares con él: se muestra una vez.
    const unicos = recientes.filter((r, i) => recientes.findIndex((otro) => otro.numero === r.numero) === i);
    const lista = unicos
      .slice(0, 6)
      .map((r) => `${r.numero} (${fechaHora(r.creadoEn).split(" · ")[0]})`)
      .join(", ");
    nota.innerHTML = `Últimos titulares creados en SAFI: ${escapar(lista)}. El más alto de ellos es el
      <b>${mayor}</b>. Elija el número de partida con cuidado: puede haber un bloque reservado.`;
  } catch {
    nota.textContent = "";
  }
}

async function cargarLotes() {
  try {
    const respuesta = await api("/api/importaciones");
    importacion.sistema = { modo: respuesta.safiModo, escritura: respuesta.safiEscritura };
    dibujarHistorial(respuesta.lotes);
    // Un lote que se está creando se abre solo: es lo que la Jefatura quiere ver.
    const enCurso = respuesta.lotes.find((l) => l.estado === "EN_CURSO");
    if (enCurso && !importacion.lote) await abrirLote(enCurso.id);
  } catch (fallo) {
    avisar(fallo.message);
  }
}

function dibujarHistorial(lotes) {
  if (!lotes || lotes.length === 0) {
    $("imp-historial").innerHTML = "";
    return;
  }
  const filas = lotes
    .map(
      (lote) => `<tr>
        <td><b>${escapar(lote.codigo)}</b></td>
        <td>${escapar(fechaHora(lote.creadaEn))}</td>
        <td>${escapar((MODOS[lote.modo] || MODOS.SAFI).nombre)}</td>
        <td>${escapar(lote.archivo)}</td>
        <td><span class="etiqueta ${TONO_ESTADO_LOTE[lote.estado] ?? ""}">${escapar(ETIQUETA_ESTADO_LOTE[lote.estado] ?? lote.estado)}</span></td>
        <td>${escapar(lote.resumen.texto)}</td>
        <td><button type="button" class="boton sutil" data-lote="${escapar(lote.id)}">Ver</button></td>
      </tr>`
    )
    .join("");
  $("imp-historial").innerHTML = `<h2 class="titulo-seccion">Importaciones anteriores</h2>
    <div class="tabla-envoltorio"><table class="listado">
      <thead><tr><th>Lote</th><th>Subido</th><th>Importación</th><th>Archivo</th><th>Estado</th><th>Filas</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>`;
}

async function subirArchivo(modo) {
  const error = $(`imp-error-${modo}`);
  const archivo = $(`imp-archivo-${modo}`).files[0];
  error.hidden = true;
  if (!archivo) {
    error.textContent = "Elija el archivo de Excel.";
    error.hidden = false;
    return;
  }
  const desde = $(`imp-desde-${modo}`).value.replace(/\D/g, "");
  const datos = new FormData();
  datos.append("archivo", archivo);

  const boton = document.querySelector(`[data-subir="${modo}"]`);
  boton.disabled = true;
  boton.textContent = "Revisando… (consulta SAFI)";
  try {
    const { lote } = await api(`/api/importaciones?modo=${modo}&desde=${encodeURIComponent(desde)}`, {
      method: "POST",
      body: datos,
    });
    $(`imp-archivo-${modo}`).value = "";
    mostrarLote(lote);
    await cargarLotes();
  } catch (fallo) {
    error.textContent = fallo.message;
    error.hidden = false;
  } finally {
    boton.disabled = false;
    boton.textContent = "Revisar el archivo";
  }
}

async function abrirLote(id) {
  try {
    const { lote } = await api(`/api/importaciones/${encodeURIComponent(id)}`);
    mostrarLote(lote);
    $("imp-lote").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (fallo) {
    avisar(fallo.message);
  }
}

/** Dibuja el lote y, si se está creando, sigue su avance. */
function mostrarLote(lote) {
  importacion.lote = lote;
  clearTimeout(importacion.temporizador);
  if (lote.estado === "EN_CURSO") {
    importacion.temporizador = setTimeout(() => void refrescarLote(), 3000);
  }

  const r = lote.resumen;
  const porCrear = r.listas + r.fallidas;
  const puedeEscribir = importacion.sistema ? importacion.sistema.modo === "API" && importacion.sistema.escritura : true;
  const abierto = lote.estado !== "DESCARTADO";
  const enCurso = lote.estado === "EN_CURSO";

  const mensajes = [
    ...(lote.mensajes || []).map(
      (m) => `<div class="aviso-safi${m.tono === "error" ? " bloquea" : ""}">${escapar(m.texto)}</div>`
    ),
    lote.proceso && lote.proceso.motivo && !enCurso
      ? `<div class="aviso-safi${lote.estado === "DETENIDO" ? " bloquea" : ""}"><strong>${escapar(
          lote.estado === "DETENIDO" ? "Se detuvo" : "Resultado"
        )}</strong> ${escapar(lote.proceso.motivo)}</div>`
      : "",
    !puedeEscribir && abierto
      ? `<div class="aviso-safi">La escritura en SAFI no está habilitada: el lote se puede revisar, pero no crear.</div>`
      : "",
  ].join("");

  const acciones = [];
  if (enCurso) {
    acciones.push(`<span class="pista">Creando en SAFI… ${r.creadas} de ${r.creadas + porCrear + r.enCurso} (se actualiza sola).</span>`);
    acciones.push(`<button type="button" class="boton peligro" data-imp="detener">Detener después de la fila en curso</button>`);
  } else if (abierto) {
    if (porCrear > 0 && puedeEscribir) {
      acciones.push(
        `<button type="button" class="boton primario" data-imp="crear">Crear ${porCrear} socio${porCrear === 1 ? "" : "s"} en SAFI</button>`
      );
    }
    if (r.errores + porCrear > 0) {
      acciones.push(`<button type="button" class="boton sutil" data-imp="revisar">Volver a comprobar</button>`);
    }
    if (r.creadas === 0) acciones.push(`<button type="button" class="boton sutil" data-imp="descartar">Descartar</button>`);
  }
  acciones.push(
    `<a class="boton sutil" href="/api/importaciones/${encodeURIComponent(lote.id)}/resultado" download>Descargar resultado (.xlsx)</a>`
  );

  const filas = lote.filas
    .map((fila) => {
      const mensajesFila = [
        ...fila.errores.map((m) => `<li class="texto-peligro">${m.columna ? `<b>${escapar(m.columna)}:</b> ` : ""}${escapar(m.texto)}</li>`),
        ...fila.avisos.map((m) => `<li class="aviso-fila">${m.columna ? `<b>${escapar(m.columna)}:</b> ` : ""}${escapar(m.texto)}</li>`),
        fila.resultado && fila.resultado.mensaje ? `<li class="aviso-fila">${escapar(fila.resultado.mensaje)}</li>` : "",
        fila.tramite
          ? `<li>Trámite <b>${escapar(fila.tramite.codigo)}</b> · <a href="/api/solicitudes/${encodeURIComponent(
              fila.tramite.id
            )}/formulario.pdf" target="_blank" rel="noopener">ver el formulario</a></li>`
          : "",
        fila.resultado && fila.resultado.socioSafiId
          ? `<li class="texto-exito">Cuenta ${escapar(fila.resultado.cuentaSafiId)} · Socio ${escapar(fila.resultado.socioSafiId)}${
              fila.resultado.fichaAutomatica && fila.resultado.fichaAutomatica.completada ? " (se completó la ficha que SAFI crea sola)" : ""
            }</li>`
          : "",
      ].join("");
      const cuota = fila.valorCuota ? `${escapar(fila.suscripcion)} · ${escapar(fila.valorCuota)}` : escapar(fila.suscripcion);
      return `<tr>
        <td>${fila.fila}</td>
        <td><span class="etiqueta ${TONO_ESTADO_FILA[fila.estado] ?? ""}">${escapar(ETIQUETA_ESTADO_FILA[fila.estado] ?? fila.estado)}</span></td>
        <td>${fila.numero ? `<b>${escapar(fila.numero)}</b>${fila.numeroAsignado ? ` <span class="pista">(asignado)</span>` : ""}` : "—"}</td>
        <td>${escapar(fila.cedula)}</td>
        <td>${escapar(fila.nombre)}<div class="pista">${escapar(fila.grado)}</div></td>
        <td>${cuota}<div class="pista">${escapar(fila.formaPago)}${fila.grupoFacturacion ? ` · ${escapar(fila.grupoFacturacion)}` : ""}</div></td>
        <td>${mensajesFila ? `<ul class="mensajes-fila">${mensajesFila}</ul>` : ""}</td>
      </tr>`;
    })
    .join("");

  $("imp-lote").innerHTML = `<div class="tarjeta importacion-lote">
    <div class="tarjeta-cabecera">
      <h3>Lote ${escapar(lote.codigo)} · ${escapar((MODOS[lote.modo] || MODOS.SAFI).nombre)} · ${escapar(lote.archivo)}</h3>
      <span class="etiqueta ${TONO_ESTADO_LOTE[lote.estado] ?? ""}">${escapar(ETIQUETA_ESTADO_LOTE[lote.estado] ?? lote.estado)}</span>
    </div>
    <p class="detalle">Subido por ${escapar(lote.creadaPor)} el ${escapar(fechaHora(lote.creadaEn))} · hoja «${escapar(lote.hoja)}» ·
      revisado el ${escapar(fechaHora(lote.revisadoEn))}${lote.numerarDesde ? ` · números desde el ${escapar(lote.numerarDesde)}` : ""}${
        lote.consultadoEnSafi ? " · comprobado en SAFI" : " · <b>sin comprobar en SAFI</b>"
      }</p>
    <div class="contadores-lote">
      <span><b>${r.filas}</b> filas</span>
      <span class="texto-exito"><b>${r.creadas}</b> creadas</span>
      <span><b>${r.listas}</b> listas</span>
      <span class="texto-peligro"><b>${r.errores}</b> con errores</span>
      ${r.fallidas ? `<span class="texto-peligro"><b>${r.fallidas}</b> fallidas</span>` : ""}
    </div>
    ${mensajes}
    <div class="tarjeta-acciones">${acciones.join("")}</div>
  </div>
  <div class="tabla-envoltorio"><table class="listado tabla-importacion">
    <thead><tr><th>Fila</th><th>Estado</th><th>N.º socio</th><th>Cédula</th><th>Apellidos y nombres</th><th>Cuota · pago</th><th>Detalle</th></tr></thead>
    <tbody>${filas}</tbody>
  </table></div>`;
}

async function refrescarLote() {
  if (!importacion.lote) return;
  try {
    const { lote } = await api(`/api/importaciones/${encodeURIComponent(importacion.lote.id)}`);
    const terminado = importacion.lote.estado === "EN_CURSO" && lote.estado !== "EN_CURSO";
    mostrarLote(lote);
    if (terminado) {
      avisar(lote.estado === "TERMINADO" ? "Importación terminada." : "La importación se detuvo: revise el motivo.");
      await cargarLotes();
    }
  } catch {
    // Un fallo de red momentáneo: se vuelve a intentar.
    importacion.temporizador = setTimeout(() => void refrescarLote(), 5000);
  }
}

async function accionLote(accion) {
  const lote = importacion.lote;
  if (!lote) return;
  const ruta = `/api/importaciones/${encodeURIComponent(lote.id)}`;
  try {
    if (accion === "crear") {
      const r = lote.resumen;
      const porCrear = r.listas + r.fallidas;
      $("imp-confirmar-detalle").innerHTML = `Se crearán en SAFI <b>${porCrear}</b> socio${porCrear === 1 ? "" : "s"}
        (Cuenta y ficha de cada uno), uno por uno.${
          lote.modo === "FORMULARIO"
            ? " Por cada uno se registra además un trámite con su formulario R-PGS1-1, que pasará a Contabilidad."
            : " No se genera formulario."
        }${
          r.errores ? ` Las <b>${r.errores}</b> filas con errores no se crean.` : ""
        } Antes de cada uno se vuelve a comprobar en SAFI que el número y la cédula sigan libres, y al
        primer problema el lote se detiene. Puede tardar varios minutos: puede dejar esta pantalla.`;
      $("dialogo-importacion").showModal();
      return;
    }
    if (accion === "revisar") {
      const campo = $(`imp-desde-${lote.modo}`);
      const desde = (campo ? campo.value.replace(/\D/g, "") : "") || lote.numerarDesde || "";
      const { lote: nuevo } = await api(`${ruta}/revisar`, { method: "POST", body: JSON.stringify({ desde }) });
      mostrarLote(nuevo);
      avisar("Lote comprobado otra vez contra SAFI.");
    }
    if (accion === "detener") {
      const { lote: nuevo } = await api(`${ruta}/detener`, { method: "POST" });
      mostrarLote(nuevo);
      avisar("Se detendrá al terminar la fila en curso.");
    }
    if (accion === "descartar") {
      const { lote: nuevo } = await api(ruta, { method: "DELETE" });
      mostrarLote(nuevo);
      await cargarLotes();
    }
  } catch (fallo) {
    avisar(fallo.message);
  }
}

async function crearEnSafi() {
  const lote = importacion.lote;
  const boton = $("imp-confirmar-aceptar");
  boton.disabled = true;
  try {
    const { lote: nuevo } = await api(`/api/importaciones/${encodeURIComponent(lote.id)}/crear`, { method: "POST" });
    $("dialogo-importacion").close();
    mostrarLote(nuevo);
    await cargarLotes();
  } catch (fallo) {
    $("dialogo-importacion").close();
    avisar(fallo.message);
  } finally {
    boton.disabled = false;
  }
}
