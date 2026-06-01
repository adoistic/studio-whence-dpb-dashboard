import { onRequest } from "firebase-functions/v2/https";

/**
 * dataApi — the gatekeeper Cloud Function for the gated data backbone.
 *
 * This is a scaffold stub: it returns 404 for every route. Later tasks add
 * path-safety (keys.ts), auth (token verify + allowlist), the R2 presigner
 * (r2.ts), and wire real routes (/resolve, /read, …) into this handler.
 */
export const dataApi = onRequest((req, res) => {
  res.status(404).json({ error: "not found" });
});
