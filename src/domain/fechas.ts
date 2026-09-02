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

/** Fecha y hora legibles a partir de un timestamp ISO completo. */
export function formatFechaHora(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "—";
  const fecha = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  const hora = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
