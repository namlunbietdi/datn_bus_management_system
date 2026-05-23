import { buildRouteConfig, buildRouteManifest } from "../services/routeExportService.js";
import { AppError } from "../utils/errors.js";

function requireDeviceToken(req) {
  const expected = process.env.DEVICE_UPDATE_TOKEN;
  if (!expected) return;

  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  const token = req.headers["x-device-token"] || bearer || req.query.token;
  if (token !== expected) throw new AppError("Invalid device update token", 401);
}

export async function routeConfig(req, res) {
  requireDeviceToken(req);
  const config = await buildRouteConfig(req.params.routeCode);
  res.json(config);
}

export async function routeManifest(req, res) {
  requireDeviceToken(req);
  res.json(await buildRouteManifest());
}
