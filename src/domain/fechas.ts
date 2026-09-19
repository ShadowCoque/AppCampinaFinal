const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Convierte un `Date` a `AAAA-MM-DD` usando la fecha local (no UTC). */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Convierte `AAAA-MM-DD` a `Date` local.
 * Se construye componente a componente para evitar el desfase de un día
 * que produce `new Date("2000-01-01")`, que se interpreta como UTC.
 */
export function isoToDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `1990-05-04` → `04/05/1990`. */
export function formatFechaCorta(iso: string): string {
  const date = isoToDate(iso);
  if (!date) return "—";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

/** `1990-05-04` → `4 de mayo de 1990`. */
export function formatFechaLarga(iso: string): string {
  const date = isoToDate(iso);
  if (!date) return "—";
  return `${date.getDate()} de ${MESES[date.getMonth()]} de ${date.getFullYear()}`;
}

/**
 * Diferencia del Ecuador continental con UTC. El país no aplica horario de
 * verano, así que es fija.
 */
const DESFASE_ECUADOR_MS = -5 * 60 * 60 * 1000;

/**
 * Fecha y hora legibles, **en hora del Ecuador**, a partir de un timestamp ISO
 * completo: `16/09/2026 · 19:42`.
 *
 * No depende de la zona horaria del equipo que la imprime. La tableta está en
 * hora del Ecuador, pero el servidor corre en un contenedor, y un contenedor
 * sin su zona configurada imprimía la hora de Greenwich —cinco horas más— en
 * el reverso del formulario.
 */
export function formatFechaHora(isoTimestamp: string): string {
  const instante = new Date(isoTimestamp).getTime();
  if (Number.isNaN(instante)) return "—";
  const local = new Date(instante + DESFASE_ECUADOR_MS);
  const fecha = `${String(local.getUTCDate()).padStart(2, "0")}/${String(local.getUTCMonth() + 1).padStart(2, "0")}/${local.getUTCFullYear()}`;
  const hora = `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
  return `${fecha} · ${hora}`;
}

/** Edad cumplida a la fecha indicada (por defecto, hoy). */
export function calcularEdad(iso: string, hasta = new Date()): number | null {
  const nacimiento = isoToDate(iso);
  if (!nacimiento) return null;
  let edad = hasta.getFullYear() - nacimiento.getFullYear();
  const mes = hasta.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && hasta.getDate() < nacimiento.getDate())) edad -= 1;
  return edad;
}
