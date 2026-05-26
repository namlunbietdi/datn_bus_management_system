import { Router } from "express";
import { getEspRouteMetadata } from "../services/espRouteConfigService.js";
import asyncHandler from "../utils/asyncHandler.js";
import { AppError } from "../utils/errors.js";

const router = Router();

function assertDownloadToken(req) {
  const token = process.env.ESP_ROUTE_DOWNLOAD_TOKEN;
  if (!token) return;
  if (req.query.token !== token) throw new AppError("Invalid ESP route download token", 403);
}

router.get("/routes/:routeCode.json", asyncHandler(async (req, res) => {
  assertDownloadToken(req);
  const { jsonString, checksum, size, version } = await getEspRouteMetadata(req.params.routeCode);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Route-Version", version);
  res.setHeader("X-Route-Size", String(size));
  res.setHeader("X-Route-Checksum", checksum);
  res.send(jsonString);
}));

export default router;
