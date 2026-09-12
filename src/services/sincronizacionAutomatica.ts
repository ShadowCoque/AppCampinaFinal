import { useEffect } from "react";
import { AppState } from "react-native";

import { sincronizar } from "./servidor";

/**
 * Sincronización automática de la tableta con el servidor.
 *
 * Antes, lo registrado solo llegaba al servidor si alguien entraba en
 * «Configuración y envío» y pulsaba «Sincronizar ahora»; mientras tanto la
 * afiliación no existía para Contabilidad ni para la Gerencia, aunque la
 * tableta la mostrara como registrada. Ahora se envía sola: al abrir la
 * aplicación, al volver a ella y cada pocos minutos mientras está en uso.
 */

const INTERVALO_MS = 2 * 60_000;

export function useSincronizacionAutomatica(): void {
  useEffect(() => {
    let temporizador: ReturnType<typeof setInterval> | null = null;

    const intentar = () => {
      // El resultado queda guardado para el aviso del portal; aquí no se
      // interrumpe al operador con alertas.
      void sincronizar().catch((error) => console.warn("[sincronizacion]", error));
    };

    const iniciar = () => {
      intentar();
      if (!temporizador) temporizador = setInterval(intentar, INTERVALO_MS);
    };

    const detener = () => {
      if (temporizador) clearInterval(temporizador);
      temporizador = null;
    };

    iniciar();
    const suscripcion = AppState.addEventListener("change", (estado) => {
      if (estado === "active") iniciar();
      else detener();
    });

    return () => {
      detener();
      suscripcion.remove();
    };
  }, []);
}
