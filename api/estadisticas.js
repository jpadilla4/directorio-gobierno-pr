import { getStats, enabled } from "../lib/analytics.js";
import { send, fail, requireAdmin } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return fail(res, 405, "Método no permitido.");
  }
  if (!requireAdmin(req, res)) return;
  if (!enabled()) return fail(res, 503, "Las estadísticas todavía no están conectadas a Turso. Añade TURSO_DATABASE_URL y TURSO_AUTH_TOKEN en Vercel.");
  const q = Number(req.query?.days || new URL(req.url, "http://x").searchParams.get("days"));
  const days = [7, 30, 90].includes(q) ? q : 30;
  try {
    return send(res, 200, await getStats(days));
  } catch (e) {
    console.error(e);
    return fail(res, 500, "No se pudieron cargar las estadísticas. Revisa la conexión con Turso.");
  }
}
