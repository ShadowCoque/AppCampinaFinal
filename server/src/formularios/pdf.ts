import type { Browser } from "puppeteer-core";

import { config } from "../config";

/**
 * Impresión del formulario en PDF.
 *
 * El documento se compone en HTML —el mismo código que usa la tableta— y se
 * imprime con Chromium, que es también el motor con el que la tableta lo
 * imprime: el PDF que se archiva es el mismo documento que se vio en pantalla.
 *
 * Se lanza un navegador por trabajo y se cierra al terminar. Es algo más lento
 * que mantenerlo abierto, pero este servidor comparte máquina con la mesa de
 * ayuda del Club y un Chromium residente son 150 MB ocupados todo el día para
 * imprimir tres formularios a la semana.
 *
 * Si no hay navegador instalado, el sistema sigue funcionando: la bandeja
 * muestra el formulario en pantalla, la tarea avisa de que falta archivarlo y
 * la Jefatura puede guardarlo como PDF desde el navegador. Ver
 * `FORMULARIO_FINAL_PENDIENTE` en `domain/tareas.ts`.
 */

export function pdfDisponible(): boolean {
  return Boolean(config.pdfNavegador);
}

/** Un trabajo a la vez: dos Chromium simultáneos en este servidor, no. */
let cola: Promise<unknown> = Promise.resolve();

function enCola<T>(trabajo: () => Promise<T>): Promise<T> {
  const resultado = cola.then(trabajo, trabajo);
  cola = resultado.catch(() => undefined);
  return resultado;
}

export async function generarPdf(html: string): Promise<Buffer> {
  if (!config.pdfNavegador) {
    throw new Error(
      "No hay navegador para imprimir el PDF. Instale Chromium en el contenedor o indique PDF_NAVEGADOR."
    );
  }

  return enCola(async () => {
    // Se carga aquí y no arriba para que el servidor arranque igual en un
    // despliegue sin la dependencia instalada.
    const puppeteer = (await import("puppeteer-core")).default;

    let navegador: Browser | null = null;
    try {
      navegador = await puppeteer.launch({
        executablePath: config.pdfNavegador,
        headless: true,
        // `--no-sandbox` es necesario dentro del contenedor, que ya corre como
        // usuario sin privilegios y con `no-new-privileges`. El HTML que se
        // imprime lo genera este mismo servidor y no carga nada de la red.
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-extensions",
          "--font-render-hinting=none",
        ],
        timeout: 60_000,
        protocolTimeout: 120_000,
      });

      const pagina = await navegador.newPage();
      // El formulario es HTML estático con imágenes incrustadas: no necesita
      // JavaScript ni salir a la red, y así no puede hacerlo.
      await pagina.setJavaScriptEnabled(false);
      await pagina.setRequestInterception(true);
      pagina.on("request", (peticion) => {
        const url = peticion.url();
        if (url.startsWith("data:") || url === "about:blank") void peticion.continue();
        else void peticion.abort();
      });

      await pagina.setContent(html, { waitUntil: "load", timeout: 30_000 });
      const pdf = await pagina.pdf({
        format: "A4",
        printBackground: true,
        // El propio documento declara `@page { size: A4; margin: 12mm 11mm }`.
        preferCSSPageSize: true,
      });

      return Buffer.from(pdf);
    } finally {
      await navegador?.close().catch(() => undefined);
    }
  });
}
