import { record, enabled } from "../lib/analytics.js";
import { isAdmin } from "../lib/auth.js";
import { readJson, sameOrigin, fail } from "../lib/http.js";

// Registra visitas y búsquedas del sitio público. Siempre responde 204 para no revelar nada.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, 405, "Método no permitido.");
  }
  try {
    if (enabled() && sameOrigin(req) && !isAdmin(req)) {
      const body = await readJson(req, 2000);
      await record(req, body);
    }
  } catch (e) {
    console.error("track", e.message);
  }
  res.statusCode = 204;
  res.setHeader("Cache-Control", "no-store");
  res.end();
}
