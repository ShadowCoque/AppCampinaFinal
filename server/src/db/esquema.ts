/**
 * Esquema de la base de datos.
 *
 * SQLite en un único archivo: respaldar el sistema es copiar ese archivo junto
 * con el directorio de expedientes. Para el volumen del Club —del orden de
 * doscientas afiliaciones al año— es holgadamente suficiente, y evita mantener
 * un motor de base de datos adicional en el servidor de la mesa de ayuda.
 *
 * El documento completo de cada solicitud se guarda como JSON en la columna
 * `documento`: es la misma estructura `SolicitudAfiliacion` que maneja la
 * aplicación móvil, de modo que no hay traducción entre dos modelos. Las
 * columnas sueltas existen solo para poder consultar y ordenar sin abrir el
 * JSON.
 */

export const ESQUEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS usuarios (
  id           TEXT PRIMARY KEY,
  usuario      TEXT NOT NULL UNIQUE,
  nombre       TEXT NOT NULL,
  area         TEXT NOT NULL CHECK (area IN ('SOCIOS','CONTABILIDAD','GERENCIA')),
  clave_hash   TEXT NOT NULL,
  clave_sal    TEXT NOT NULL,
  activo       INTEGER NOT NULL DEFAULT 1,
  creado_en    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sesiones (
  id         TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creada_en  TEXT NOT NULL,
  expira_en  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS solicitudes (
  id             TEXT PRIMARY KEY,
  codigo         TEXT NOT NULL UNIQUE,
  estado         TEXT NOT NULL,
  numero_socio   TEXT,
  cedula         TEXT NOT NULL,
  nombre         TEXT NOT NULL,
  tipo_miembro   TEXT,
  creada_en      TEXT NOT NULL,
  actualizada_en TEXT NOT NULL,
  documento      TEXT NOT NULL,
  /* 1 mientras la solicitud genere alguna tarea en cualquier bandeja. Lo
     calcula el propio dominio al guardar, de modo que la bandeja no tenga que
     recorrer el histórico completo para saber qué está pendiente. */
  requiere_atencion INTEGER NOT NULL DEFAULT 1
);

/* Un archivo del repositorio digital, venga de la aplicación o del escáner. */
CREATE TABLE IF NOT EXISTS archivos (
  id                  TEXT PRIMARY KEY,
  solicitud_id        TEXT REFERENCES solicitudes(id) ON DELETE SET NULL,
  numero_socio        TEXT NOT NULL,
  ordinal_dependiente INTEGER,
  nombre_persona      TEXT NOT NULL,
  tipo_documento      TEXT NOT NULL,
  nombre_archivo      TEXT NOT NULL,
  ruta                TEXT NOT NULL,
  bytes               INTEGER NOT NULL DEFAULT 0,
  origen              TEXT NOT NULL CHECK (origen IN ('APP','ESCANEO')),
  registrado_en       TEXT NOT NULL,
  safi_estado         TEXT NOT NULL DEFAULT 'PENDIENTE',
  safi_mensaje        TEXT,
  safi_actualizado_en TEXT,
  safi_intentos       INTEGER NOT NULL DEFAULT 0
);

/* Archivos depositados con un nombre que el repositorio no supo clasificar. */
CREATE TABLE IF NOT EXISTS incidencias (
  id           TEXT PRIMARY KEY,
  archivo      TEXT NOT NULL,
  motivo       TEXT NOT NULL,
  detalle      TEXT NOT NULL,
  numero_socio TEXT,
  detectada_en TEXT NOT NULL,
  resuelta_en  TEXT
);

/* Bitácora de toda actuación sobre un expediente, exigida por la LOPDP. */
CREATE TABLE IF NOT EXISTS bitacora (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  en       TEXT NOT NULL,
  usuario  TEXT,
  area     TEXT,
  accion   TEXT NOT NULL,
  entidad  TEXT,
  detalle  TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`;

/**
 * Índices, en un script aparte.
 *
 * Se crean DESPUÉS de las migraciones: un índice sobre una columna que todavía
 * no existe aborta el script entero y deja la base a medio abrir, que es
 * exactamente lo que ocurría al añadir `requiere_atencion` sobre una base ya
 * en producción.
 */
export const INDICES_SQL = `
CREATE INDEX IF NOT EXISTS idx_sesiones_expira ON sesiones(expira_en);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes(estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_socio  ON solicitudes(numero_socio);
CREATE INDEX IF NOT EXISTS idx_solicitudes_cedula ON solicitudes(cedula);
CREATE INDEX IF NOT EXISTS idx_solicitudes_atencion ON solicitudes(requiere_atencion);
CREATE INDEX IF NOT EXISTS idx_solicitudes_actualizada ON solicitudes(actualizada_en DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_archivos_ruta ON archivos(ruta);
CREATE INDEX IF NOT EXISTS idx_archivos_socio ON archivos(numero_socio, ordinal_dependiente);
CREATE INDEX IF NOT EXISTS idx_archivos_safi  ON archivos(safi_estado);
CREATE INDEX IF NOT EXISTS idx_incidencias_abiertas ON incidencias(resuelta_en);
CREATE INDEX IF NOT EXISTS idx_bitacora_en ON bitacora(en);
`;

/** Versión del esquema. Al subirla, añada la migración correspondiente. */
export const VERSION_ESQUEMA = 2;

/**
 * Migraciones para bases creadas con una versión anterior.
 *
 * Se aplican en orden y deben poder ejecutarse sobre una base ya migrada sin
 * causar daño: el índice es la versión desde la que se migra.
 */
export const MIGRACIONES: { desde: number; sql: string }[] = [
  {
    desde: 1,
    sql: "ALTER TABLE solicitudes ADD COLUMN requiere_atencion INTEGER NOT NULL DEFAULT 1;",
  },
];
