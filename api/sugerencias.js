import { addSuggestion, listSuggestions, updateSuggestion, deleteSuggestion } from "../lib/store.js";
import { send, fail, readJson, requireAdmin, sameOrigin, cleanText, cleanUrl } from "../lib/http.js";

const TIPOS = ["Enlace nuevo", "Enlace roto", "Comentario"];
const ESTADOS = ["nueva", "leida", "archivada"];

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      if (!sameOrigin(req)) return fail(res, 403, "Petición rechazada.");
      const body = await readJson(req, 5000);
      // Campo trampa: los bots lo llenan, las personas no lo ven
      if (body.sitio_web) return send(res, 200, { ok: true });
      const msg = cleanText(body.msg, 1000);
      if (msg.length < 5) return fail(res, 400, "Escribe tu mensaje antes de enviarlo.");
      const url = body.url ? cleanUrl(body.url) : "";
      if (body.url && !url) return fail(res, 400, "El enlace debe empezar con https:// o http://.");
      await addSuggestion({
        tipo: TIPOS.includes(body.tipo) ? body.tipo : "Comentario",
        msg,
        url,
        contacto: cleanText(body.contacto, 120),
        fecha: new Date().toISOString(),
        estado: "nueva",
      });
      return send(res, 201, { ok: true });
    }

    if (!requireAdmin(req, res)) return;

    if (req.method === "GET") {
      const items = await listSuggestions();
      return send(res, 200, { items, nuevas: items.filter((s) => s.estado === "nueva").length });
    }
    if (req.method === "PATCH") {
      const body = await readJson(req);
      if (!ESTADOS.includes(body.estado)) return fail(res, 400, "Estado no válido.");
      const item = await updateSuggestion(String(body.id), { estado: body.estado });
      if (!item) return fail(res, 404, "Esa sugerencia ya no existe.");
      return send(res, 200, { ok: true, item });
    }
    if (req.method === "DELETE") {
      const id = String(req.query?.id || new URL(req.url, "http://x").searchParams.get("id") || "");
      await deleteSuggestion(id);
      return send(res, 200, { ok: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return fail(res, 405, "Método no permitido.");
  } catch (e) {
    if (e.status) return fail(res, e.status, "La petición no es válida.");
    console.error(e);
    return fail(res, 500, "No se pudo completar. Intenta de nuevo.");
  }
}
