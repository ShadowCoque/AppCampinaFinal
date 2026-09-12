import fs from "node:fs";
import path from "node:path";

/**
 * Localiza la carpeta de la bandeja de tareas.
 *
 * La profundidad relativa cambia entre el contenedor (`/app/dist/server/src` →
 * `/app/web`) y la ejecución local desde el repositorio
 * (`<proyecto>/server/dist/server/src` → `<proyecto>/web`), así que se prueban
 * ambas en lugar de fijar una. De aquí sale también el logotipo que llevan los
 * formularios generados.
 */
export function localizarWeb(): string | null {
  const candidatas = [
    process.env.WEB_DIR,
    path.resolve(__dirname, "../../../web"),
    path.resolve(__dirname, "../../../../web"),
  ].filter((ruta): ruta is string => Boolean(ruta));

  return candidatas.find((ruta) => fs.existsSync(path.join(ruta, "index.html"))) ?? null;
}
